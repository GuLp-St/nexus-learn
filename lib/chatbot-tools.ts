import { db } from "./firebase"
import { collection, query, where, getDocs, doc, getDoc, limit, orderBy } from "firebase/firestore"
import { QuizAttempt, QuizQuestion } from "./quiz-utils"

/**
 * Validates that the requested userId matches the current user's ID.
 * This is a basic security check to prevent the chatbot from accessing other users' data.
 */
function validateUser(requestedUserId: string, currentUserId: string) {
  if (requestedUserId !== currentUserId) {
    throw new Error("Unauthorized: Cannot access data for other users.")
  }
}

/**
 * Get user's quiz attempts and results
 */
export async function getUserQuizHistory(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const attemptsQuery = query(
    collection(db, "quizAttempts"),
    where("userId", "==", userId),
    orderBy("completedAt", "desc"),
    limit(20)
  )
  
  const snapshot = await getDocs(attemptsQuery)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

/**
 * Get quiz progress for course(s)
 */
export async function getUserQuizProgress(userId: string, currentUserId: string, courseId?: string) {
  validateUser(userId, currentUserId)
  
  let progressQuery
  if (courseId) {
    progressQuery = query(
      collection(db, "userCourseProgress"),
      where("userId", "==", userId),
      where("courseId", "==", courseId)
    )
  } else {
    progressQuery = query(
      collection(db, "userCourseProgress"),
      where("userId", "==", userId)
    )
  }
  
  const snapshot = await getDocs(progressQuery)
  return snapshot.docs.map(doc => doc.data())
}

/**
 * Get all courses in journey with progress
 */
export async function getUserJourneyProgress(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const progressQuery = query(
    collection(db, "userCourseProgress"),
    where("userId", "==", userId)
  )
  
  const snapshot = await getDocs(progressQuery)
  const progressData = snapshot.docs.map(doc => doc.data())
  
  // Fetch course titles for better context
  const results = await Promise.all(progressData.map(async (p) => {
    const courseSnap = await getDoc(doc(db, "courses", p.courseId))
    return {
      ...p,
      courseTitle: courseSnap.data()?.title || "Unknown Course"
    }
  }))
  
  return results
}

/**
 * Get XP earning history
 */
export async function getUserXPHistory(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const xpQuery = query(
    collection(db, "xpHistory"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(20)
  )
  
  const snapshot = await getDocs(xpQuery)
  return snapshot.docs.map(doc => doc.data())
}

/**
 * Get Nexon transaction history
 */
export async function getUserNexonHistory(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const nexonQuery = query(
    collection(db, "nexonHistory"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(20)
  )
  
  const snapshot = await getDocs(nexonQuery)
  return snapshot.docs.map(doc => doc.data())
}

/**
 * Get cosmetic purchases
 */
export async function getUserPurchaseHistory(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const purchaseQuery = query(
    collection(db, "purchases"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(50)
  )
  
  const snapshot = await getDocs(purchaseQuery)
  return snapshot.docs.map(doc => doc.data())
}

/**
 * Search all public courses
 */
export async function searchCommunityCourses(queryText: string) {
  const coursesQuery = query(
    collection(db, "courses"),
    where("isPublic", "==", true),
    limit(50)
  )
  
  const snapshot = await getDocs(coursesQuery)
  const courses = snapshot.docs.map(doc => ({
    id: doc.id,
    title: doc.data().title,
    description: doc.data().description,
    tags: doc.data().tags,
    difficulty: doc.data().difficulty
  }))
  
  if (!queryText) return courses
  
  const searchLower = queryText.toLowerCase()
  return courses.filter(c => 
    c.title.toLowerCase().includes(searchLower) || 
    c.description.toLowerCase().includes(searchLower) ||
    c.tags?.some((t: string) => t.toLowerCase().includes(searchLower))
  )
}

/**
 * Get current daily quests
 */
export async function getDailyQuests(userId: string, currentUserId: string) {
  validateUser(userId, currentUserId)
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const questsQuery = query(
    collection(db, "userQuests"),
    where("userId", "==", userId),
    where("assignedAt", ">=", today)
  )
  
  const snapshot = await getDocs(questsQuery)
  return snapshot.docs.map(doc => doc.data())
}

/**
 * Get correct answer for hint (only during quiz)
 * This should be used carefully by the AI to provide hints, not direct answers
 */
export async function getQuizCorrectAnswer(questionId: string) {
  // We don't need userId validation here as questionId is specific, 
  // but we should ensure it's only called in a quiz context.
  const questionSnap = await getDoc(doc(db, "quizQuestions", questionId))
  if (!questionSnap.exists()) return null
  
  const data = questionSnap.data() as QuizQuestion
  return {
    question: data.question,
    correctAnswer: data.correctAnswer,
    suggestedAnswer: data.suggestedAnswer,
    type: data.type
  }
}

