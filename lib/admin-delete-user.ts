import { FieldValue } from "firebase-admin/firestore"
import { getAdminAuth, getAdminFirestore } from "./firebase-admin"
import { deleteAllCourseAssets } from "./course-image-cleanup"

/**
 * Remove a user's library entry and delete orphaned private courses
 * (same rules as library-utils.removeCourseFromLibrary).
 */
async function removeUserCourseFromLibraryAdmin(
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
    imageKey: typeof courseData.imageKey === "string" ? courseData.imageKey : undefined,
    sourceMaterialId:
      typeof courseData.sourceMaterialId === "string"
        ? courseData.sourceMaterialId
        : undefined,
  })
  await courseRef.delete()
}

/** Delete a user account and clean up library courses (admin only). */
export async function deleteUserAccountAdmin(targetUserId: string): Promise<void> {
  const db = getAdminFirestore()

  const progressSnap = await db
    .collection("userCourseProgress")
    .where("userId", "==", targetUserId)
    .get()

  for (const docSnap of progressSnap.docs) {
    const courseId = docSnap.data().courseId as string
    if (courseId) {
      await removeUserCourseFromLibraryAdmin(targetUserId, courseId)
    } else {
      await docSnap.ref.delete()
    }
  }

  // Best-effort cleanup of common user-linked collections
  const batchDeletes = async (collectionName: string, field: string) => {
    const snap = await db.collection(collectionName).where(field, "==", targetUserId).get()
    if (snap.empty) return
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  await Promise.all([
    batchDeletes("notifications", "userId"),
    batchDeletes("userQuests", "userId"),
    batchDeletes("nexonHistory", "userId"),
    batchDeletes("courseCreationJobs", "userId"),
  ]).catch((err) => console.warn("[admin delete] secondary cleanup:", err))

  await db.collection("users").doc(targetUserId).delete()

  try {
    await getAdminAuth().deleteUser(targetUserId)
  } catch (err) {
    console.warn("[admin delete] Firebase Auth user may already be gone:", err)
  }
}

/** Set or remove admin role on a user document. */
export async function setUserRoleAdmin(
  targetUserId: string,
  role: "admin" | "user" | null
): Promise<void> {
  const db = getAdminFirestore()
  const ref = db.collection("users").doc(targetUserId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new Error("User not found")
  }

  if (role === "admin") {
    await ref.update({ role: "admin", updatedAt: FieldValue.serverTimestamp() })
  } else {
    await ref.update({ role: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  }
}
