import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, runTransaction, increment } from "firebase/firestore"
import { calculateLevel } from "./level-utils"
import { isSameUTCDay, getUTCDateString, getUTCDateStringFromTimestamp } from "./date-utils"
import { trackQuestProgress } from "./event-bus"

export interface XPAwardResult {
  amount: number
  oldXP: number
  newXP: number
  oldLevel: number
  newLevel: number
  leveledUp: boolean
  source?: string
}

/**
 * Award XP to a user (updates user document)
 * Returns metadata about the XP award for UI notifications
 */
export async function awardXP(userId: string, amount: number, source?: string, description?: string, metadata?: Record<string, any>): Promise<XPAwardResult> {
  try {
    // Get current XP
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    
    if (!userDoc.exists()) {
      throw new Error("User not found")
    }

    const oldXP = userDoc.data().xp || 0
    const oldLevel = calculateLevel(oldXP)
    const newXP = oldXP + amount
    const newLevel = calculateLevel(newXP)
    const leveledUp = newLevel > oldLevel

    // Record community activity for level up
    if (leveledUp && newLevel > 1) {
      const { recordActivity } = await import("./community-pulse-utils")
      recordActivity(userId, "leveled_up", {
        newLevel,
      }).catch((error) => {
        console.error("Error recording level up activity:", error)
      })
    }

    // Update XP
    await updateDoc(userRef, {
      xp: increment(amount),
      updatedAt: serverTimestamp(),
    })

    // Record in history
    if (amount !== 0) {
      const { recordXPHistory } = await import("./xp-history-utils")
      await recordXPHistory(userId, amount, source || "XP Award", description, metadata).catch((error) => {
        console.error("Error recording XP history:", error)
        // Don't throw - history recording failures shouldn't block XP award
      })

      // Emit quest event for XP earned
      trackQuestProgress({
        type: "quest.xp_earned",
        userId,
        metadata: { xpAmount: amount },
      }).catch((error) => {
        console.error("Error emitting XP earned event:", error)
      })
    }

    // Check if user is online
    const { getUserPresence } = await import("./presence-utils")
    const presence = await getUserPresence(userId)
    const isOnline = presence?.isOnline || false

    // If user is offline, create a notification
    if (!isOnline && amount > 0) {
      const { createNotification } = await import("./notification-utils")
      await createNotification(userId, "xp_award", {
        amount,
        source,
        newLevel: leveledUp ? newLevel : undefined,
      }).catch((error) => {
        console.error("Error creating XP notification:", error)
      })
    }

    // Check badges after XP award (knowledge-seeker badge)
    const { checkAndUpdateBadges } = await import("./badge-utils")
    await checkAndUpdateBadges(userId).catch((error) => {
      console.error("Error checking badges:", error)
      // Don't throw - badge check failure shouldn't block XP award
    })

    return {
      amount,
      oldXP,
      newXP,
      oldLevel,
      newLevel,
      leveledUp,
      source,
    }
  } catch (error) {
    console.error("Error awarding XP:", error)
    throw new Error("Failed to award XP")
  }
}

/**
 * Check if module completion XP has already been awarded
 */
export async function hasAwardedModuleXP(
  userId: string,
  courseId: string,
  moduleIndex: number
): Promise<boolean> {
  try {
    const docId = `${userId}-module-completion-${courseId}-${moduleIndex}`
    const xpHistoryRef = doc(db, "userXPHistory", docId)
    const xpHistoryDoc = await getDoc(xpHistoryRef)
    return xpHistoryDoc.exists()
  } catch (error) {
    console.error("Error checking module XP history:", error)
    return false
  }
}

/**
 * Award module completion XP (+50 XP, one-time per module)
 */
export async function awardModuleCompletionXP(
  userId: string,
  courseId: string,
  moduleIndex: number
): Promise<XPAwardResult | null> {
  try {
    // Check if already awarded
    const alreadyAwarded = await hasAwardedModuleXP(userId, courseId, moduleIndex)
    if (alreadyAwarded) {
      return null // Already awarded, skip
    }

    const XP_AMOUNT = 50
    const result = await awardXP(userId, XP_AMOUNT, "Module Completion", `Completed module ${moduleIndex + 1}`, { courseId, moduleIndex })

    // Emit quest event
    trackQuestProgress({
      type: "quest.module_completed",
      userId,
      metadata: { courseId, moduleIndex },
    }).catch((error) => {
      console.error("Error emitting module completed event:", error)
    })

    return result
  } catch (error) {
    console.error("Error awarding module completion XP:", error)
    return null
  }
}

/**
 * Check if course completion XP has already been awarded
 */
export async function hasAwardedCourseXP(userId: string, courseId: string): Promise<boolean> {
  try {
    const docId = `${userId}-course-completion-${courseId}`
    const xpHistoryRef = doc(db, "userXPHistory", docId)
    const xpHistoryDoc = await getDoc(xpHistoryRef)
    return xpHistoryDoc.exists()
  } catch (error) {
    console.error("Error checking course XP history:", error)
    return false
  }
}

/**
 * Award course completion XP (+200 XP, one-time per course)
 */
export async function awardCourseCompletionXP(userId: string, courseId: string): Promise<XPAwardResult | null> {
  try {
    // Check if already awarded
    const alreadyAwarded = await hasAwardedCourseXP(userId, courseId)
    if (alreadyAwarded) {
      return null // Already awarded, skip
    }

    const XP_AMOUNT = 200
    const result = await awardXP(userId, XP_AMOUNT, "Course Completion", "Completed the entire course", { courseId })

    return result
  } catch (error) {
    console.error("Error awarding course completion XP:", error)
    return null
  }
}

/**
 * Check if question XP has already been awarded (user answered this question correctly before)
 */
export async function hasAnsweredQuestionBefore(
  userId: string,
  courseId: string,
  questionId: string
): Promise<boolean> {
  try {
    const docId = `${userId}-${courseId}-${questionId}`
    const quizXPRef = doc(db, "userQuizXP", docId)
    const quizXPDoc = await getDoc(quizXPRef)
    return quizXPDoc.exists()
  } catch (error) {
    console.error("Error checking question XP history:", error)
    return false
  }
}

/**
 * Award quiz question XP (+10 XP per correct answer, new questions only)
 */
export async function awardQuizQuestionXP(
  userId: string,
  courseId: string,
  questionId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<boolean> {
  try {
    // Check if already awarded
    const alreadyAwarded = await hasAnsweredQuestionBefore(userId, courseId, questionId)
    if (alreadyAwarded) {
      return false // Already awarded, skip
    }

    const XP_AMOUNT = 10
    const docId = `${userId}-${courseId}-${questionId}`

    // Use transaction to ensure atomicity
    await runTransaction(db, async (transaction) => {
      // Award XP
      const userRef = doc(db, "users", userId)
      const userDoc = await transaction.get(userRef)
      if (!userDoc.exists()) {
        throw new Error("User not found")
      }
      transaction.update(userRef, {
        xp: increment(XP_AMOUNT),
        updatedAt: serverTimestamp(),
      })

      // Record in userQuizXP for duplicate checking
      const quizXPRef = doc(db, "userQuizXP", docId)
      transaction.set(quizXPRef, {
        userId,
        courseId,
        questionId,
        quizType,
        moduleIndex: moduleIndex !== null && moduleIndex !== undefined ? moduleIndex : null,
        lessonIndex: lessonIndex !== null && lessonIndex !== undefined ? lessonIndex : null,
        xpAwarded: XP_AMOUNT,
        awardedAt: serverTimestamp(),
      })
    })

    // Record in XP history using the utility function (outside transaction)
    const { recordXPHistory } = await import("./xp-history-utils")
    await recordXPHistory(
      userId,
      XP_AMOUNT,
      "Quiz Question",
      "Correctly answered a new quiz question",
      {
        courseId,
        questionId,
        quizType,
        ...(moduleIndex !== null && moduleIndex !== undefined ? { moduleIndex } : {}),
        ...(lessonIndex !== null && lessonIndex !== undefined ? { lessonIndex } : {}),
      }
    ).catch((error) => {
      console.error("Error recording quiz question XP history:", error)
      // Don't throw - history recording failures shouldn't block XP award
    })

    // Emit quest event for XP earned
    const { trackQuestProgress } = await import("./event-bus")
    trackQuestProgress({
      type: "quest.xp_earned",
      userId,
      metadata: { xpAmount: XP_AMOUNT },
    }).catch((error) => {
      console.error("Error emitting XP earned event:", error)
    })

    return true // Successfully awarded
  } catch (error) {
    console.error("Error awarding quiz question XP:", error)
    throw new Error("Failed to award quiz question XP")
  }
}

/**
 * Check if perfect quiz bonus has been awarded for this quiz type
 */
export async function hasAwardedPerfectQuizBonus(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<boolean> {
  try {
    const typeId =
      quizType === "lesson"
        ? `${courseId}-${moduleIndex}-${lessonIndex}`
        : quizType === "module"
        ? `${courseId}-${moduleIndex}`
        : courseId
    const docId = `${userId}-perfect-quiz-${quizType}-${typeId}`
    const xpHistoryRef = doc(db, "userXPHistory", docId)
    const xpHistoryDoc = await getDoc(xpHistoryRef)
    return xpHistoryDoc.exists()
  } catch (error) {
    console.error("Error checking perfect quiz bonus history:", error)
    return false
  }
}

/**
 * Award perfect quiz bonus XP (+20 XP for 100% on first try)
 */
export async function awardPerfectQuizBonus(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<void> {
  try {
    // Check if already awarded
    const alreadyAwarded = await hasAwardedPerfectQuizBonus(
      userId,
      courseId,
      quizType,
      moduleIndex,
      lessonIndex
    )
    if (alreadyAwarded) {
      return // Already awarded, skip
    }

    const XP_AMOUNT = 20
    const typeId =
      quizType === "lesson"
        ? `${courseId}-${moduleIndex}-${lessonIndex}`
        : quizType === "module"
        ? `${courseId}-${moduleIndex}`
        : courseId
    const docId = `${userId}-perfect-quiz-${quizType}-${typeId}`

    // Use transaction to ensure atomicity
    await runTransaction(db, async (transaction) => {
      // Award XP
      const userRef = doc(db, "users", userId)
      const userDoc = await transaction.get(userRef)
      if (!userDoc.exists()) {
        throw new Error("User not found")
      }
      transaction.update(userRef, {
        xp: increment(XP_AMOUNT),
        updatedAt: serverTimestamp(),
      })

      // Mark as awarded in userXPHistory for duplicate checking
      const xpHistoryRef = doc(db, "userXPHistory", docId)
      transaction.set(xpHistoryRef, {
        userId,
        amount: XP_AMOUNT,
        source: "Perfect Quiz Bonus",
        description: `Got 100% on ${quizType} quiz`,
        createdAt: serverTimestamp(),
        courseId,
        quizType,
        ...(moduleIndex !== null && moduleIndex !== undefined ? { moduleIndex } : {}),
        ...(lessonIndex !== null && lessonIndex !== undefined ? { lessonIndex } : {}),
      })
    })

    // Record in XP history using the utility function (outside transaction)
    const { recordXPHistory } = await import("./xp-history-utils")
    await recordXPHistory(
      userId,
      XP_AMOUNT,
      "Perfect Quiz Bonus",
      `Got 100% on ${quizType} quiz`,
      {
        courseId,
        quizType,
        ...(moduleIndex !== null && moduleIndex !== undefined ? { moduleIndex } : {}),
        ...(lessonIndex !== null && lessonIndex !== undefined ? { lessonIndex } : {}),
      }
    ).catch((error) => {
      console.error("Error recording perfect quiz bonus XP history:", error)
      // Don't throw - history recording failures shouldn't block XP award
    })

    // Record community activity for perfect quiz
    const { getDoc } = await import("firebase/firestore")
    const courseRef = doc(db, "courses", courseId)
    const courseDoc = await getDoc(courseRef)
    const courseTitle = courseDoc.data()?.title || "Unknown Course"
    const { recordActivity } = await import("./community-pulse-utils")
    recordActivity(userId, "perfect_quiz", {
      courseId,
      courseTitle,
    }).catch((error) => {
      console.error("Error recording perfect quiz activity:", error)
    })
  } catch (error) {
    console.error("Error awarding perfect quiz bonus XP:", error)
    throw new Error("Failed to award perfect quiz bonus XP")
  }
}

/**
 * Check and award daily login XP (+10 XP, once per day)
 */
export async function checkAndAwardDailyLoginXP(userId: string): Promise<XPAwardResult | null> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return null
    }

    const userData = userDoc.data()
    const lastDailyLogin = userData.lastDailyLogin as Timestamp | undefined

    // Check if we've already awarded today (using UTC)
    if (lastDailyLogin) {
      // Check if last login was today in UTC
      const todayUTC = getUTCDateString()
      const lastLoginUTC = getUTCDateStringFromTimestamp(lastDailyLogin)
      
      if (todayUTC === lastLoginUTC) {
        return null // Already awarded today
      }
    }

    // Award daily login XP
    const XP_AMOUNT = 10
    const currentStreak = userData.dailyLoginStreak || 0
    const newStreak = lastDailyLogin ? currentStreak + 1 : 1

    const result = await awardXP(userId, XP_AMOUNT, "Daily Login", "Logged in today")

    await updateDoc(userRef, {
      lastDailyLogin: serverTimestamp(),
      dailyLoginStreak: newStreak,
    })

    return result
  } catch (error) {
    console.error("Error awarding daily login XP:", error)
    return null
  }
}

/**
 * Check if course publish XP has already been awarded
 */
export async function hasAwardedCoursePublishXP(userId: string, courseId: string): Promise<boolean> {
  try {
    const docId = `${userId}-course-publish-${courseId}`
    const xpHistoryRef = doc(db, "userXPHistory", docId)
    const xpHistoryDoc = await getDoc(xpHistoryRef)
    return xpHistoryDoc.exists()
  } catch (error) {
    console.error("Error checking course publish XP history:", error)
    return false
  }
}

/**
 * Award course publish XP (+100 XP when course becomes public)
 */
export async function awardCoursePublishXP(userId: string, courseId: string): Promise<XPAwardResult | null> {
  try {
    // Check if already awarded
    const alreadyAwarded = await hasAwardedCoursePublishXP(userId, courseId)
    if (alreadyAwarded) {
      return null
    }

    const XP_AMOUNT = 100
    const result = await awardXP(userId, XP_AMOUNT, "Course Published", "Published a course", { courseId })

    return result
  } catch (error) {
    console.error("Error awarding course publish XP:", error)
    return null
  }
}

