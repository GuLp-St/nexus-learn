import { db } from "./firebase"
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from "firebase/firestore"
import { awardXP } from "./xp-utils"

const ROYALTY_NEXON_AMOUNT = 5 // Nexon awarded to publisher when someone adds their course

/**
 * Award royalty Nexon to a course publisher when someone adds their course
 */
export async function awardCourseAdditionRoyalty(
  publisherId: string,
  courseId: string,
  userId: string // The user who added the course
): Promise<void> {
  try {
    // Check if user is the publisher (shouldn't happen, but double-check)
    if (publisherId === userId) {
      return // No royalty for self-adds
    }

    // Check if this addition was already recorded (prevent duplicate awards)
    const additionDocId = `${userId}_${courseId}`
    const additionDoc = await getDoc(doc(db, "courseAdditions", additionDocId))
    
    if (!additionDoc.exists()) {
      // This shouldn't happen if called from copyCourseToUserLibrary, but handle gracefully
      console.warn("Course addition record not found, skipping royalty award")
      return
    }

    const additionData = additionDoc.data()
    
    // Check if this is the publisher adding their own course (shouldn't happen)
    if (additionData.isPublisher) {
      return // No royalty for self-adds
    }

    // Award Nexon to publisher (+5 per addition)
    const { awardNexon } = await import("./nexon-utils")
    await awardNexon(publisherId, ROYALTY_NEXON_AMOUNT, "Course Addition Royalty", `User added your course`, { courseId, addedBy: userId }).catch((error) => {
      console.error("Error awarding Nexon for royalty:", error)
      // Don't throw - Nexon failure shouldn't block royalty
    })
  } catch (error) {
    console.error("Error awarding course addition royalty:", error)
    // Don't throw - royalty failure shouldn't block course addition
  }
}

