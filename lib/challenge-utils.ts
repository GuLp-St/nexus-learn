import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, query, where, getDocs, collection, serverTimestamp, Timestamp, orderBy, limit, increment, onSnapshot } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizQuestion } from "./quiz-utils"
import { calculatePerformanceScore, filterObjectiveQuestions } from "./challenge-scoring"
import { fetchQuizQuestionsByIds, saveQuizQuestions } from "./quiz-utils"
import type { PowerActionType, PowerEffectsBucket } from "./challenge-powered-actions"
import { enrichQuestionsForPoweredMode } from "./challenge-question-enrichment"

export type ChallengeGameMode = "classic" | "powered"

export interface ChallengeSettings {
  gameMode: ChallengeGameMode
  timer: boolean
  bpm: boolean
  immediateFeedback: boolean
  /** Combo is always enabled in challenges */
  combo: boolean
  /** @deprecated use gameMode === "powered" */
  mode?: "async" | "live"
  hint?: boolean
  sabotage?: boolean
}

export const CHALLENGE_ACTIONS_PER_PLAYER = 3

export const DEFAULT_CHALLENGE_SETTINGS: ChallengeSettings = {
  gameMode: "classic",
  timer: true,
  bpm: false,
  immediateFeedback: true,
  combo: true,
}

export function isPoweredChallenge(settings?: ChallengeSettings): boolean {
  if (!settings) return false
  if (settings.gameMode === "powered") return true
  return !!(settings.hint || settings.sabotage)
}

/** Normalize legacy challenge documents */
export function normalizeChallengeSettings(raw?: Partial<ChallengeSettings>): ChallengeSettings {
  if (!raw) return { ...DEFAULT_CHALLENGE_SETTINGS }
  const gameMode: ChallengeGameMode =
    raw.gameMode ??
    (raw.hint || raw.sabotage || raw.mode === "live" ? "powered" : "classic")
  return {
    gameMode,
    timer: raw.timer ?? true,
    bpm: raw.bpm ?? false,
    immediateFeedback: raw.immediateFeedback ?? true,
    combo: true,
  }
}

export interface Challenge {
  id?: string
  challengerId: string
  challengedId: string
  courseId: string
  quizType: "module" | "course" // Removed "lesson"
  moduleIndex: number | null
  lessonIndex: number | null // Always null now, kept for backward compatibility
  questionIds: string[] // Empty initially, populated when quiz is generated
  challengerAttemptId: string | null // null until challenger plays
  challengerScore: number | null // null until challenger plays (raw points)
  challengerTime: number | null // null until challenger plays
  challengerComboMultiplier?: number | null
  challengerPerformanceScore?: number | null
  status: "pending" | "accepted" | "completed" | "rejected" | "expired"
  challengedAttemptId: string | null
  challengedScore: number | null
  challengedTime: number | null
  challengedComboMultiplier?: number | null
  challengedPerformanceScore?: number | null
  isDraw?: boolean
  winnerId: string | null
  betAmount: number // Nexon bet amount (both users bet the same amount)
  expirationHours: number // Custom expiration chosen by challenger
  hasChallengerPlayed: boolean // Track if challenger has taken the quiz
  hasChallengedAccepted: boolean // Track if challenged user has accepted and paid
  createdAt: Timestamp
  completedAt?: Timestamp | null
  expiresAt?: Timestamp | null // 2 days from creation for response
  completionDeadline?: Timestamp | null // 1 week from acceptance for completion
  settings?: ChallengeSettings
  challengerReady?: boolean
  challengedReady?: boolean
  sabotageBy?: string | null
  challengerActionsLeft?: number
  challengedActionsLeft?: number
  challengerComboStreak?: number
  challengedComboStreak?: number
  challengerEffects?: PowerEffectsBucket
  challengedEffects?: PowerEffectsBucket
  /** Live duel: current question index per player (0-based) */
  challengerLiveIndex?: number | null
  challengedLiveIndex?: number | null
  /** When both players are ready, countdown then simultaneous start */
  liveStartAt?: Timestamp | null
  /** Opponent screen blur until this time */
  sabotageUntil?: Timestamp | null
}

/**
 * Determine winner by competitive performance score, then time; true draw refunds bets.
 */
function determineWinner(
  challengerId: string,
  challengedId: string,
  challengerPerformance: number,
  challengedPerformance: number,
  challengerTime: number,
  challengedTime: number
): { winnerId: string | null; isDraw: boolean } {
  if (challengerPerformance > challengedPerformance) {
    return { winnerId: challengerId, isDraw: false }
  }
  if (challengedPerformance > challengerPerformance) {
    return { winnerId: challengedId, isDraw: false }
  }
  // Same competitive score → draw (raw pts / time tie-breakers do not apply)
  return { winnerId: null, isDraw: true }
}

async function refundChallengeBets(
  challengerId: string,
  challengedId: string,
  betAmount: number,
  challengeId: string,
  reason: string
): Promise<void> {
  if (betAmount <= 0) return
  const { awardNexon } = await import("./nexon-utils")
  await awardNexon(challengerId, betAmount, reason, "Challenge draw — bet refunded", {
    challengeId,
    silent: true,
  })
  await awardNexon(challengedId, betAmount, reason, "Challenge draw — bet refunded", {
    challengeId,
    silent: true,
  })
}

async function applyWinStreak(userId: string, won: boolean): Promise<number> {
  const userRef = doc(db, "users", userId)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return 0

  const current = userSnap.data().challengeWinStreak || 0
  const best = userSnap.data().challengeWinStreakBest || 0

  if (won) {
    const next = current + 1
    await updateDoc(userRef, {
      challengeWinStreak: next,
      challengeWinStreakBest: Math.max(best, next),
    })
    return next
  }

  await updateDoc(userRef, { challengeWinStreak: 0 })
  return 0
}

/**
 * Calculate XP for challenge winner (double the normal quiz XP)
 * This calculates based on correct answers (10 XP per question) and perfect bonus (50 XP) if applicable
 */
async function calculateChallengeXP(questionIds: string[], score: number, maxScore: number): Promise<number> {
  const correctAnswers = score
  const baseXP = correctAnswers * 10 // 10 XP per correct answer
  const perfectBonus = score === maxScore && maxScore > 0 ? 50 : 0 // 50 XP for perfect score
  const totalXP = (baseXP + perfectBonus) * 2 // Double XP for challenge winner
  return totalXP
}

/**
 * Create a new challenge (immediately, before quiz is taken)
 */
export async function createChallenge(
  challengerId: string,
  challengedId: string,
  courseId: string,
  quizType: "module" | "course",
  moduleIndex: number | null,
  betAmount: number = 0,
  expirationHours: number = 48, // Default 2 days
  settings: ChallengeSettings = DEFAULT_CHALLENGE_SETTINGS
): Promise<string> {
  try {
    const challengeRef = doc(collection(db, "challenges"))
    const challengeId = challengeRef.id

    // Deduct bet amount from challenger immediately and put on hold
    if (betAmount > 0) {
      const { spendNexon, getUserNexon } = await import("./nexon-utils")
      const challengerNexon = await getUserNexon(challengerId)
      if (challengerNexon < betAmount) {
        throw new Error("Insufficient Nexon to place bet")
      }
      await spendNexon(challengerId, betAmount, `Placed bet on challenge (on hold)`, { challengeId: challengeRef.id, betAmount })
    }

    // Generate questions immediately so both users have the same fresh set
    const { generateModuleQuizQuestions, generateCourseQuizQuestions } = await import("./quiz-generator")
    const { saveQuizQuestions } = await import("./quiz-utils")
    
    // Fetch course data
    const courseRef = doc(db, "courses", courseId)
    const courseSnap = await getDoc(courseRef)
    if (!courseSnap.exists()) {
      throw new Error("Course not found")
    }
    const courseData = { id: courseSnap.id, ...courseSnap.data() } as any
    
    let generatedQuestions: QuizQuestion[] = []
    const questionTarget = quizType === "module" ? 10 : 20
    if (quizType === "module" && moduleIndex !== null) {
      generatedQuestions = await generateModuleQuizQuestions(courseData, moduleIndex, courseId, questionTarget)
    } else {
      generatedQuestions = await generateCourseQuizQuestions(courseData, courseId, questionTarget)
    }

    generatedQuestions = filterObjectiveQuestions(generatedQuestions, questionTarget)

    if (isPoweredChallenge(settings)) {
      generatedQuestions = await enrichQuestionsForPoweredMode(generatedQuestions)
    }

    // Save questions to Firestore so they are permanent and accessible by both players
    await saveQuizQuestions(generatedQuestions)
    const questionIds = generatedQuestions.map(q => q.questionId)

    // Calculate expiration times
    const now = new Date()
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)

    await setDoc(challengeRef, {
      challengerId,
      challengedId,
      courseId,
      quizType,
      moduleIndex,
      lessonIndex: null, // Always null now
      questionIds,
      challengerAttemptId: null,
      challengerScore: null,
      challengerTime: null,
      status: "pending",
      challengedAttemptId: null,
      challengedScore: null,
      challengedTime: null,
      winnerId: null,
      betAmount,
      expirationHours,
      hasChallengerPlayed: false,
      hasChallengedAccepted: false,
      settings: { ...settings, combo: true },
      ...(isPoweredChallenge(settings)
        ? {
            challengerReady: false,
            challengedReady: false,
            challengerLiveIndex: null,
            challengedLiveIndex: null,
            liveStartAt: null,
            sabotageUntil: null,
            sabotageBy: null,
            challengerActionsLeft: CHALLENGE_ACTIONS_PER_PLAYER,
            challengedActionsLeft: CHALLENGE_ACTIONS_PER_PLAYER,
            challengerComboStreak: 0,
            challengedComboStreak: 0,
            challengerEffects: {},
            challengedEffects: {},
          }
        : {}),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      completedAt: null,
    })

    return challengeId
  } catch (error) {
    console.error("Error creating challenge:", error)
    throw error instanceof Error ? error : new Error("Failed to create challenge")
  }
}

/**
 * Accept a challenge (challenged user pays bet and accepts)
 */
export async function acceptChallenge(challengeId: string, challengedUserId: string): Promise<void> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)
    
    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found")
    }

    const challengeData = challengeDoc.data() as Challenge
    if (challengeData.challengedId !== challengedUserId) {
      throw new Error("User is not the challenged user")
    }

    if (challengeData.status !== "pending") {
      throw new Error("Challenge is not pending")
    }

    const betAmount = challengeData.betAmount || 0

    // Check if challenged user has enough Nexon and deduct bet immediately
    if (betAmount > 0) {
      const { spendNexon, getUserNexon } = await import("./nexon-utils")
      const challengedNexon = await getUserNexon(challengedUserId)
      if (challengedNexon < betAmount) {
        throw new Error("Insufficient Nexon to accept challenge")
      }
      await spendNexon(challengedUserId, betAmount, `Accepted challenge bet (on hold)`, { challengeId, betAmount })
    }

    // Calculate completion deadline (1 week from now)
    const now = new Date()
    const completionDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 1 week

    await updateDoc(challengeRef, {
      status: "accepted",
      hasChallengedAccepted: true,
      completionDeadline: Timestamp.fromDate(completionDeadline),
    })
  } catch (error) {
    console.error("Error accepting challenge:", error)
    throw error
  }
}

/**
 * Record a player's results in a challenge
 * If it's the first player to finish, just save the results.
 * If it's the second player, complete the challenge and determine winner.
 */
export async function recordChallengeResult(
  challengeId: string,
  userId: string,
  attemptId: string,
  score: number,
  timeTaken: number,
  /** Peak combo multiplier reached during the run (not current streak at submit). */
  comboMultiplier: number = 1
): Promise<{ 
  isCompleted: boolean; 
  winnerId: string | null; 
  isDraw?: boolean;
  challengerXP: number; 
  challengedXP: number; 
  challengedXPAwardResult?: XPAwardResult 
}> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)

    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found")
    }

    const challengeData = challengeDoc.data() as Challenge
    const isChallenger = userId === challengeData.challengerId
    const isChallenged = userId === challengeData.challengedId

    if (!isChallenger && !isChallenged) {
      throw new Error("User is not part of this challenge")
    }

    const performanceScore = calculatePerformanceScore(score, comboMultiplier, timeTaken)

    const updates: Record<string, unknown> = {}
    if (isChallenger) {
      if (challengeData.hasChallengerPlayed) throw new Error("Challenger already played")
      updates.challengerAttemptId = attemptId
      updates.challengerScore = score
      updates.challengerTime = timeTaken
      updates.challengerComboMultiplier = comboMultiplier
      updates.challengerPerformanceScore = performanceScore
      updates.hasChallengerPlayed = true
    } else {
      if (challengeData.challengedScore !== null) throw new Error("Challenged user already played")
      updates.challengedAttemptId = attemptId
      updates.challengedScore = score
      updates.challengedTime = timeTaken
      updates.challengedComboMultiplier = comboMultiplier
      updates.challengedPerformanceScore = performanceScore
    }

    // Update the challenge doc with this player's results
    await updateDoc(challengeRef, updates)

    // Check if the OTHER player has also played
    const otherPlayed = isChallenger 
      ? challengeData.challengedScore !== null 
      : challengeData.hasChallengerPlayed

    if (!otherPlayed) {
      // First player finished, don't complete yet
      return { 
        isCompleted: false, 
        winnerId: null, 
        challengerXP: 0, 
        challengedXP: 0 
      }
    }

    // Both players have now finished! Complete the challenge.
    const finalChallengerScore = isChallenger ? score : (challengeData.challengerScore || 0)
    const finalChallengedScore = isChallenger ? (challengeData.challengedScore || 0) : score
    const finalChallengerTime = isChallenger ? timeTaken : (challengeData.challengerTime || 0)
    const finalChallengedTime = isChallenger ? (challengeData.challengedTime || 0) : timeTaken
    const finalChallengerPerf = isChallenger
      ? performanceScore
      : (challengeData.challengerPerformanceScore || 0)
    const finalChallengedPerf = isChallenger
      ? (challengeData.challengedPerformanceScore || 0)
      : performanceScore

    const { winnerId, isDraw } = determineWinner(
      challengeData.challengerId,
      challengeData.challengedId,
      finalChallengerPerf,
      finalChallengedPerf,
      finalChallengerTime,
      finalChallengedTime
    )

    if (challengeData.betAmount > 0) {
      const { awardNexon } = await import("./nexon-utils")
      if (isDraw) {
        await refundChallengeBets(
          challengeData.challengerId,
          challengeData.challengedId,
          challengeData.betAmount,
          challengeId,
          "Challenge Draw - Refund"
        )
      } else if (winnerId) {
        const totalWinnings = challengeData.betAmount * 2
        await awardNexon(winnerId, totalWinnings, "Challenge Win", `Won challenge and took all bets`, {
          challengeId,
          betAmount: totalWinnings,
        }).catch((err) => console.error("Error awarding Nexon:", err))
      }
    }

    await updateDoc(challengeRef, {
      winnerId,
      isDraw,
      status: "completed",
      completedAt: serverTimestamp(),
    })

    // Award XP
    const maxScore = challengeData.questionIds.length
    let challengerXP = 0
    let challengedXP = 0
    let challengedXPAwardResult: XPAwardResult | undefined

    const { createNotification } = await import("./notification-utils")
    const { recordActivity } = await import("./community-pulse-utils")
    
    // Get course title
    const courseSnap = await getDoc(doc(db, "courses", challengeData.courseId))
    const courseTitle = courseSnap.data()?.title || "Unknown Course"

    // Notifications
    const commonNotifData = {
      challengeId,
      winnerId: winnerId || undefined,
      challengerScore: finalChallengerScore,
      challengedScore: finalChallengedScore,
      nexonWon: (winnerId && challengeData.betAmount > 0) ? challengeData.betAmount * 2 : 0
    }

    const challengerXpPreview = isDraw
      ? 0
      : winnerId === challengeData.challengerId
        ? await calculateChallengeXP(challengeData.questionIds, finalChallengerScore, maxScore)
        : 0
    const challengedXpPreview = isDraw
      ? 0
      : winnerId === challengeData.challengedId
        ? await calculateChallengeXP(challengeData.questionIds, finalChallengedScore, maxScore)
        : 0

    await createNotification(challengeData.challengerId, "challenge_result", {
      ...commonNotifData,
      yourScore: finalChallengerScore,
      opponentScore: finalChallengedScore,
      isDraw,
      xpAwarded: challengerXpPreview,
    }).catch((err) => console.error("Error notification:", err))

    await createNotification(challengeData.challengedId, "challenge_result", {
      ...commonNotifData,
      yourScore: finalChallengedScore,
      opponentScore: finalChallengerScore,
      isDraw,
      xpAwarded: challengedXpPreview,
    }).catch((err) => console.error("Error notification:", err))

    if (isDraw) {
      await applyWinStreak(challengeData.challengerId, false)
      await applyWinStreak(challengeData.challengedId, false)
    } else if (winnerId) {
      const winnerIsChallenger = winnerId === challengeData.challengerId
      const loserId = winnerIsChallenger ? challengeData.challengedId : challengeData.challengerId
      const winnerScore = winnerIsChallenger ? finalChallengerScore : finalChallengedScore
      const xp = await calculateChallengeXP(challengeData.questionIds, winnerScore, maxScore)

      const awardResult = await awardXP(
        winnerId,
        xp,
        "Quiz Challenge Victory",
        `Won challenge with score ${winnerScore}/${maxScore}`,
        { challengeId, score: winnerScore, maxScore }
      )

      if (winnerIsChallenger) {
        challengerXP = xp
      } else {
        challengedXP = xp
        challengedXPAwardResult = awardResult
      }

      await applyWinStreak(winnerId, true)
      await applyWinStreak(loserId, false)

      const { emitQuestEvent } = await import("./event-bus")
      emitQuestEvent({
        type: "quest.win_challenge",
        userId: winnerId,
        metadata: { challengeId },
      })

      await updateDoc(doc(db, "users", winnerId), { challengeWins: increment(1) })
      recordActivity(winnerId, "challenge_won", {
        courseId: challengeData.courseId,
        courseTitle,
      })
    }

    return {
      isCompleted: true,
      winnerId,
      isDraw,
      challengerXP,
      challengedXP,
      challengedXPAwardResult,
    }
  } catch (error) {
    console.error("Error recording challenge result:", error)
    throw error
  }
}

/**
 * Reject/Decline a challenge (refunds challenger)
 */
export async function rejectChallenge(challengeId: string): Promise<void> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)
    
    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found")
    }

    const challengeData = challengeDoc.data() as Challenge
    
    // Refund challenger's bet
    if (challengeData.betAmount > 0) {
      const { awardNexon } = await import("./nexon-utils")
      await awardNexon(challengeData.challengerId, challengeData.betAmount, "Challenge Declined - Refund", `Challenge was declined, bet refunded`, { challengeId })
    }

    await updateDoc(challengeRef, {
      status: "rejected",
    })
  } catch (error) {
    console.error("Error rejecting challenge:", error)
    throw error instanceof Error ? error : new Error("Failed to decline challenge")
  }
}

/**
 * Cancel a challenge (only if challenger hasn't played yet)
 */
export async function cancelChallenge(challengeId: string, challengerId: string): Promise<void> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)
    
    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found")
    }

    const challengeData = challengeDoc.data() as Challenge
    
    if (challengeData.challengerId !== challengerId) {
      throw new Error("Only the challenger can cancel")
    }

    if (challengeData.hasChallengerPlayed) {
      throw new Error(
        "Can't cancel — your score is already locked in. Wait for your opponent to play or finish the duel."
      )
    }

    if (challengeData.status !== "pending") {
      throw new Error(
        "Can't cancel — this challenge was already accepted. Ask your friend to decline, or play it out."
      )
    }

    // Refund challenger's bet
    if (challengeData.betAmount > 0) {
      const { awardNexon } = await import("./nexon-utils")
      await awardNexon(challengerId, challengeData.betAmount, "Challenge Cancelled - Refund", `Challenge was cancelled, bet refunded`, { challengeId })
    }

    await updateDoc(challengeRef, {
      status: "rejected", // Use rejected status for cancelled challenges
    })
  } catch (error) {
    console.error("Error cancelling challenge:", error)
    throw error
  }
}

/**
 * Check and handle expired challenges
 * Should be called periodically (e.g., via Cloud Function or on page load)
 */
export async function checkAndHandleExpiredChallenges(): Promise<void> {
  try {
    const now = Timestamp.now()
    
    // 1. Find challenges that expired while pending (no response from defender)
    const expiredPendingQuery = query(
      collection(db, "challenges"),
      where("status", "==", "pending"),
      where("expiresAt", "<", now)
    )
    
    const expiredPendingSnapshot = await getDocs(expiredPendingQuery)
    
    for (const docSnap of expiredPendingSnapshot.docs) {
      const challengeData = docSnap.data() as Challenge
      
      // Refund challenger their bet
      if (challengeData.betAmount > 0) {
        const { awardNexon } = await import("./nexon-utils")
        await awardNexon(challengeData.challengerId, challengeData.betAmount, "Challenge Expired - Refund", `Challenge expired without response, bet refunded`, { challengeId: docSnap.id })
      }
      
      await updateDoc(doc(db, "challenges", docSnap.id), {
        status: "expired",
      })
    }

    // 2. Find challenges that were accepted but hit their completion deadline
    const expiredAcceptedQuery = query(
      collection(db, "challenges"),
      where("status", "==", "accepted"),
      where("completionDeadline", "<", now)
    )
    
    const expiredAcceptedSnapshot = await getDocs(expiredAcceptedQuery)
    
    for (const docSnap of expiredAcceptedSnapshot.docs) {
      const challengeData = docSnap.data() as Challenge
      const challengeId = docSnap.id
      
      // Default win logic based on who actually played
      let winnerId: string | null = null
      
      if (challengeData.hasChallengerPlayed && !challengeData.challengedScore) {
        // Challenger played, defender didn't - challenger wins
        winnerId = challengeData.challengerId
      } else if (!challengeData.hasChallengerPlayed && challengeData.challengedScore !== null) {
        // Defender played, challenger didn't - defender wins
        winnerId = challengeData.challengedId
      }
      
      if (winnerId) {
        // Someone won by default - award the full pot (both bets)
        if (challengeData.betAmount > 0) {
          const { awardNexon } = await import("./nexon-utils")
          await awardNexon(winnerId, challengeData.betAmount * 2, "Challenge Timeout Win", `Opponent didn't complete challenge in time, you win the pot`, { challengeId })
        }
        
        await updateDoc(doc(db, "challenges", challengeId), {
          status: "completed",
          winnerId,
          completedAt: serverTimestamp(),
        })
      } else {
        // Neither completed - refund both players their original bets
        if (challengeData.betAmount > 0) {
          const { awardNexon } = await import("./nexon-utils")
          // Refund challenger
          await awardNexon(challengeData.challengerId, challengeData.betAmount, "Challenge Timeout - Refund", `Neither party completed, bet refunded`, { challengeId })
          // Refund defender (since they had accepted and paid their bet)
          await awardNexon(challengeData.challengedId, challengeData.betAmount, "Challenge Timeout - Refund", `Neither party completed, bet refunded`, { challengeId })
        }
        
        await updateDoc(doc(db, "challenges", challengeId), {
          status: "expired",
        })
      }
    }
  } catch (error) {
    console.error("Error checking expired challenges:", error)
  }
}

/**
 * Get a challenge by ID
 */
export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)

    if (!challengeDoc.exists()) {
      return null
    }

    return {
      id: challengeDoc.id,
      ...challengeDoc.data(),
    } as Challenge
  } catch (error) {
    console.error("Error getting challenge:", error)
    return null
  }
}

/**
 * Get pending challenges for a user (where user is the challenged user)
 */
export async function getUserChallenges(userId: string): Promise<Challenge[]> {
  try {
    const challengesQuery = query(
      collection(db, "challenges"),
      where("challengedId", "==", userId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(50)
    )

    const snapshot = await getDocs(challengesQuery)
    const challenges: Challenge[] = []

    snapshot.forEach((docSnap) => {
      challenges.push({
        id: docSnap.id,
        ...docSnap.data(),
      } as Challenge)
    })

    return challenges
  } catch (error: any) {
    // If index is building, fallback without orderBy
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "challenges"),
          where("challengedId", "==", userId),
          where("status", "==", "pending"),
          limit(50)
        )
        const snapshot = await getDocs(fallbackQuery)
        const challenges: Challenge[] = []

        snapshot.forEach((docSnap) => {
          challenges.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as Challenge)
        })

        // Sort client-side
        challenges.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0
          return bTime - aTime
        })

        return challenges
      } catch (fallbackError) {
        console.error("Error getting user challenges (fallback):", fallbackError)
        return []
      }
    }

    console.error("Error getting user challenges:", error)
    return []
  }
}

/**
 * Load challenge questions by direct doc lookup; regenerate if missing from storage.
 */
export async function getChallengeQuestions(challenge: Challenge): Promise<QuizQuestion[]> {
  const { courseId, questionIds, quizType, moduleIndex, lessonIndex, betAmount } = challenge
  if (!questionIds?.length) return []

  let questions = await fetchQuizQuestionsByIds(
    courseId,
    questionIds,
    quizType === "module" ? moduleIndex : null,
    lessonIndex ?? null
  )

  if (questions.length === questionIds.length) {
    const settings = normalizeChallengeSettings(challenge.settings)
    if (isPoweredChallenge(settings)) {
      const needsEnrichment = questions.some(
        (q) => q.type === "objective" && !q.extraOptions?.length
      )
      if (needsEnrichment) {
        const enriched = await enrichQuestionsForPoweredMode(questions)
        await saveQuizQuestions(enriched)
        return enriched
      }
    }
    return questions
  }

  console.warn(
    `[challenge] ${questions.length}/${questionIds.length} questions found — regenerating`
  )

  const courseRef = doc(db, "courses", courseId)
  const courseSnap = await getDoc(courseRef)
  if (!courseSnap.exists()) {
    throw new Error("Course not found")
  }
  const courseData = { id: courseSnap.id, ...courseSnap.data() } as any

  const { generateModuleQuizQuestions, generateCourseQuizQuestions } = await import("./quiz-generator")
  const questionTarget = quizType === "module" ? 10 : 20

  let generated: QuizQuestion[] = []
  if (quizType === "module" && moduleIndex !== null) {
    generated = await generateModuleQuizQuestions(courseData, moduleIndex, courseId, questionTarget)
  } else {
    generated = await generateCourseQuizQuestions(courseData, courseId, questionTarget)
  }

  generated = filterObjectiveQuestions(generated, questionTarget)

  if (generated.length === 0) {
    throw new Error("Failed to generate challenge questions")
  }

  const settings = normalizeChallengeSettings(challenge.settings)
  if (isPoweredChallenge(settings)) {
    generated = await enrichQuestionsForPoweredMode(generated)
  }

  await saveQuizQuestions(generated)
  const newIds = generated.map((q) => q.questionId)

  if (challenge.id) {
    await updateDoc(doc(db, "challenges", challenge.id), { questionIds: newIds })
  }

  return generated
}

/** Mark current player ready in a live duel (challenged must accept first). */
export async function markChallengeReady(challengeId: string, userId: string): Promise<void> {
  const ref = doc(db, "challenges", challengeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error("Challenge not found")

  const data = snap.data() as Challenge
  if (!isPoweredChallenge(normalizeChallengeSettings(data.settings))) {
    throw new Error("Ready room is only for Powered challenges")
  }

  const isChallenger = userId === data.challengerId
  const isChallenged = userId === data.challengedId
  if (!isChallenger && !isChallenged) throw new Error("Not part of this challenge")
  if (isChallenged && data.status === "pending") {
    throw new Error("Accept the challenge before marking ready")
  }

  await updateDoc(ref, isChallenger ? { challengerReady: true } : { challengedReady: true })
}

/** Schedule synchronized start when both players are ready (live only). */
export async function scheduleLiveMatchStart(challengeId: string): Promise<void> {
  const ref = doc(db, "challenges", challengeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() as Challenge
  const settings = normalizeChallengeSettings(data.settings)
  if (!isPoweredChallenge(settings)) return
  if (data.status !== "accepted") return
  if (!data.challengerReady || !data.challengedReady) return
  if (data.liveStartAt) return

  const startAt = Timestamp.fromDate(new Date(Date.now() + 3000))
  await updateDoc(ref, { liveStartAt: startAt })
}

/** Update live question progress for opponent view */
export async function updateChallengeLiveProgress(
  challengeId: string,
  userId: string,
  questionIndex: number
): Promise<void> {
  const ref = doc(db, "challenges", challengeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() as Challenge
  const settings = normalizeChallengeSettings(data.settings)
  if (!isPoweredChallenge(settings)) return

  const isChallenger = userId === data.challengerId
  await updateDoc(ref, isChallenger ? { challengerLiveIndex: questionIndex } : { challengedLiveIndex: questionIndex })
}

function effectsKeyForUser(isChallenger: boolean): "challengerEffects" | "challengedEffects" {
  return isChallenger ? "challengerEffects" : "challengedEffects"
}

function comboKeyForUser(isChallenger: boolean): "challengerComboStreak" | "challengedComboStreak" {
  return isChallenger ? "challengerComboStreak" : "challengedComboStreak"
}

/** Use a Powered-mode action (3 per player per match) */
export async function useChallengePowerAction(
  challengeId: string,
  fromUserId: string,
  action: PowerActionType,
  context: {
    currentQuestionId: string
    opponentQuestionIndex: number
    questionIds: string[]
    extraOptions?: string[]
    isTrueFalse?: boolean
    hasTfExpanded?: boolean
  }
): Promise<void> {
  const ref = doc(db, "challenges", challengeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error("Challenge not found")

  const data = snap.data() as Challenge
  const settings = normalizeChallengeSettings(data.settings)
  if (!isPoweredChallenge(settings)) throw new Error("Actions only work in Powered mode")

  const isChallenger = fromUserId === data.challengerId
  const isChallenged = fromUserId === data.challengedId
  if (!isChallenger && !isChallenged) throw new Error("Not part of this challenge")

  const actionsKey = isChallenger ? "challengerActionsLeft" : "challengedActionsLeft"
  const actionsLeft = data[actionsKey] ?? CHALLENGE_ACTIONS_PER_PLAYER
  if (actionsLeft <= 0) throw new Error("No actions remaining")

  const opponentIsChallenger = !isChallenger
  const selfEffectsKey = effectsKeyForUser(isChallenger)
  const oppEffectsKey = effectsKeyForUser(opponentIsChallenger)
  const selfComboKey = comboKeyForUser(isChallenger)
  const oppComboKey = comboKeyForUser(opponentIsChallenger)

  const selfEffects: PowerEffectsBucket = { ...(data[selfEffectsKey] ?? {}) }
  const oppEffects: PowerEffectsBucket = { ...(data[oppEffectsKey] ?? {}) }

  const patch: Record<string, unknown> = {
    [actionsKey]: actionsLeft - 1,
  }

  switch (action) {
    case "add_more_answers": {
      const targetId = context.questionIds[context.opponentQuestionIndex]
      if (!targetId) throw new Error("No target question")
      if (context.isTrueFalse && context.hasTfExpanded) {
        patch[oppEffectsKey] = {
          ...oppEffects,
          tfExpandedByQuestionId: {
            ...oppEffects.tfExpandedByQuestionId,
            [targetId]: true,
          },
        }
      } else {
        const extras = context.extraOptions ?? []
        if (extras.length === 0) throw new Error("No extra answers available for this question")
        patch[oppEffectsKey] = {
          ...oppEffects,
          extraOptionsByQuestionId: {
            ...oppEffects.extraOptionsByQuestionId,
            [targetId]: extras,
          },
        }
      }
      break
    }
    case "combo_breaker":
      patch[oppComboKey] = 0
      break
    case "swap_harder": {
      const swapped = oppEffects.swappedQuestionByQuestionId ?? {}
      let targetIdx = context.opponentQuestionIndex
      while (
        targetIdx < context.questionIds.length &&
        swapped[context.questionIds[targetIdx]] === "hard"
      ) {
        targetIdx++
      }
      const targetId = context.questionIds[targetIdx]
      if (!targetId) throw new Error("No target question")
      patch[oppEffectsKey] = {
        ...oppEffects,
        swappedQuestionByQuestionId: {
          ...swapped,
          [targetId]: "hard",
        },
      }
      break
    }
    case "distort_screen": {
      const until = Timestamp.fromDate(new Date(Date.now() + 5000))
      patch.sabotageUntil = until
      patch.sabotageBy = fromUserId
      break
    }
    case "remove_wrong":
      patch[selfEffectsKey] = {
        ...selfEffects,
        removedWrongByQuestionId: {
          ...selfEffects.removedWrongByQuestionId,
          [context.currentQuestionId]: true,
        },
      }
      break
    case "combo_shield":
      patch[selfEffectsKey] = { ...selfEffects, comboShield: true }
      break
    case "swap_easier":
      patch[selfEffectsKey] = {
        ...selfEffects,
        swappedQuestionByQuestionId: {
          ...selfEffects.swappedQuestionByQuestionId,
          [context.currentQuestionId]: "easy",
        },
      }
      break
    case "combo_switcher": {
      const myStreak = data[selfComboKey] ?? 0
      const oppStreak = data[oppComboKey] ?? 0
      patch[selfComboKey] = oppStreak
      patch[oppComboKey] = myStreak
      break
    }
    default:
      throw new Error("Unknown action")
  }

  await updateDoc(ref, patch)
}

/** @deprecated use useChallengePowerAction with distort_screen */
export async function sendChallengeSabotage(challengeId: string, fromUserId: string): Promise<void> {
  await useChallengePowerAction(challengeId, fromUserId, "distort_screen", {
    currentQuestionId: "",
    opponentQuestionIndex: 0,
    questionIds: [],
  })
}

/** Sync live combo streak for powered challenges */
export async function updateChallengeComboStreak(
  challengeId: string,
  userId: string,
  streak: number
): Promise<void> {
  const ref = doc(db, "challenges", challengeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data() as Challenge
  if (!isPoweredChallenge(normalizeChallengeSettings(data.settings))) return
  const key = userId === data.challengerId ? "challengerComboStreak" : "challengedComboStreak"
  await updateDoc(ref, { [key]: streak })
}

/**
 * Subscribe to a challenge for real-time updates
 */
export function subscribeToChallenge(
  challengeId: string,
  callback: (challenge: Challenge | null) => void
) {
  const challengeRef = doc(db, "challenges", challengeId)
  return onSnapshot(challengeRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() } as Challenge)
    } else {
      callback(null)
    }
  }, (error) => {
    console.error("Error subscribing to challenge:", error)
    callback(null)
  })
}
