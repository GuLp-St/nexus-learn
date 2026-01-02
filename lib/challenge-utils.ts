import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, query, where, getDocs, collection, serverTimestamp, Timestamp, orderBy, limit, increment } from "firebase/firestore"
import { awardXP } from "./xp-utils"
import { QuizQuestion } from "./quiz-utils"

export interface Challenge {
  id?: string
  challengerId: string
  challengedId: string
  courseId: string
  quizType: "lesson" | "module" | "course"
  moduleIndex: number | null
  lessonIndex: number | null
  questionIds: string[]
  challengerAttemptId: string
  challengerScore: number
  challengerTime: number // Time taken in seconds
  status: "pending" | "accepted" | "completed" | "rejected" | "expired"
  challengedAttemptId: string | null
  challengedScore: number | null
  challengedTime: number | null
  winnerId: string | null
  createdAt: Timestamp
  completedAt?: Timestamp | null
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
 * Create a new challenge
 */
export async function createChallenge(
  challengerId: string,
  challengedId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex: number | null,
  lessonIndex: number | null,
  questionIds: string[],
  challengerAttemptId: string,
  challengerScore: number,
  challengerTime: number
): Promise<string> {
  try {
    const challengeRef = doc(collection(db, "challenges"))
    const challengeId = challengeRef.id

    await setDoc(challengeRef, {
      challengerId,
      challengedId,
      courseId,
      quizType,
      moduleIndex,
      lessonIndex,
      questionIds,
      challengerAttemptId,
      challengerScore,
      challengerTime,
      status: "pending",
      challengedAttemptId: null,
      challengedScore: null,
      challengedTime: null,
      winnerId: null,
      createdAt: serverTimestamp(),
      completedAt: null,
    })

    return challengeId
  } catch (error) {
    console.error("Error creating challenge:", error)
    throw new Error("Failed to create challenge")
  }
}

/**
 * Accept a challenge (challenged user starts taking the quiz)
 */
export async function acceptChallenge(challengeId: string): Promise<void> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    await updateDoc(challengeRef, {
      status: "accepted",
    })
  } catch (error) {
    console.error("Error accepting challenge:", error)
    throw new Error("Failed to accept challenge")
  }
}

/**
 * Update challenge with challenged user's results and determine winner
 */
export async function completeChallenge(
  challengeId: string,
  challengedAttemptId: string,
  challengedScore: number,
  challengedTime: number
): Promise<{ winnerId: string | null; challengerXP: number; challengedXP: number }> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)

    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found")
    }

    const challengeData = challengeDoc.data() as Challenge
    const { challengerId, challengedId, challengerScore, challengerTime, questionIds, challengerAttemptId } = challengeData

    // Determine winner
    const winnerId = determineWinner(
      challengerId,
      challengedId,
      challengerScore,
      challengedScore,
      challengerTime,
      challengedTime
    )

    // Update challenge with results
    await updateDoc(challengeRef, {
      challengedAttemptId,
      challengedScore,
      challengedTime,
      winnerId,
      status: "completed",
      completedAt: serverTimestamp(),
    })

    // Award XP: winner gets double XP, loser gets 0
    const maxScore = questionIds.length
    let challengerXP = 0
    let challengedXP = 0

    // Get course title for activity
    const courseRef = doc(db, "courses", challengeData.courseId)
    const courseDoc = await getDoc(courseRef)
    const courseTitle = courseDoc.data()?.title || "Unknown Course"

    if (winnerId === challengerId) {
      challengerXP = await calculateChallengeXP(questionIds, challengerScore, maxScore)
      await awardXP(challengerId, challengerXP, "Quiz Challenge Victory", `Won challenge with score ${challengerScore}/${maxScore}`, { challengeId, score: challengerScore, maxScore })
      
      // Increment challenge wins for winner
      const winnerRef = doc(db, "users", challengerId)
      await updateDoc(winnerRef, {
        challengeWins: increment(1),
      })

      // Record community activity
      const { recordActivity } = await import("./community-pulse-utils")
      recordActivity(challengerId, "challenge_won", {
        courseId: challengeData.courseId,
        courseTitle,
      }).catch((error) => {
        console.error("Error recording challenge won activity:", error)
      })
    } else if (winnerId === challengedId) {
      challengedXP = await calculateChallengeXP(questionIds, challengedScore, maxScore)
      await awardXP(challengedId, challengedXP, "Quiz Challenge Victory", `Won challenge with score ${challengedScore}/${maxScore}`, { challengeId, score: challengedScore, maxScore })
      
      // Increment challenge wins for winner
      const winnerRef = doc(db, "users", challengedId)
      await updateDoc(winnerRef, {
        challengeWins: increment(1),
      })

      // Record community activity
      const { recordActivity } = await import("./community-pulse-utils")
      recordActivity(challengedId, "challenge_won", {
        courseId: challengeData.courseId,
        courseTitle,
      }).catch((error) => {
        console.error("Error recording challenge won activity:", error)
      })
    }

    return {
      winnerId,
      challengerXP,
      challengedXP,
    }
  } catch (error) {
    console.error("Error completing challenge:", error)
    throw new Error("Failed to complete challenge")
  }
}

/**
 * Reject a challenge
 */
export async function rejectChallenge(challengeId: string): Promise<void> {
  try {
    const challengeRef = doc(db, "challenges", challengeId)
    await updateDoc(challengeRef, {
      status: "rejected",
    })
  } catch (error) {
    console.error("Error rejecting challenge:", error)
    throw new Error("Failed to reject challenge")
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

