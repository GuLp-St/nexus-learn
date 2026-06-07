import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { CourseData } from "./gemini"
import { creditsFromUser, type CreationCreditType } from "./course-creation-credits-shared"
import { omitUndefinedDeep } from "./firestore-sanitize"
import { ensureUserProgressAdmin } from "./ensure-user-progress-admin"
import { checkCanAddGeneratedCourseAdmin } from "./course-limit-server"

/**
 * Atomically create a private course and consume the matching creation credit (Admin SDK).
 */
export async function createCourseAndConsumeCredit(
  userId: string,
  courseData: CourseData,
  creditType: CreationCreditType,
  sourceMaterialId?: string
): Promise<string> {
  const limitCheck = await checkCanAddGeneratedCourseAdmin(userId)
  if (!limitCheck.ok) {
    throw new Error(limitCheck.error)
  }

  const db = getAdminFirestore()
  const courseRef = db.collection("courses").doc()

  const courseId = await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(userId)
    const userSnap = await transaction.get(userRef)

    if (!userSnap.exists) {
      throw new Error("User not found")
    }

    const credits = creditsFromUser(userSnap.data())
    if (!credits[creditType]) {
      throw new Error(
        `No ${creditType === "ai" ? "AI" : "upload"} creation credit available. Pay the fee and try again.`
      )
    }

    transaction.set(courseRef, {
      ...omitUndefinedDeep({
        ...courseData,
        isPublic: false,
        createdBy: userId,
        averageRating: 0,
        ratingCount: 0,
        addedCount: 0,
        addedBy: [],
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      }),
      createdAt: FieldValue.serverTimestamp(),
    })

    transaction.update(userRef, {
      [`courseCreationCredits.${creditType}`]: false,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return courseRef.id
  })

  await ensureUserProgressAdmin(userId, courseId, true)

  const { emitQuestEvent } = await import("./event-bus")
  emitQuestEvent({
    type: "quest.course_added",
    userId,
    metadata: { courseId },
  }).catch((error) => {
    console.error("Error emitting course added event:", error)
  })

  return courseId
}
