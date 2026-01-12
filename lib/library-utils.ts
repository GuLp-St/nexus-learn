import { db } from "./firebase"
import { doc, deleteDoc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore"
import { deleteFileFromUploadthing } from "./upload-actions"

/**
 * Remove a course from user's library by deleting the userCourseProgress entry
 * If the course is not public and there are no other subscribers, it's deleted entirely
 */
export async function removeCourseFromLibrary(userId: string, courseId: string): Promise<void> {
  try {
    // Delete the user's progress record first
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    await deleteDoc(progressRef)

    // Check if course should be deleted entirely from the main collection
    const courseRef = doc(db, "courses", courseId)
    const courseDoc = await getDoc(courseRef)
    
    if (courseDoc.exists()) {
      const courseData = courseDoc.data()
      
      // We only delete unpublished courses
      if (!courseData.isPublic) {
        // Check if ANY other user still has this course in their library
        const subscribersQuery = query(
          collection(db, "userCourseProgress"),
          where("courseId", "==", courseId),
          limit(1)
        )
        const subscribersSnapshot = await getDocs(subscribersQuery)
        
        // If NO one else has this course, delete the original course data
        if (subscribersSnapshot.empty) {
          // Clean up the image from Uploadthing if it exists
          if (courseData.imageKey) {
            await deleteFileFromUploadthing(courseData.imageKey);
          }
          await deleteDoc(courseRef)
        }
      }
    }
  } catch (error) {
    console.error("Error removing course from library:", error)
    throw new Error("Failed to remove course from library")
  }
}

