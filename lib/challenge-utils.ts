import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, query, where, getDocs, collection, serverTimestamp, Timestamp, orderBy, limit, increment, onSnapshot } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizQuestion } from "./quiz-utils"
import { calculatePerformanceScore, filterObjectiveQuestions } from "./challenge-scoring"
import { fetchQuizQuestionsByIds, saveQuizQuestions } from "./quiz-utils"
import type { PowerActionType, PowerEffectsBucket } from "./challenge-powered-actions"
import { halveOptions, shuffleArray } from "./challenge-powered-actions"
import {
  enrichQuestionsForPoweredMode,
  generateSwapReserveQuestions,
  type SwapReserveMeta,
} from "./challenge-question-enrichment"
import type { SwapVariantContent } from "./challenge-powered-actions"

export type ChallengeGameMode = "classic" | "powered"

export interface ChallengeSettings {
  gameMode: ChallengeGameMode
  timer: boolean
  bpm: boolean
  immediateFeedback: boolean
  /** Combo is always enabled in challenges */
  combo: boolean
  /** Powered mode only — actions per player (1–10) */
  actionsPerPlayer?: number
  /** @deprecated use gameMode === "powered" */
  mode?: "async" | "live"
  hint?: boolean
  sabotage?: boolean
}

export const CHALLENGE_ACTIONS_PER_PLAYER = 3

export function getChallengeActionsPerPlayer(settings?: ChallengeSettings): number {
  const raw = settings?.actionsPerPlayer ?? CHALLENGE_ACTIONS_PER_PLAYER
  return Math.min(10, Math.max(1, Math.floor(raw)))
}

export const DEFAULT_CHALLENGE_SETTINGS: ChallengeSettings = {
  gameMode: "powered",
  timer: true,
  bpm: true,
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
    bpm: raw.bpm ?? true,
    immediateFeedback: raw.immediateFeedback ?? true,
    combo: true,
    actionsPerPlayer: getChallengeActionsPerPlayer({
      ...raw,
      gameMode,
      timer: raw.timer ?? true,
      bpm: raw.bpm ?? true,
      immediateFeedback: raw.immediateFeedback ?? true,
      combo: true,
    }),
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
  /** Powered swap pool — N easy reserve questions (N = actionsPerPlayer) */
  easyReserveQuestionIds?: string[]
  /** Powered swap pool — N hard reserve questions (N = actionsPerPlayer) */
  hardReserveQuestionIds?: string[]
  challengerAttemptId: string | null // null until challenger plays
  challengerScore: number | null // null until challenger plays (raw points)
  challengerTime: number | null // null until challenger plays
  challengerComboMultiplier?: number | null
  challengerPerformanceScore?: number | null
  status: "generating" | "pending" | "accepted" | "completed" | "rejected" | "expired"
  generationError?: string | null
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

export interface CreateChallengeParams {
  challengerId: string
  challengedId: string
  courseId: string
  quizType: "module" | "course"
  moduleIndex: number | null
  betAmount?: number
  expirationHours?: number
  settings?: ChallengeSettings
}

function challengeDocPayload(
  params: CreateChallengeParams,
  questionIds: string[],
  status: Challenge["status"]
): Record<string, unknown> {
  const {
    challengerId,
    challengedId,
    courseId,
    quizType,
    moduleIndex,
    betAmount = 0,
    expirationHours = 48,
    settings = DEFAULT_CHALLENGE_SETTINGS,
  } = params
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)

  return {
    challengerId,
    challengedId,
    courseId,
    quizType,
    moduleIndex,
    lessonIndex: null,
    questionIds,
    challengerAttemptId: null,
    challengerScore: null,
    challengerTime: null,
    status,
    challengedAttemptId: null,
    challengedScore: null,
    challengedTime: null,
    winnerId: null,
    betAmount,
    expirationHours,
    hasChallengerPlayed: false,
    hasChallengedAccepted: false,
    settings: { ...settings, combo: true },
    generationError: null,
    ...(isPoweredChallenge(settings)
      ? {
          challengerReady: false,
          challengedReady: false,
          challengerLiveIndex: null,
          challengedLiveIndex: null,
          liveStartAt: null,
          sabotageUntil: null,
          sabotageBy: null,
          challengerActionsLeft: getChallengeActionsPerPlayer(settings),
          challengedActionsLeft: getChallengeActionsPerPlayer(settings),
          challengerComboStreak: 0,
          challengedComboStreak: 0,
          challengerEffects: {},
          challengedEffects: {},
        }
      : {}),
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    completedAt: null,
  }
}

/**
 * Create challenge shell immediately (quiz generates in background).
 */
export async function createChallengeShell(params: CreateChallengeParams): Promise<string> {
  const { challengerId, betAmount = 0 } = params
  const challengeRef = doc(collection(db, "challenges"))
  const challengeId = challengeRef.id

  if (betAmount > 0) {
    const { spendNexon, getUserNexon } = await import("./nexon-utils")
    const challengerNexon = await getUserNexon(challengerId)
    if (challengerNexon < betAmount) {
      throw new Error("Insufficient Nexon to place bet")
    }
    await spendNexon(challengerId, betAmount, `Placed bet on challenge (on hold)`, {
      challengeId,
      betAmount,
    })
  }

  await setDoc(challengeRef, challengeDocPayload(params, [], "generating"))
  return challengeId
}

/**
 * Generate quiz questions and mark challenge ready (run in background).
 */
export async function finalizeChallengeQuestions(
  challengeId: string,
  params: CreateChallengeParams
): Promise<void> {
  const challengeRef = doc(db, "challenges", challengeId)
  try {
    const { generateModuleQuizQuestions, generateCourseQuizQuestions } = await import(
      "./quiz-generator"
    )
    const { saveQuizQuestions } = await import("./quiz-utils")
    const { createNotification } = await import("./notification-utils")

    const { courseId, quizType, moduleIndex, settings = DEFAULT_CHALLENGE_SETTINGS } = params

    const courseRef = doc(db, "courses", courseId)
    const courseSnap = await getDoc(courseRef)
    if (!courseSnap.exists()) {
      throw new Error("Course not found")
    }
    const courseData = { id: courseSnap.id, ...courseSnap.data() } as any

    let generatedQuestions: QuizQuestion[] = []
    const questionTarget = quizType === "module" ? 10 : 20
    if (quizType === "module" && moduleIndex !== null) {
      generatedQuestions = await generateModuleQuizQuestions(
        courseData,
        moduleIndex,
        courseId,
        questionTarget
      )
    } else {
      generatedQuestions = await generateCourseQuizQuestions(courseData, courseId, questionTarget)
    }

    generatedQuestions = filterObjectiveQuestions(generatedQuestions, questionTarget)

    const reserveMeta: SwapReserveMeta = {
      courseId,
      quizType: quizType === "module" ? "module" : "course",
      moduleIndex: params.moduleIndex,
      lessonIndex: null,
    }

    let easyReserveQuestionIds: string[] = []
    let hardReserveQuestionIds: string[] = []
    let questionsToSave = generatedQuestions

    if (isPoweredChallenge(settings)) {
      generatedQuestions = await enrichQuestionsForPoweredMode(generatedQuestions)
      const actions = getChallengeActionsPerPlayer(settings)
      const reserves = await generateSwapReserveQuestions(
        generatedQuestions,
        actions,
        reserveMeta
      )
      easyReserveQuestionIds = reserves.easy.map((q) => q.questionId)
      hardReserveQuestionIds = reserves.hard.map((q) => q.questionId)
      questionsToSave = [...generatedQuestions, ...reserves.easy, ...reserves.hard]
    }

    await saveQuizQuestions(questionsToSave)
    const questionIds = generatedQuestions.map((q) => q.questionId)

    await updateDoc(challengeRef, {
      questionIds,
      easyReserveQuestionIds,
      hardReserveQuestionIds,
      status: "pending",
      generationError: null,
    })

    const quizLabel = quizType === "course" ? "Final Quiz" : "Module Quiz"
    await createNotification(params.challengerId, "challenge_ready", {
      challengeId,
      courseId,
      quizType,
      quizLabel,
    })
    await createNotification(params.challengedId, "challenge_ready", {
      challengeId,
      courseId,
      quizType,
      quizLabel,
    })
  } catch (error) {
    console.error("Error finalizing challenge questions:", error)
    const message = error instanceof Error ? error.message : "Failed to generate quiz"
    await updateDoc(challengeRef, {
      status: "generating",
      generationError: message,
    }).catch(() => {})
    throw error instanceof Error ? error : new Error(message)
  }
}

/** @deprecated Use createChallengeShell + finalizeChallengeQuestions */
export async function createChallenge(
  challengerId: string,
  challengedId: string,
  courseId: string,
  quizType: "module" | "course",
  moduleIndex: number | null,
  betAmount: number = 0,
  expirationHours: number = 48,
  settings: ChallengeSettings = DEFAULT_CHALLENGE_SETTINGS
): Promise<string> {
  const params: CreateChallengeParams = {
    challengerId,
    challengedId,
    courseId,
    quizType,
    moduleIndex,
    betAmount,
    expirationHours,
    settings,
  }
  const challengeId = await createChallengeShell(params)
  await finalizeChallengeQuestions(challengeId, params)
  return challengeId
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

    if (challengeData.status === "generating" || !challengeData.questionIds?.length) {
      throw new Error("Quiz is still being prepared. Try again in a moment.")
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

function swapReserveMetaFromChallenge(challenge: Challenge): SwapReserveMeta {
  return {
    courseId: challenge.courseId,
    quizType: challenge.quizType === "module" ? "module" : "course",
    moduleIndex: challenge.moduleIndex,
    lessonIndex: challenge.lessonIndex ?? null,
  }
}

async function loadChallengeReserveQuestion(
  challenge: Challenge,
  reserveId: string
): Promise<QuizQuestion> {
  const questions = await fetchQuizQuestionsByIds(
    challenge.courseId,
    [reserveId],
    challenge.quizType === "module" ? challenge.moduleIndex : null,
    challenge.lessonIndex ?? null
  )
  if (!questions[0]) throw new Error("Swap variant question not found")
  return questions[0]
}

function swapVariantFromQuestion(q: QuizQuestion): SwapVariantContent {
  return {
    question: q.question,
    options: q.options ?? [],
    correctAnswer: q.correctAnswer ?? 0,
    objectiveType: q.objectiveType,
  }
}

/** Ensure sabotage enrichment + N easy / N hard swap reserves exist for Powered challenges. */
async function ensurePoweredChallengeAssets(
  challenge: Challenge,
  baseQuestions: QuizQuestion[]
): Promise<QuizQuestion[]> {
  const settings = normalizeChallengeSettings(challenge.settings)
  if (!isPoweredChallenge(settings)) return baseQuestions

  let questions = baseQuestions
  const needsEnrichment = questions.some(
    (q) => q.type === "objective" && !q.extraOptions?.length
  )
  if (needsEnrichment) {
    questions = await enrichQuestionsForPoweredMode(questions)
    await saveQuizQuestions(questions)
  }

  const actions = getChallengeActionsPerPlayer(settings)
  const easyOk = (challenge.easyReserveQuestionIds?.length ?? 0) >= actions
  const hardOk = (challenge.hardReserveQuestionIds?.length ?? 0) >= actions

  if (!easyOk || !hardOk) {
    const reserves = await generateSwapReserveQuestions(
      questions,
      actions,
      swapReserveMetaFromChallenge(challenge)
    )
    await saveQuizQuestions([...reserves.easy, ...reserves.hard])
    if (challenge.id) {
      await updateDoc(doc(db, "challenges", challenge.id), {
        easyReserveQuestionIds: reserves.easy.map((q) => q.questionId),
        hardReserveQuestionIds: reserves.hard.map((q) => q.questionId),
      })
    }
  }

  return questions
}

/**
 * Load challenge questions by direct doc lookup; regenerate if missing from storage.
 */
export async function getChallengeQuestions(challenge: Challenge): Promise<QuizQuestion[]> {
  const { courseId, questionIds, quizType, moduleIndex, lessonIndex } = challenge
  if (!questionIds?.length) return []

  let questions = await fetchQuizQuestionsByIds(
    courseId,
    questionIds,
    quizType === "module" ? moduleIndex : null,
    lessonIndex ?? null
  )

  if (questions.length === questionIds.length) {
    return ensurePoweredChallengeAssets(challenge, questions)
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
  let easyReserveQuestionIds: string[] = []
  let hardReserveQuestionIds: string[] = []
  let questionsToSave = generated

  if (isPoweredChallenge(settings)) {
    generated = await enrichQuestionsForPoweredMode(generated)
    const actions = getChallengeActionsPerPlayer(settings)
    const reserves = await generateSwapReserveQuestions(
      generated,
      actions,
      swapReserveMetaFromChallenge(challenge)
    )
    easyReserveQuestionIds = reserves.easy.map((q) => q.questionId)
    hardReserveQuestionIds = reserves.hard.map((q) => q.questionId)
    questionsToSave = [...generated, ...reserves.easy, ...reserves.hard]
  }

  await saveQuizQuestions(questionsToSave)
  const newIds = generated.map((q) => q.questionId)

  if (challenge.id) {
    await updateDoc(doc(db, "challenges", challenge.id), {
      questionIds: newIds,
      easyReserveQuestionIds,
      hardReserveQuestionIds,
    })
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

/** Use a Powered-mode action (actionsPerPlayer per player per match) */
export async function useChallengePowerAction(
  challengeId: string,
  fromUserId: string,
  action: PowerActionType,
  context: {
    currentQuestionId: string
    opponentQuestionIndex: number
    questionIds: string[]
    extraOptions?: string[]
    targetOptions?: string[]
    targetCorrectAnswer?: string | number | boolean
    selfOptions?: string[]
    selfCorrectAnswer?: string | number | boolean
    selfObjectiveType?: "multiple-choice" | "true-false" | "matching"
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
  const actionsLeft = data[actionsKey] ?? getChallengeActionsPerPlayer(settings)
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
        const base = context.targetOptions ?? []
        const merged = base.length > 0 ? shuffleArray([...base, ...extras]) : extras
        patch[oppEffectsKey] = {
          ...oppEffects,
          extraOptionsByQuestionId: {
            ...oppEffects.extraOptionsByQuestionId,
            [targetId]: extras,
          },
          shuffledOptionsByQuestionId: {
            ...oppEffects.shuffledOptionsByQuestionId,
            [targetId]: merged,
          },
        }
      }
      break
    }
    case "combo_breaker": {
      const oppEffectsForBreak: PowerEffectsBucket = { ...(data[oppEffectsKey] ?? {}) }
      if (oppEffectsForBreak.comboShield) {
        patch[oppEffectsKey] = { ...oppEffectsForBreak, comboShield: false }
      } else {
        patch[oppComboKey] = 0
      }
      break
    }
    case "swap_harder": {
      const variants = oppEffects.swapVariantByQuestionId ?? {}
      let targetIdx = context.opponentQuestionIndex
      while (
        targetIdx < context.questionIds.length &&
        variants[context.questionIds[targetIdx]]
      ) {
        targetIdx++
      }
      const targetId = context.questionIds[targetIdx]
      if (!targetId) throw new Error("No target question")

      const hardIds = data.hardReserveQuestionIds ?? []
      const used = oppEffects.hardReservesUsed ?? 0
      if (used >= hardIds.length) throw new Error("No harder variants remaining")
      const reserve = await loadChallengeReserveQuestion(data, hardIds[used])

      patch[oppEffectsKey] = {
        ...oppEffects,
        hardReservesUsed: used + 1,
        swapVariantByQuestionId: {
          ...variants,
          [targetId]: swapVariantFromQuestion(reserve),
        },
      }
      break
    }
    case "distort_screen": {
      const until = Timestamp.fromDate(new Date(Date.now() + 10000))
      patch.sabotageUntil = until
      patch.sabotageBy = fromUserId
      break
    }
    case "remove_wrong": {
      const opts = context.selfOptions ?? []
      const halved =
        opts.length > 0
          ? halveOptions(opts, context.selfCorrectAnswer, context.selfObjectiveType)
          : []
      patch[selfEffectsKey] = {
        ...selfEffects,
        removedWrongByQuestionId: {
          ...selfEffects.removedWrongByQuestionId,
          [context.currentQuestionId]: true,
        },
        ...(halved.length > 0
          ? {
              halvedOptionsByQuestionId: {
                ...selfEffects.halvedOptionsByQuestionId,
                [context.currentQuestionId]: halved,
              },
            }
          : {}),
      }
      break
    }
    case "combo_shield":
      patch[selfEffectsKey] = { ...selfEffects, comboShield: true }
      break
    case "swap_easier": {
      const easyIds = data.easyReserveQuestionIds ?? []
      const used = selfEffects.easyReservesUsed ?? 0
      if (used >= easyIds.length) throw new Error("No easier variants remaining")
      const reserve = await loadChallengeReserveQuestion(data, easyIds[used])
      patch[selfEffectsKey] = {
        ...selfEffects,
        easyReservesUsed: used + 1,
        swapVariantByQuestionId: {
          ...selfEffects.swapVariantByQuestionId,
          [context.currentQuestionId]: swapVariantFromQuestion(reserve),
        },
      }
      break
    }
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
