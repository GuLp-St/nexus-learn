import { db } from "./firebase"
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, query, where, collection, orderBy, limit } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { QuizAttempt, getMostRecentQuizAttempt } from "./quiz-utils"
import { getCourseWithProgress } from "./course-utils"
import { spendNexon } from "./nexon-utils"
import { calculateLevel } from "./level-utils"
import {
  PUBLISH_MIN_QUIZ_SCORE,
  PUBLISH_MIN_LEVEL,
  PUBLISH_NEXON_COST,
  REPUBLISH_NEXON_COST,
} from "./course-constants"

const MIN_QUIZ_SCORE = PUBLISH_MIN_QUIZ_SCORE
const MIN_LEVEL = PUBLISH_MIN_LEVEL

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

  // Check quiz score (>70%) — honor admin-set finalQuizScore on progress
  let quizPassed = false
  let quizScore: number | undefined = undefined

  const finalFromProgress = courseWithProgress.userProgress?.finalQuizScore

  if (courseCompleted) {
    if (finalFromProgress !== null && finalFromProgress !== undefined) {
      quizScore = finalFromProgress
      quizPassed = finalFromProgress >= MIN_QUIZ_SCORE
    } else {
      const courseQuizAttempt = await getMostRecentQuizAttempt(userId, courseId, "course", null, null)

      if (courseQuizAttempt && courseQuizAttempt.scores) {
        const totalQuestions = courseQuizAttempt.questionIds?.length || 0
        if (totalQuestions > 0) {
          const correctCount = Object.values(courseQuizAttempt.scores).filter(
            (score: { correct?: boolean }) => score?.correct === true
          ).length
          quizScore = Math.round((correctCount / totalQuestions) * 100)
          quizPassed = quizScore >= MIN_QUIZ_SCORE
        }
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

  const { awardCoursePublishXP } = await import("./xp-utils")
  await awardCoursePublishXP(userId, courseId).catch((error) => {
    console.error("Error awarding publish XP:", error)
  })

  return { success: true }
}

export interface RepublishRequirements {
  isCreator: boolean
  isPublished: boolean
  hasEnoughNexon: boolean
  currentNexon: number
  canRepublish: boolean
}

export async function checkRepublishRequirements(
  userId: string,
  courseId: string
): Promise<RepublishRequirements> {
  const courseWithProgress = await getCourseWithProgress(courseId, userId)
  if (!courseWithProgress) {
    throw new Error("Course not found")
  }

  const isCreator = courseWithProgress.createdBy === userId
  const isPublished = courseWithProgress.isPublic === true

  const userDoc = await getDoc(doc(db, "users", userId))
  const userData = userDoc.exists() ? userDoc.data() : {}
  const currentNexon = userData.nexon || 0
  const hasEnoughNexon = currentNexon >= REPUBLISH_NEXON_COST

  return {
    isCreator,
    isPublished,
    hasEnoughNexon,
    currentNexon,
    canRepublish: isCreator && isPublished && hasEnoughNexon,
  }
}

/**
 * Push updates to a published course (deducts Nexon, bumps content version).
 */
export async function republishCourse(
  userId: string,
  courseId: string,
  updates: {
    title?: string
    description?: string
    imageUrl?: string
    imageKey?: string
    imageConfig?: { fit: "cover" | "contain"; position: { x: number; y: number }; scale: number }
    tags?: string[]
    changelog?: string
  }
): Promise<{ success: boolean; contentVersion: number }> {
  const requirements = await checkRepublishRequirements(userId, courseId)
  if (!requirements.canRepublish) {
    throw new Error("Republish requirements not met")
  }

  const courseRef = doc(db, "courses", courseId)
  const courseDoc = await getDoc(courseRef)
  if (!courseDoc.exists()) {
    throw new Error("Course not found")
  }

  const currentVersion = (courseDoc.data()?.contentVersion as number) || 1
  const nextVersion = currentVersion + 1
  const courseTitle = courseDoc.data()?.title || updates.title || "Untitled Course"

  await spendNexon(
    userId,
    REPUBLISH_NEXON_COST,
    `Republished course: ${courseTitle}`,
    { courseId }
  )

  await updateDoc(courseRef, {
    contentVersion: nextVersion,
    lastRepublishedAt: serverTimestamp(),
    republishCostNexon: REPUBLISH_NEXON_COST,
    ...(updates.changelog && { lastChangelog: updates.changelog }),
    ...(updates.title && { title: updates.title }),
    ...(updates.description && { description: updates.description }),
    ...(updates.imageUrl && { imageUrl: updates.imageUrl }),
    ...(updates.imageKey && { imageKey: updates.imageKey }),
    ...(updates.imageConfig && { imageConfig: updates.imageConfig }),
    ...(updates.tags && { tags: updates.tags }),
  })

  const { recordActivity } = await import("./community-pulse-utils")
  recordActivity(userId, "course_republished", {
    courseId,
    courseTitle,
    contentVersion: nextVersion,
  }).catch((error) => {
    console.error("Error recording course republished activity:", error)
  })

  return { success: true, contentVersion: nextVersion }
}

