import { getAdminFirestore } from "./firebase-admin"
import { deleteAllCourseAssets } from "./course-image-cleanup"

/** Admin: remove a course from a user's library (same rules as library-utils). */
export async function removeCourseFromLibraryAdmin(
  userId: string,
  courseId: string
): Promise<void> {
  const db = getAdminFirestore()
  const progressId = `${userId}-${courseId}`
  await db.collection("userCourseProgress").doc(progressId).delete()

  const courseRef = db.collection("courses").doc(courseId)
  const courseSnap = await courseRef.get()

  if (!courseSnap.exists) return

  const courseData = courseSnap.data()!
  if (courseData.isPublic) return

  const subscribers = await db
    .collection("userCourseProgress")
    .where("courseId", "==", courseId)
    .limit(1)
    .get()

  if (!subscribers.empty) return

  await deleteAllCourseAssets({
    imageKey:
      typeof courseData.imageKey === "string" ? courseData.imageKey : undefined,
    sourceMaterialId:
      typeof courseData.sourceMaterialId === "string"
        ? courseData.sourceMaterialId
        : undefined,
  })
  await courseRef.delete()
}
