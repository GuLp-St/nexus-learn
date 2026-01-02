import { db } from "./firebase"
import { doc, deleteDoc } from "firebase/firestore"

/**
 * Remove a course from user's library by deleting the userCourseProgress entry
 */
export async function removeCourseFromLibrary(userId: string, courseId: string): Promise<void> {
  try {
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    await deleteDoc(progressRef)
  } catch (error) {
    console.error("Error removing course from library:", error)
    throw new Error("Failed to remove course from library")
  }
}

