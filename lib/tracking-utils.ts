import { db } from "./firebase"
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore"
import { QuizAttempt } from "./quiz-utils"

/**
 * Calculate and update user tracking metrics
 */
export async function updateUserTrackingMetrics(userId: string): Promise<{
  modulesMastered: number
  performanceRating: number
  gradeS: number
}> {
  try {
    // Get all quiz attempts
    const attemptsQuery = query(
      collection(db, "quizAttempts"),
      where("userId", "==", userId)
    )
    const attemptsSnapshot = await getDocs(attemptsQuery)

    // Track modules with 100% scores (once per module)
    const modulesMasteredSet = new Set<string>()
    let totalQuizScore = 0
    let totalQuizMaxScore = 0
    let perfectFinalQuizzes = 0

    attemptsSnapshot.forEach((docSnap) => {
      const attempt = docSnap.data() as QuizAttempt
      
      // Only count completed quizzes
      if (!attempt.completedAt || (attempt as any).abandoned) {
        return
      }

      // Calculate score percentage
      const scorePercentage = attempt.maxScore > 0 
        ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
        : 0

      // Modules Mastered: 100% on module quiz (once per module)
      if (attempt.quizType === "module" && attempt.moduleIndex !== null && attempt.moduleIndex !== undefined) {
        if (scorePercentage === 100) {
          const moduleKey = `${attempt.courseId}-${attempt.moduleIndex}`
          modulesMasteredSet.add(moduleKey)
        }
      }

      // Performance Rating: average percentage across all module and final quizzes
      if (attempt.quizType === "module" || attempt.quizType === "course") {
        totalQuizScore += attempt.totalScore
        totalQuizMaxScore += attempt.maxScore
      }

      // Grade S: count of perfect final quiz scores
      if (attempt.quizType === "course" && scorePercentage === 100) {
        perfectFinalQuizzes++
      }
    })

    const modulesMastered = modulesMasteredSet.size
    const performanceRating = totalQuizMaxScore > 0
      ? Math.round((totalQuizScore / totalQuizMaxScore) * 100)
      : 0

    // Update user document
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      modulesMastered,
      performanceRating,
      gradeS: perfectFinalQuizzes,
    })

    return {
      modulesMastered,
      performanceRating,
      gradeS: perfectFinalQuizzes,
    }
  } catch (error) {
    console.error("Error updating user tracking metrics:", error)
    return {
      modulesMastered: 0,
      performanceRating: 0,
      gradeS: 0,
    }
  }
}

/**
 * Get user tracking metrics
 */
export async function getUserTrackingMetrics(userId: string): Promise<{
  modulesMastered: number
  performanceRating: number
  gradeS: number
}> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    
    if (!userDoc.exists()) {
      return { modulesMastered: 0, performanceRating: 0, gradeS: 0 }
    }

    const data = userDoc.data()
    return {
      modulesMastered: data.modulesMastered || 0,
      performanceRating: data.performanceRating || 0,
      gradeS: data.gradeS || 0,
    }
  } catch (error) {
    console.error("Error getting user tracking metrics:", error)
    return { modulesMastered: 0, performanceRating: 0, gradeS: 0 }
  }
}

