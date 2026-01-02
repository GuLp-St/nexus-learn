import { db } from "./firebase"
import { doc, setDoc, getDoc, getDocs, query, where, collection, serverTimestamp, Timestamp } from "firebase/firestore"

export interface CompletedItem {
  id: string
  userId: string
  courseId: string
  moduleIndex?: number | null
  lessonIndex?: number | null
  completedAt: Timestamp
  itemType: "course" | "module" | "lesson"
}

/**
 * Get document ID for a completed item
 */
function getCompletedItemDocId(
  userId: string,
  courseId: string,
  moduleIndex?: number | null,
  lessonIndex?: number | null
): string {
  if (lessonIndex !== null && lessonIndex !== undefined && moduleIndex !== null && moduleIndex !== undefined) {
    return `${userId}-${courseId}-${moduleIndex}-${lessonIndex}`
  } else if (moduleIndex !== null && moduleIndex !== undefined) {
    return `${userId}-${courseId}-${moduleIndex}`
  } else {
    return `${userId}-${courseId}`
  }
}

/**
 * Record course completion
 */
export async function recordCourseCompletion(userId: string, courseId: string): Promise<void> {
  try {
    const docId = getCompletedItemDocId(userId, courseId)
    const completionRef = doc(db, "userCompletedItems", docId)
    
    // Check if already completed
    const existingDoc = await getDoc(completionRef)
    if (existingDoc.exists()) {
      return // Already recorded
    }
    
    await setDoc(completionRef, {
      userId,
      courseId,
      moduleIndex: null,
      lessonIndex: null,
      completedAt: serverTimestamp(),
      itemType: "course",
    })
  } catch (error) {
    console.error("Error recording course completion:", error)
  }
}

/**
 * Record module completion
 */
export async function recordModuleCompletion(
  userId: string,
  courseId: string,
  moduleIndex: number
): Promise<void> {
  try {
    const docId = getCompletedItemDocId(userId, courseId, moduleIndex)
    const completionRef = doc(db, "userCompletedItems", docId)
    
    // Check if already completed
    const existingDoc = await getDoc(completionRef)
    if (existingDoc.exists()) {
      return // Already recorded
    }
    
    await setDoc(completionRef, {
      userId,
      courseId,
      moduleIndex,
      lessonIndex: null,
      completedAt: serverTimestamp(),
      itemType: "module",
    })
  } catch (error) {
    console.error("Error recording module completion:", error)
  }
}

/**
 * Record lesson completion
 */
export async function recordLessonCompletion(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<void> {
  try {
    const docId = getCompletedItemDocId(userId, courseId, moduleIndex, lessonIndex)
    const completionRef = doc(db, "userCompletedItems", docId)
    
    // Check if already completed
    const existingDoc = await getDoc(completionRef)
    if (existingDoc.exists()) {
      return // Already recorded
    }
    
    await setDoc(completionRef, {
      userId,
      courseId,
      moduleIndex,
      lessonIndex,
      completedAt: serverTimestamp(),
      itemType: "lesson",
    })
  } catch (error) {
    console.error("Error recording lesson completion:", error)
  }
}

/**
 * Check if course is completed
 */
export async function isCourseCompleted(userId: string, courseId: string): Promise<boolean> {
  try {
    const docId = getCompletedItemDocId(userId, courseId)
    const completionRef = doc(db, "userCompletedItems", docId)
    const docSnap = await getDoc(completionRef)
    return docSnap.exists()
  } catch (error) {
    console.error("Error checking course completion:", error)
    return false
  }
}

/**
 * Check if module is completed
 */
export async function isModuleCompleted(
  userId: string,
  courseId: string,
  moduleIndex: number
): Promise<boolean> {
  try {
    const docId = getCompletedItemDocId(userId, courseId, moduleIndex)
    const completionRef = doc(db, "userCompletedItems", docId)
    const docSnap = await getDoc(completionRef)
    return docSnap.exists()
  } catch (error) {
    console.error("Error checking module completion:", error)
    return false
  }
}

/**
 * Check if lesson is completed
 */
export async function isLessonCompleted(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<boolean> {
  try {
    const docId = getCompletedItemDocId(userId, courseId, moduleIndex, lessonIndex)
    const completionRef = doc(db, "userCompletedItems", docId)
    const docSnap = await getDoc(completionRef)
    return docSnap.exists()
  } catch (error) {
    console.error("Error checking lesson completion:", error)
    return false
  }
}

/**
 * Get all completed courses for a user
 */
export async function getCompletedCourses(userId: string): Promise<CompletedItem[]> {
  try {
    const completedQuery = query(
      collection(db, "userCompletedItems"),
      where("userId", "==", userId),
      where("itemType", "==", "course")
    )
    
    const snapshot = await getDocs(completedQuery)
    const completedItems: CompletedItem[] = []
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      completedItems.push({
        id: docSnap.id,
        userId: data.userId,
        courseId: data.courseId,
        moduleIndex: data.moduleIndex,
        lessonIndex: data.lessonIndex,
        completedAt: data.completedAt,
        itemType: data.itemType,
      } as CompletedItem)
    })
    
    return completedItems
  } catch (error) {
    console.error("Error fetching completed courses:", error)
    return []
  }
}

