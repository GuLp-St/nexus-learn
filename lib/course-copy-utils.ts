import { db } from "./firebase"
import { collection, doc, getDoc, setDoc, serverTimestamp, getDocs, query, where, updateDoc, increment } from "firebase/firestore"
import { ensureUserProgress } from "./course-utils"
import { awardCourseAdditionRoyalty } from "./royalty-utils"

/**
 * Copy a course to a user's library (adds to library with progress tracking)
 */
export async function copyCourseToUserLibrary(userId: string, courseId: string): Promise<string> {
  // Get the original course
  const originalCourseDoc = await getDoc(doc(db, "courses", courseId))
  if (!originalCourseDoc.exists()) {
    throw new Error("Course not found")
  }

  const originalCourseData = originalCourseDoc.data()
  const publisherId = originalCourseData.createdBy

  // Check if user already has progress for this course
  const existingProgressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
  const existingProgressDoc = await getDoc(existingProgressRef)
  
  if (existingProgressDoc.exists()) {
    // User already has this course in their library, return courseId
    return courseId
  }

  // Check if user already added this course (in courseAdditions collection)
  const additionsQuery = query(
    collection(db, "courseAdditions"),
    where("userId", "==", userId),
    where("courseId", "==", courseId)
  )
  const additionsSnapshot = await getDocs(additionsQuery)
  const alreadyAdded = !additionsSnapshot.empty

  // Create user progress entry (user doesn't own the course, just added it)
  await ensureUserProgress(userId, courseId, false, courseId)

  // Emit quest event for course added
  const { emitQuestEvent } = await import("./event-bus")
  emitQuestEvent({
    type: "quest.course_added",
    userId,
    metadata: { courseId },
  }).catch((error) => {
    console.error("Error emitting course added event:", error)
  })

  // Record in courseAdditions collection and award royalty (if not self-add and not already recorded)
  if (!alreadyAdded && publisherId && publisherId !== userId) {
    await setDoc(doc(db, "courseAdditions", `${userId}_${courseId}`), {
      userId,
      courseId,
      addedAt: serverTimestamp(),
      isPublisher: false,
    })

    // Award royalty to publisher
    await awardCourseAdditionRoyalty(publisherId, courseId, userId).catch((error) => {
      console.error("Error awarding course addition royalty:", error)
    })

    // Update original course's addedCount and addedBy
    const originalCourseRef = doc(db, "courses", courseId)
    const currentData = originalCourseData
    const currentAddedBy = currentData.addedBy || []
    if (!currentAddedBy.includes(userId)) {
      await updateDoc(originalCourseRef, {
        addedCount: increment(1),
        addedBy: [...currentAddedBy, userId],
      })
    }
  }

  return courseId
}

