import { db } from "./firebase"
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { XPAwardResult } from "./xp-utils"

export interface CourseRating {
  userId: string
  courseId: string
  rating: number // 1-5
  review?: string
  createdAt?: any
}

/**
 * Submit a rating for a course
 */
export async function submitCourseRating(
  userId: string,
  courseId: string,
  rating: number,
  review?: string
): Promise<XPAwardResult | null> {
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5")
  }

  // Save rating
  const ratingRef = doc(db, "courseRatings", `${userId}-${courseId}`)
  await setDoc(
    ratingRef,
    {
      userId,
      courseId,
      rating,
      review,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  )

  // Update course average rating
  await updateCourseRating(courseId)

  // Emit quest event for course rating
  const { trackQuestProgress } = await import("./event-bus")
  trackQuestProgress({
    type: "quest.course_rated",
    userId,
    metadata: { courseId, rating },
  }).catch((error) => {
    console.error("Error emitting course rated event:", error)
  })

  // No longer auto-publish on rating - users must use the publish page
  return null
}

/**
 * Get user's rating for a course
 */
export async function getUserRating(userId: string, courseId: string): Promise<number | null> {
  try {
    const ratingRef = doc(db, "courseRatings", `${userId}-${courseId}`)
    const ratingDoc = await getDoc(ratingRef)
    if (ratingDoc.exists()) {
      return ratingDoc.data().rating || null
    }
    return null
  } catch (error) {
    console.error("Error fetching user rating:", error)
    return null
  }
}

/**
 * Get average rating for a course
 */
export async function getCourseAverageRating(courseId: string): Promise<number | null> {
  try {
    const ratingsQuery = query(collection(db, "courseRatings"), where("courseId", "==", courseId))
    const snapshot = await getDocs(ratingsQuery)

    if (snapshot.empty) {
      return null
    }

    let total = 0
    let count = 0

    snapshot.forEach((doc) => {
      const rating = doc.data().rating
      if (rating && rating >= 1 && rating <= 5) {
        total += rating
        count++
      }
    })

    return count > 0 ? Math.round((total / count) * 10) / 10 : null // Round to 1 decimal
  } catch (error) {
    console.error("Error calculating average rating:", error)
    return null
  }
}

/**
 * Update course's average rating and rating count
 */
async function updateCourseRating(courseId: string): Promise<void> {
  try {
    const averageRating = await getCourseAverageRating(courseId)
    const ratingsQuery = query(collection(db, "courseRatings"), where("courseId", "==", courseId))
    const snapshot = await getDocs(ratingsQuery)
    const ratingCount = snapshot.size

    const courseRef = doc(db, "courses", courseId)
    await updateDoc(courseRef, {
      averageRating: averageRating || 0,
      ratingCount: ratingCount,
    })
  } catch (error) {
    console.error("Error updating course rating:", error)
  }
}
