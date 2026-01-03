import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { getUTCDateString, getUTCDateStringFromTimestamp, isSameUTCDay } from "./date-utils"
import { eventBus, QuestEvent } from "./event-bus"
import { awardXP, XPAwardResult } from "./xp-utils"

export type QuestType = "complete_module" | "complete_quiz" | "rate_course" | "earn_xp" | "add_course"

export interface Quest {
  id: string
  type: QuestType
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
const QUEST_POOL: Omit<Quest, "progress" | "completed" | "claimed">[] = [
  {
    id: "complete_module",
    type: "complete_module",
    title: "Module Master",
    description: "Complete 1 module",
    target: 1,
    xpReward: 30,
    nexonReward: 25,
  },
  {
    id: "complete_quiz",
    type: "complete_quiz",
    title: "Quiz Champion",
    description: "Complete 1 quiz",
    target: 1,
    xpReward: 25,
    nexonReward: 25,
  },
  {
    id: "rate_course",
    type: "rate_course",
    title: "Course Critic",
    description: "Rate a course 4+ stars",
    target: 1,
    xpReward: 20,
    nexonReward: 25,
  },
  {
    id: "earn_xp",
    type: "earn_xp",
    title: "XP Collector",
    description: "Earn 50 XP from any source",
    target: 50,
    xpReward: 15,
    nexonReward: 25,
  },
  {
    id: "add_course",
    type: "add_course",
    title: "Course Collector",
    description: "Add a course to your library",
    target: 1,
    xpReward: 35,
    nexonReward: 25,
  },
]

/**
 * Get 3 random quests from the pool
 */
function generateRandomQuests(): Quest[] {
  const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, 3)
  return selected.map((q) => ({
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
    const questsDoc = await getDoc(questsRef)

    if (!questsDoc.exists()) {
      return // No quests yet
    }

    const data = questsDoc.data() as DailyQuests
    const quest = data.quests.find((q) => q.type === questType && !q.completed)

    if (!quest) {
      return // Quest not found or already completed
    }

    // Update progress based on quest type
    let newProgress = quest.progress

    switch (questType) {
      case "complete_module":
      case "complete_quiz":
      case "rate_course":
      case "add_course":
        newProgress = quest.progress + 1
        break
      case "earn_xp":
        newProgress = quest.progress + (metadata.xpAmount || 0)
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

    await updateDoc(questsRef, {
      quests: updatedQuests,
      updatedAt: serverTimestamp(),
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
      { questId, questType: quest.type }
    )

    // Award Nexon
    const { awardNexon } = await import("./nexon-utils")
    await awardNexon(userId, quest.nexonReward, "Daily Quest", `Completed quest: ${quest.title}`, { questId, questType: quest.type }).catch((error) => {
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
 * Initialize quest event listeners
 * Call this once when the app starts
 */
export function initializeQuestEventListeners(): void {
  // Module completed
  eventBus.subscribe("quest.module_completed", async (event) => {
    await updateQuestProgress(event.userId, "complete_module", event.metadata)
  })

  // Quiz completed
  eventBus.subscribe("quest.quiz_completed", async (event) => {
    await updateQuestProgress(event.userId, "complete_quiz", event.metadata)
  })

  // Course rated
  eventBus.subscribe("quest.course_rated", async (event) => {
    if (event.metadata.rating && event.metadata.rating >= 4) {
      await updateQuestProgress(event.userId, "rate_course", event.metadata)
    }
  })

  // XP earned
  eventBus.subscribe("quest.xp_earned", async (event) => {
    await updateQuestProgress(event.userId, "earn_xp", event.metadata)
  })

  // Course added
  eventBus.subscribe("quest.course_added", async (event) => {
    await updateQuestProgress(event.userId, "add_course", event.metadata)
  })
}

