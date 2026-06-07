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
    const modulesMasteredSet = new Set<string>()
    let totalQuizScore = 0
    let totalQuizMaxScore = 0
    let perfectFinalQuizzes = 0

    // Quiz attempts (real plays)
    const attemptsQuery = query(
      collection(db, "quizAttempts"),
      where("userId", "==", userId)
    )
    const attemptsSnapshot = await getDocs(attemptsQuery)

    attemptsSnapshot.forEach((docSnap) => {
      const attempt = docSnap.data() as QuizAttempt

      if (!attempt.completedAt || (attempt as { abandoned?: boolean }).abandoned) {
        return
      }

      const scorePercentage = attempt.maxScore > 0
        ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
        : 0

      if (attempt.quizType === "module" && attempt.moduleIndex !== null && attempt.moduleIndex !== undefined) {
        if (scorePercentage === 100) {
          modulesMasteredSet.add(`${attempt.courseId}-${attempt.moduleIndex}`)
        }
      }

      if (attempt.quizType === "module" || attempt.quizType === "course") {
        totalQuizScore += attempt.totalScore
        totalQuizMaxScore += attempt.maxScore
      }

      if (attempt.quizType === "course" && scorePercentage === 100) {
        perfectFinalQuizzes++
      }
    })

    // Progress records (admin-set scores, completions without attempts)
    const progressQuery = query(
      collection(db, "userCourseProgress"),
      where("userId", "==", userId)
    )
    const progressSnapshot = await getDocs(progressQuery)

    progressSnapshot.forEach((docSnap) => {
      const progress = docSnap.data()
      const courseId = progress.courseId as string
      const moduleQuizScores = (progress.moduleQuizScores || {}) as Record<string, number>
      const finalQuizScore = progress.finalQuizScore as number | null | undefined

      for (const [modKey, rawScore] of Object.entries(moduleQuizScores)) {
        const score = Number(rawScore)
        if (score >= 100) {
          modulesMasteredSet.add(`${courseId}-${modKey}`)
        }
        if (score > 0) {
          totalQuizScore += score
          totalQuizMaxScore += 100
        }
      }

      if (finalQuizScore !== null && finalQuizScore !== undefined) {
        totalQuizScore += finalQuizScore
        totalQuizMaxScore += 100
        if (finalQuizScore >= 100) {
          perfectFinalQuizzes++
        }
      }
    })

    const modulesMastered = modulesMasteredSet.size
    const performanceRating = totalQuizMaxScore > 0
      ? Math.round((totalQuizScore / totalQuizMaxScore) * 100)
      : 0

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

