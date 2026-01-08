import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, runTransaction } from "firebase/firestore"
import { getUTCDateString, getUTCDateStringFromTimestamp, isSameUTCDay } from "./date-utils"
import { eventBus, QuestEvent } from "./event-bus"
import { awardXP, XPAwardResult } from "./xp-utils"

export type QuestType = 
  | "complete_lesson" 
  | "pass_module_quiz" 
  | "perfect_score" 
  | "interaction_streak" 
  | "review_quiz" 
  | "finish_course"
  | "send_challenge" 
  | "win_challenge" 
  | "place_bet" 
  | "visit_leaderboard"
  | "chat_hint" 
  | "generate_course" 
  | "add_library" 
  | "visit_shop" 
  | "check_stats"

export interface Quest {
  id: string
  type: QuestType
  category: "learning" | "social" | "economy"
  title: string
  description: string
  target: number
  progress: number
  completed: boolean
  claimed: boolean
  xpReward: number
  nexonReward: number
}

export interface DailyQuests {
  userId: string
  quests: Quest[]
  lastResetDate: string // YYYY-MM-DD UTC
  refreshTokens: number // 0-3
  lastRefreshTokenReset: string // YYYY-MM-DD UTC
  updatedAt: any
}

// Quest pool definitions
export const QUEST_POOL: Omit<Quest, "progress" | "completed" | "claimed">[] = [
  // --- LEARNING (Category: 'learning') ---
  { id: "complete_lesson", type: "complete_lesson", category: "learning", title: "Stream Surfer", description: "Complete 2 Interactive Lessons.", target: 2, xpReward: 30, nexonReward: 10 },
  { id: "pass_module_quiz", type: "pass_module_quiz", category: "learning", title: "Checkpoint Cleared", description: "Pass a Module Quiz with a score > 60%.", target: 1, xpReward: 50, nexonReward: 25 },
  { id: "perfect_score", type: "perfect_score", category: "learning", title: "Grade S Hunter", description: "Achieve 100% on any Module Quiz or Final Exam.", target: 1, xpReward: 100, nexonReward: 50 },
  { id: "interaction_streak", type: "interaction_streak", category: "learning", title: "Combo Master", description: "Get 5 correct answers in a row inside a Lesson.", target: 5, xpReward: 20, nexonReward: 15 },
  { id: "review_quiz", type: "review_quiz", category: "learning", title: "Memory Refresh", description: "Review a past quiz result.", target: 1, xpReward: 15, nexonReward: 5 },
  { id: "finish_course", type: "finish_course", category: "learning", title: "Certified Expert", description: "Complete a Final Exam for a course.", target: 1, xpReward: 100, nexonReward: 50 },
  // --- SOCIAL (Category: 'social') ---
  { id: "send_challenge", type: "send_challenge", category: "social", title: "The Duelist", description: "Send a 1v1 Challenge invitation.", target: 1, xpReward: 20, nexonReward: 15 },
  { id: "win_challenge", type: "win_challenge", category: "social", title: "Victory Road", description: "Win a 1v1 Challenge.", target: 1, xpReward: 50, nexonReward: 40 },
  { id: "place_bet", type: "place_bet", category: "social", title: "High Stakes", description: "Join a Challenge with a bet of 50+ Nexon.", target: 1, xpReward: 30, nexonReward: 5 },
  { id: "visit_leaderboard", type: "visit_leaderboard", category: "social", title: "Scout Report", description: "Check the Global or Friends Leaderboard.", target: 1, xpReward: 10, nexonReward: 5 },
  // --- ECONOMY & AI (Category: 'economy') ---
  { id: "chat_hint", type: "chat_hint", category: "economy", title: "Curious Mind", description: "Ask NexusBot for a hint.", target: 1, xpReward: 10, nexonReward: 5 },
  { id: "generate_course", type: "generate_course", category: "economy", title: "The Architect", description: "Generate a new Course with AI.", target: 1, xpReward: 20, nexonReward: 10 },
  { id: "add_library", type: "add_library", category: "economy", title: "Course Collector", description: "Add a new course to your Journey.", target: 1, xpReward: 15, nexonReward: 10 },
  { id: "visit_shop", type: "visit_shop", category: "economy", title: "Window Shopper", description: "Visit the Cosmetic Shop.", target: 1, xpReward: 10, nexonReward: 5 },
  { id: "check_stats", type: "check_stats", category: "economy", title: "Self Reflection", description: "Visit your Profile page to check your progress and badges.", target: 1, xpReward: 15, nexonReward: 15 }
]

/**
 * Get 3 random quests from the pool using balanced selection algorithm
 */
function generateRandomQuests(): Quest[] {
  const learningQuests = QUEST_POOL.filter(q => q.category === "learning")
  const socialQuests = QUEST_POOL.filter(q => q.category === "social")
  const economyQuests = QUEST_POOL.filter(q => q.category === "economy")
  
  const selectedQuests: any[] = []
  
  // Quest 1: Random from learningQuests
  const q1 = learningQuests[Math.floor(Math.random() * learningQuests.length)]
  selectedQuests.push(q1)
  
  // Quest 2: Random from socialQuests OR economyQuests
  const socialEconomyPool = [...socialQuests, ...economyQuests]
  const q2 = socialEconomyPool[Math.floor(Math.random() * socialEconomyPool.length)]
  selectedQuests.push(q2)
  
  // Quest 3: Random from the entire remaining pool (Wildcard)
  const remainingPool = QUEST_POOL.filter(q => !selectedQuests.some(sq => sq.id === q.id))
  const q3 = remainingPool[Math.floor(Math.random() * remainingPool.length)]
  selectedQuests.push(q3)
  
  return selectedQuests.map((q) => ({
    ...q,
    progress: 0,
    completed: false,
    claimed: false,
  }))
}

/**
 * Check if quests need to be reset (new UTC day)
 */
function shouldResetQuests(lastResetDate: string): boolean {
  const todayUTC = getUTCDateString()
  return lastResetDate !== todayUTC
}

/**
 * Check if refresh tokens need to be reset (new UTC day)
 */
function shouldResetRefreshTokens(lastRefreshTokenReset: string): boolean {
  const todayUTC = getUTCDateString()
  return lastRefreshTokenReset !== todayUTC
}

/**
 * Get or create user's daily quests
 */
export async function getUserDailyQuests(userId: string): Promise<DailyQuests> {
  try {
    const questsRef = doc(db, "dailyQuests", userId)
    const questsDoc = await getDoc(questsRef)

    const todayUTC = getUTCDateString()

    if (!questsDoc.exists()) {
      // Create new quests for today
      const newQuests: DailyQuests = {
        userId,
        quests: generateRandomQuests(),
        lastResetDate: todayUTC,
        refreshTokens: 3,
        lastRefreshTokenReset: todayUTC,
        updatedAt: serverTimestamp(),
      }
      await setDoc(questsRef, newQuests)
      return newQuests
    }

    const data = questsDoc.data() as DailyQuests

    // Check if we need to reset quests (new UTC day)
    if (shouldResetQuests(data.lastResetDate)) {
      // Reset all quests
      const newQuests = generateRandomQuests()
      const updateData: Partial<DailyQuests> = {
        quests: newQuests,
        lastResetDate: todayUTC,
        updatedAt: serverTimestamp(),
      }

      // Also reset refresh tokens if needed
      if (shouldResetRefreshTokens(data.lastRefreshTokenReset)) {
        updateData.refreshTokens = 3
        updateData.lastRefreshTokenReset = todayUTC
      }

      await updateDoc(questsRef, updateData)
      return {
        ...data,
        ...updateData,
        quests: newQuests,
      } as DailyQuests
    }

    // Reset refresh tokens if needed (but not quests)
    if (shouldResetRefreshTokens(data.lastRefreshTokenReset)) {
      await updateDoc(questsRef, {
        refreshTokens: 3,
        lastRefreshTokenReset: todayUTC,
        updatedAt: serverTimestamp(),
      })
      return {
        ...data,
        refreshTokens: 3,
        lastRefreshTokenReset: todayUTC,
      }
    }

    return data
  } catch (error) {
    console.error("Error getting daily quests:", error)
    throw new Error("Failed to get daily quests")
  }
}

/**
 * Update quest progress based on event
 */
async function updateQuestProgress(
  userId: string,
  questType: QuestType,
  metadata: QuestEvent["metadata"]
): Promise<void> {
  try {
    const questsRef = doc(db, "dailyQuests", userId)
    
    // Use transaction to prevent race conditions when multiple events occur simultaneously
    await runTransaction(db, async (transaction) => {
      const questsDoc = await transaction.get(questsRef)
      if (!questsDoc.exists()) return

      const data = questsDoc.data() as DailyQuests
      const quest = data.quests.find((q) => q.type === questType && !q.completed)

      if (!quest) return

      // Update progress based on quest type
      let newProgress = quest.progress

      switch (questType) {
        case "complete_lesson":
        case "pass_module_quiz":
        case "perfect_score":
        case "review_quiz":
        case "finish_course":
        case "send_challenge":
        case "win_challenge":
        case "place_bet":
        case "visit_leaderboard":
        case "chat_hint":
        case "generate_course":
        case "add_library":
        case "visit_shop":
        case "check_stats":
          newProgress = quest.progress + 1
          break
        case "interaction_streak":
          // Special case for streak: reset if metadata says so, or increment
          if (metadata.isReset) {
            newProgress = 0
          } else {
            newProgress = quest.progress + 1
          }
          break
      }

      const updatedQuests = data.quests.map((q) => {
        if (q.id === quest.id) {
          const completed = newProgress >= q.target
          return {
            ...q,
            progress: Math.min(newProgress, q.target),
            completed,
          }
        }
        return q
      })

      transaction.update(questsRef, {
        quests: updatedQuests,
        updatedAt: serverTimestamp(),
      })
    })
  } catch (error) {
    console.error("Error updating quest progress:", error)
  }
}

/**
 * Claim quest reward (award XP)
 */
export async function claimQuestReward(userId: string, questId: string): Promise<XPAwardResult | null> {
  try {
    const questsRef = doc(db, "dailyQuests", userId)
    const questsDoc = await getDoc(questsRef)

    if (!questsDoc.exists()) {
      return null
    }

    const data = questsDoc.data() as DailyQuests
    const quest = data.quests.find((q) => q.id === questId)

    if (!quest || !quest.completed || quest.claimed) {
      return null // Quest not found, not completed, or already claimed
    }

    // Award XP
    const result = await awardXP(
      userId,
      quest.xpReward,
      "Daily Quest",
      `Completed quest: ${quest.title}`,
      { questId, questType: quest.type, isReward: true, source: "Daily Quest" }
    )

    // Award Nexon
    const { awardNexon } = await import("./nexon-utils")
    const nexonReward = quest.nexonReward || 25 // Fallback for old quests
    await awardNexon(userId, nexonReward, "Daily Quest", `Completed quest: ${quest.title}`, { questId, questType: quest.type }).catch((error) => {
      console.error("Error awarding Nexon for daily quest:", error)
      // Don't throw - Nexon failure shouldn't block quest claim
    })

    // Mark quest as claimed
    const updatedQuests = data.quests.map((q) => {
      if (q.id === questId) {
        return { ...q, claimed: true }
      }
      return q
    })

    await updateDoc(questsRef, {
      quests: updatedQuests,
      updatedAt: serverTimestamp(),
    })

    return result
  } catch (error) {
    console.error("Error claiming quest reward:", error)
    return null
  }
}

/**
 * Refresh a quest (replace with new random quest)
 */
export async function refreshQuest(userId: string, questId: string): Promise<boolean> {
  try {
    const questsRef = doc(db, "dailyQuests", userId)
    const questsDoc = await getDoc(questsRef)

    if (!questsDoc.exists()) {
      return false
    }

    const data = questsDoc.data() as DailyQuests

    if (data.refreshTokens <= 0) {
      return false // No refresh tokens available
    }

    // Find the quest to replace
    const questIndex = data.quests.findIndex((q) => q.id === questId)
    if (questIndex === -1) {
      return false
    }

    // Get available quests (not already in use)
    const usedTypes = data.quests.map((q) => q.type)
    const availableQuests = QUEST_POOL.filter((q) => !usedTypes.includes(q.type))

    if (availableQuests.length === 0) {
      return false // No available quests
    }

    // Pick random available quest
    const newQuest = availableQuests[Math.floor(Math.random() * availableQuests.length)]
    const updatedQuests = [...data.quests]
    updatedQuests[questIndex] = {
      ...newQuest,
      progress: 0,
      completed: false,
      claimed: false,
    }

    await updateDoc(questsRef, {
      quests: updatedQuests,
      refreshTokens: data.refreshTokens - 1,
      updatedAt: serverTimestamp(),
    })

    return true
  } catch (error) {
    console.error("Error refreshing quest:", error)
    return false
  }
}

/**
 * Track quest progress by emitting events
 * Use this in components to trigger quest updates
 */
export function trackQuestProgress(userId: string, type: QuestType, metadata: any = {}): void {
  const eventMap: Record<QuestType, string> = {
    complete_lesson: "quest.lesson_completed",
    pass_module_quiz: "quest.quiz_completed",
    perfect_score: "quest.quiz_completed",
    interaction_streak: "quest.interaction_streak",
    review_quiz: "quest.review_quiz",
    finish_course: "quest.quiz_completed",
    send_challenge: "quest.send_challenge",
    win_challenge: "quest.win_challenge",
    place_bet: "quest.send_challenge",
    visit_leaderboard: "quest.visit_leaderboard",
    chat_hint: "quest.chat_hint",
    generate_course: "quest.generate_course",
    add_library: "quest.add_library",
    visit_shop: "quest.visit_shop",
    check_stats: "quest.check_stats",
  }

  const eventName = eventMap[type]
  if (eventName) {
    eventBus.emit({ 
      type: eventName as any, 
      userId, 
      metadata: { ...metadata, type } 
    })
  }
}

/**
 * Initialize quest event listeners
 * Call this once when the app starts
 */
export function initializeQuestEventListeners(): void {
  // Lesson completed
  eventBus.subscribe("quest.lesson_completed", async (event) => {
    await updateQuestProgress(event.userId, "complete_lesson", event.metadata)
  })

  // Quiz completed (Module or Course)
  eventBus.subscribe("quest.quiz_completed", async (event) => {
    const { score, maxScore, quizType } = event.metadata
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0

    if (quizType === "module" && percentage >= 60) {
      await updateQuestProgress(event.userId, "pass_module_quiz", event.metadata)
    }

    if (percentage === 100) {
      await updateQuestProgress(event.userId, "perfect_score", event.metadata)
    }

    if (quizType === "course") {
      await updateQuestProgress(event.userId, "finish_course", event.metadata)
    }
  })

  // Interaction streak (lesson)
  eventBus.subscribe("quest.interaction_streak", async (event) => {
    await updateQuestProgress(event.userId, "interaction_streak", event.metadata)
  })

  // Review quiz history
  eventBus.subscribe("quest.review_quiz", async (event) => {
    await updateQuestProgress(event.userId, "review_quiz", event.metadata)
  })

  // Challenge sent
  eventBus.subscribe("quest.send_challenge", async (event) => {
    await updateQuestProgress(event.userId, "send_challenge", event.metadata)
    
    if (event.metadata.betAmount && event.metadata.betAmount >= 50) {
      await updateQuestProgress(event.userId, "place_bet", event.metadata)
    }
  })

  // Challenge won
  eventBus.subscribe("quest.win_challenge", async (event) => {
    await updateQuestProgress(event.userId, "win_challenge", event.metadata)
  })

  // Visit leaderboard
  eventBus.subscribe("quest.visit_leaderboard", async (event) => {
    await updateQuestProgress(event.userId, "visit_leaderboard", event.metadata)
  })

  // Ask AI for hint
  eventBus.subscribe("quest.chat_hint", async (event) => {
    await updateQuestProgress(event.userId, "chat_hint", event.metadata)
  })

  // Generate course
  eventBus.subscribe("quest.generate_course", async (event) => {
    await updateQuestProgress(event.userId, "generate_course", event.metadata)
  })

  // Add course to library
  eventBus.subscribe("quest.add_library", async (event) => {
    await updateQuestProgress(event.userId, "add_library", event.metadata)
  })

  // Visit shop
  eventBus.subscribe("quest.visit_shop", async (event) => {
    await updateQuestProgress(event.userId, "visit_shop", event.metadata)
  })

  // Check profile/stats
  eventBus.subscribe("quest.check_stats", async (event) => {
    await updateQuestProgress(event.userId, "check_stats", event.metadata)
  })
}

