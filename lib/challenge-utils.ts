import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, query, where, getDocs, collection, serverTimestamp, Timestamp, orderBy, limit, increment, onSnapshot } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizQuestion } from "./quiz-utils"

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
  challengerScore: number | null // null until challenger plays
  challengerTime: number | null // null until challenger plays
  status: "pending" | "accepted" | "completed" | "rejected" | "expired"
  challengedAttemptId: string | null
  challengedScore: number | null
  challengedTime: number | null
  winnerId: string | null
  betAmount: number // Nexon bet amount (both users bet the same amount)
  expirationHours: number // Custom expiration chosen by challenger
  hasChallengerPlayed: boolean // Track if challenger has taken the quiz
  hasChallengedAccepted: boolean // Track if challenged user has accepted and paid
  createdAt: Timestamp
  completedAt?: Timestamp | null
  expiresAt?: Timestamp | null // 2 days from creation for response
  completionDeadline?: Timestamp | null // 1 week from acceptance for completion
}

/**
 * Determine the winner of a challenge
 * Higher score wins, or faster time if scores are tied
 */
function determineWinner(
  challengerId: string,
  challengedId: string,
  challengerScore: number,
  challengedScore: number,
  challengerTime: number,
  challengedTime: number
): string | null {
  if (challengerScore > challengedScore) return challengerId
  if (challengedScore > challengerScore) return challengedId
  if (challengerScore === challengedScore) {
    // Tie: winner is whoever took less time
    return challengerTime < challengedTime ? challengerId : challengedId
  }
  return null
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
  expirationHours: number = 48 // Default 2 days
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
    if (quizType === "module" && moduleIndex !== null) {
      generatedQuestions = await generateModuleQuizQuestions(courseData, moduleIndex, courseId, 10)
    } else {
      generatedQuestions = await generateCourseQuizQuestions(courseData, courseId, 20)
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
  timeTaken: number
): Promise<{ 
  isCompleted: boolean; 
  winnerId: string | null; 
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

    // Prepare updates
    const updates: any = {}
    if (isChallenger) {
      if (challengeData.hasChallengerPlayed) throw new Error("Challenger already played")
      updates.challengerAttemptId = attemptId
      updates.challengerScore = score
      updates.challengerTime = timeTaken
      updates.hasChallengerPlayed = true
    } else {
      if (challengeData.challengedScore !== null) throw new Error("Challenged user already played")
      updates.challengedAttemptId = attemptId
      updates.challengedScore = score
      updates.challengedTime = timeTaken
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

    // Determine winner
    const winnerId = determineWinner(
      challengeData.challengerId,
      challengeData.challengedId,
      finalChallengerScore,
      finalChallengedScore,
      finalChallengerTime,
      finalChallengedTime
    )

    // Award Nexon to winner
    if (challengeData.betAmount > 0 && winnerId) {
      const totalWinnings = challengeData.betAmount * 2
      const { awardNexon } = await import("./nexon-utils")
      await awardNexon(winnerId, totalWinnings, "Challenge Win", `Won challenge and took all bets`, { challengeId, betAmount: totalWinnings }).catch(err => {
        console.error("Error awarding Nexon:", err)
      })
    }

    // Finalize challenge status
    await updateDoc(challengeRef, {
      winnerId,
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

    await createNotification(challengeData.challengerId, "challenge_result", {
      ...commonNotifData,
      yourScore: finalChallengerScore,
      opponentScore: finalChallengedScore,
      xpAwarded: winnerId === challengeData.challengerId ? await calculateChallengeXP(challengeData.questionIds, finalChallengerScore, maxScore) : 0,
    }).catch(err => console.error("Error notification:", err))

    await createNotification(challengeData.challengedId, "challenge_result", {
      ...commonNotifData,
      yourScore: finalChallengedScore,
      opponentScore: finalChallengerScore,
      xpAwarded: winnerId === challengeData.challengedId ? await calculateChallengeXP(challengeData.questionIds, finalChallengedScore, maxScore) : 0,
    }).catch(err => console.error("Error notification:", err))

    // Handle Winner Rewards (XP and Activity)
    if (winnerId) {
      const winnerIsChallenger = winnerId === challengeData.challengerId
      const winnerScore = winnerIsChallenger ? finalChallengerScore : finalChallengedScore
      const xp = await calculateChallengeXP(challengeData.questionIds, winnerScore, maxScore)
      
      const awardResult = await awardXP(winnerId, xp, "Quiz Challenge Victory", `Won challenge with score ${winnerScore}/${maxScore}`, { challengeId, score: winnerScore, maxScore })
      
      if (winnerIsChallenger) {
        challengerXP = xp
      } else {
        challengedXP = xp
        challengedXPAwardResult = awardResult
      }

      // Quest Event
      const { emitQuestEvent } = await import("./event-bus")
      emitQuestEvent({
        type: "quest.win_challenge",
        userId: winnerId,
        metadata: { challengeId }
      })

      // Stats
      await updateDoc(doc(db, "users", winnerId), { challengeWins: increment(1) })
      recordActivity(winnerId, "challenge_won", { courseId: challengeData.courseId, courseTitle })
    }

    return {
      isCompleted: true,
      winnerId,
      challengerXP,
      challengedXP,
      challengedXPAwardResult
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
    throw new Error("Failed to reject challenge")
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
      throw new Error("Cannot cancel challenge after playing")
    }

    if (challengeData.status !== "pending") {
      throw new Error("Challenge is not pending")
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
 * Get challenge questions by question IDs
 * Fetches questions from quizQuestions collection by filtering by questionId
 */
export async function getChallengeQuestions(
  courseId: string,
  questionIds: string[]
): Promise<QuizQuestion[]> {
  try {
    const { collection, query, where, getDocs } = await import("firebase/firestore")
    
    // Fetch all questions for the course and filter by questionId
    const questionsQuery = query(
      collection(db, "quizQuestions"),
      where("courseId", "==", courseId)
    )
    
    const snapshot = await getDocs(questionsQuery)
    const questions: QuizQuestion[] = []
    
    snapshot.forEach((docSnap) => {
      const questionData = docSnap.data() as QuizQuestion
      if (questionIds.includes(questionData.questionId)) {
        questions.push(questionData)
      }
    })
    
    // Sort questions to match the order of questionIds
    return questionIds
      .map((id) => questions.find((q) => q.questionId === id))
      .filter((q): q is QuizQuestion => q !== undefined)
  } catch (error) {
    console.error("Error getting challenge questions:", error)
    return []
  }
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
