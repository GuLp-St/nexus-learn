import { db } from "./firebase"
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, query, where, collection, orderBy, limit } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizAttempt, getMostRecentQuizAttempt } from "./quiz-utils"
import { getCourseWithProgress } from "./course-utils"

const PUBLISH_XP_COST = 500
const MIN_QUIZ_SCORE = 80 // Minimum quiz score percentage to publish

export interface PublishRequirements {
  courseCompleted: boolean
  quizPassed: boolean
  quizScore?: number
  hasEnoughXP: boolean
  currentXP: number
  canPublish: boolean
}

/**
 * Check if user meets requirements to publish a course
 */
export async function checkPublishRequirements(
  userId: string,
  courseId: string
): Promise<PublishRequirements> {
  const courseWithProgress = await getCourseWithProgress(courseId, userId)
  
  if (!courseWithProgress) {
    throw new Error("Course not found")
  }

  // Check if user is the creator
  if (courseWithProgress.createdBy !== userId) {
    throw new Error("Only the course creator can publish")
  }

  // Check if course is already public
  if (courseWithProgress.isPublic) {
    throw new Error("Course is already published")
  }

  // Check course completion (100%)
  const courseCompleted = (courseWithProgress.userProgress?.progress || 0) >= 100

  // Check quiz score (>80%)
  let quizPassed = false
  let quizScore: number | undefined = undefined

  if (courseCompleted) {
    const courseQuizAttempt = await getMostRecentQuizAttempt(userId, courseId, "course", null, null)
    
    if (courseQuizAttempt && courseQuizAttempt.scores) {
      const totalQuestions = courseQuizAttempt.questionIds?.length || 0
      if (totalQuestions > 0) {
        // Calculate score from scores object (count correct answers)
        const correctCount = Object.values(courseQuizAttempt.scores).filter(
          (score: any) => score?.correct === true
        ).length
        quizScore = Math.round((correctCount / totalQuestions) * 100)
        quizPassed = quizScore >= MIN_QUIZ_SCORE
      }
    }
  }

  // Check XP balance
  const userDoc = await getDoc(doc(db, "users", userId))
  const currentXP = userDoc.exists() ? (userDoc.data().xp || 0) : 0
  const hasEnoughXP = currentXP >= PUBLISH_XP_COST

  const canPublish = courseCompleted && quizPassed && hasEnoughXP

  return {
    courseCompleted,
    quizPassed,
    quizScore,
    hasEnoughXP,
    currentXP,
    canPublish,
  }
}

/**
 * Publish a course (deducts XP, updates course metadata)
 */
export async function publishCourse(
  userId: string,
  courseId: string,
  updates: {
    title?: string
    description?: string
    imageUrl?: string
    tags?: string[]
  }
): Promise<XPAwardResult> {
  // Verify requirements
  const requirements = await checkPublishRequirements(userId, courseId)
  
  if (!requirements.canPublish) {
    throw new Error("Publish requirements not met")
  }

  // Deduct XP
  const userRef = doc(db, "users", userId)
  const userDoc = await getDoc(userRef)
  
  if (!userDoc.exists()) {
    throw new Error("User not found")
  }

  const oldXP = userDoc.data().xp || 0
  const newXP = oldXP - PUBLISH_XP_COST

  if (newXP < 0) {
    throw new Error("Insufficient XP")
  }

  // Update user XP
  await updateDoc(userRef, {
    xp: newXP,
    updatedAt: serverTimestamp(),
  })

  // Record XP deduction in history
  const { recordXPHistory } = await import("./xp-history-utils")
  await recordXPHistory(userId, -PUBLISH_XP_COST, "Course Publishing", `Published course: ${updates.title || courseId}`, { courseId }).catch((error) => {
    console.error("Error recording XP history:", error)
    // Don't throw - history recording failures shouldn't block publishing
  })

  // Get course title for activity
  const courseRef = doc(db, "courses", courseId)
  const courseDoc = await getDoc(courseRef)
  const courseTitle = courseDoc.data()?.title || updates.title || "Untitled Course"

  // Update course
  await updateDoc(courseRef, {
    isPublic: true,
    publishedAt: serverTimestamp(),
    publishXP: PUBLISH_XP_COST,
    ...(updates.title && { title: updates.title }),
    ...(updates.description && { description: updates.description }),
    ...(updates.imageUrl && { imageUrl: updates.imageUrl }),
    ...(updates.tags && { tags: updates.tags }),
  })

  // Record community activity
  const { recordActivity } = await import("./community-pulse-utils")
  recordActivity(userId, "course_published", {
    courseId,
    courseTitle,
  }).catch((error) => {
    console.error("Error recording course published activity:", error)
  })

  // Return XP deduction result (negative amount for deduction)
  return {
    amount: -PUBLISH_XP_COST,
    oldXP,
    newXP,
    oldLevel: Math.floor(Math.sqrt(oldXP / 100)),
    newLevel: Math.floor(Math.sqrt(newXP / 100)),
    leveledUp: false,
    source: "Course Publishing",
  }
}

