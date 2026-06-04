import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"

/** Create initial progress for a newly created course (server / Admin SDK). */
export async function ensureUserProgressAdmin(
  userId: string,
  courseId: string,
  isOwnCourse = false
): Promise<void> {
  const db = getAdminFirestore()
  const progressId = `${userId}-${courseId}`
  const progressRef = db.collection("userCourseProgress").doc(progressId)
  const progressSnap = await progressRef.get()

  const courseSnap = await db.collection("courses").doc(courseId).get()
  const courseData = courseSnap.data()
  const courseCreatedBy = courseData?.createdBy

  if (!progressSnap.exists) {
    let totalLessons = 0
    if (courseData && Array.isArray(courseData.modules)) {
      for (const module of courseData.modules) {
        if (Array.isArray(module.lessons)) {
          totalLessons += module.lessons.length
        }
      }
    }

    await progressRef.set({
      userId,
      courseId,
      progress: 0,
      completedLessons: [],
      moduleQuizScores: {},
      finalQuizScore: null,
      claimedRewards: {},
      createdAt: FieldValue.serverTimestamp(),
      lastAccessed: FieldValue.serverTimestamp(),
      isOwnCourse: isOwnCourse || courseCreatedBy === userId,
      addedFrom: null,
      totalLessons,
    })
    return
  }

  const updates: Record<string, unknown> = {
    lastAccessed: FieldValue.serverTimestamp(),
  }
  const existing = progressSnap.data()
  if (existing?.isOwnCourse === undefined) {
    updates.isOwnCourse = isOwnCourse || courseCreatedBy === userId
  }
  await progressRef.update(updates)
}
