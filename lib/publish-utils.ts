import { db } from "./firebase"
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, query, where, collection, orderBy, limit } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizAttempt, getMostRecentQuizAttempt } from "./quiz-utils"
import { getCourseWithProgress } from "./course-utils"
import { spendNexon } from "./nexon-utils"
import { calculateLevel } from "./level-utils"

const PUBLISH_NEXON_COST = 500
const MIN_LEVEL = 5
const MIN_QUIZ_SCORE = 70 // Minimum quiz score percentage to publish

export interface PublishRequirements {
  courseCompleted: boolean
  quizPassed: boolean
  quizScore?: number
  hasEnoughNexon: boolean
  currentNexon: number
  isLevelFive: boolean
  currentLevel: number
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

  // Check quiz score (>70%)
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

  // Check Nexon balance and Level
  const userDoc = await getDoc(doc(db, "users", userId))
  const userData = userDoc.exists() ? userDoc.data() : {}
  const currentNexon = userData.nexon || 0
  const currentXP = userData.xp || 0
  const currentLevel = calculateLevel(currentXP)
  
  const hasEnoughNexon = currentNexon >= PUBLISH_NEXON_COST
  const isLevelFive = currentLevel >= MIN_LEVEL

  const canPublish = courseCompleted && quizPassed && hasEnoughNexon && isLevelFive

  return {
    courseCompleted,
    quizPassed,
    quizScore,
    hasEnoughNexon,
    currentNexon,
    isLevelFive,
    currentLevel,
    canPublish,
  }
}

/**
 * Publish a course (deducts Nexon, updates course metadata)
 */
export async function publishCourse(
  userId: string,
  courseId: string,
  updates: {
    title?: string
    description?: string
    imageUrl?: string
    imageKey?: string
    imageConfig?: { fit: "cover" | "contain"; position: { x: number; y: number }; scale: number }
    tags?: string[]
  }
): Promise<any> {
  // Verify requirements
  const requirements = await checkPublishRequirements(userId, courseId)
  
  if (!requirements.canPublish) {
    throw new Error("Publish requirements not met")
  }

  // Deduct Nexon
  await spendNexon(userId, PUBLISH_NEXON_COST, `Published course: ${updates.title || courseId}`, { courseId })

  // Get course title for activity
  const courseRef = doc(db, "courses", courseId)
  const courseDoc = await getDoc(courseRef)
  const courseTitle = courseDoc.data()?.title || updates.title || "Untitled Course"

  // Update course
  await updateDoc(courseRef, {
    isPublic: true,
    publishedAt: serverTimestamp(),
    publishCostNexon: PUBLISH_NEXON_COST,
    ...(updates.title && { title: updates.title }),
    ...(updates.description && { description: updates.description }),
    ...(updates.imageUrl && { imageUrl: updates.imageUrl }),
    ...(updates.imageKey && { imageKey: updates.imageKey }),
    ...(updates.imageConfig && { imageConfig: updates.imageConfig }),
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

  return { success: true }
}

