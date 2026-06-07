import { db } from "./firebase"

import { collection, query, where, getDocs, doc, getDoc, limit, orderBy } from "firebase/firestore"

import { QuizAttempt, QuizQuestion } from "./quiz-utils"



/**

 * Validates that the requested userId matches the current user's ID.

 */

function validateUser(requestedUserId: string, currentUserId: string) {

  if (requestedUserId !== currentUserId) {

    throw new Error("Unauthorized: Cannot access data for other users.")

  }

}



export async function getUserQuizHistory(userId: string, currentUserId: string) {

  validateUser(userId, currentUserId)



  const attemptsQuery = query(

    collection(db, "quizAttempts"),

    where("userId", "==", userId),

    orderBy("completedAt", "desc"),

    limit(20)

  )



  const snapshot = await getDocs(attemptsQuery)

  return snapshot.docs.map((docSnap) => ({

    id: docSnap.id,

    ...docSnap.data(),

  }))

}



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

    progressQuery = query(collection(db, "userCourseProgress"), where("userId", "==", userId))

  }



  const snapshot = await getDocs(progressQuery)

  return snapshot.docs.map((docSnap) => docSnap.data())

}



export async function getUserJourneyProgress(userId: string, currentUserId: string) {

  validateUser(userId, currentUserId)



  const progressQuery = query(

    collection(db, "userCourseProgress"),

    where("userId", "==", userId)

  )



  const snapshot = await getDocs(progressQuery)

  const progressData = snapshot.docs.map((docSnap) => docSnap.data())



  const results = await Promise.all(

    progressData.map(async (p) => {

      const courseSnap = await getDoc(doc(db, "courses", p.courseId))

      return {

        ...p,

        courseTitle: courseSnap.data()?.title || "Unknown Course",

      }

    })

  )



  return results

}



export async function getUserXPHistory(userId: string, currentUserId: string) {

  validateUser(userId, currentUserId)



  const xpQuery = query(

    collection(db, "xpHistory"),

    where("userId", "==", userId),

    orderBy("timestamp", "desc"),

    limit(20)

  )



  const snapshot = await getDocs(xpQuery)

  return snapshot.docs.map((docSnap) => docSnap.data())

}



export async function getUserNexonHistory(userId: string, currentUserId: string) {

  validateUser(userId, currentUserId)



  const nexonQuery = query(

    collection(db, "nexonHistory"),

    where("userId", "==", userId),

    orderBy("timestamp", "desc"),

    limit(20)

  )



  const snapshot = await getDocs(nexonQuery)

  return snapshot.docs.map((docSnap) => docSnap.data())

}



export async function getUserPurchaseHistory(userId: string, currentUserId: string) {

  validateUser(userId, currentUserId)



  const purchaseQuery = query(

    collection(db, "purchases"),

    where("userId", "==", userId),

    orderBy("timestamp", "desc"),

    limit(50)

  )



  const snapshot = await getDocs(purchaseQuery)

  return snapshot.docs.map((docSnap) => docSnap.data())

}



export interface CommunityCourseSummary {

  id: string

  title: string

  description: string

  tags: string[]

  difficulty: string

  estimatedDuration?: string

  averageRating?: number

  ratingCount?: number

}



/**

 * List and search all public courses in the community library.

 */

export async function searchCommunityCourses(queryText?: string): Promise<CommunityCourseSummary[]> {

  let snapshot

  try {

    const coursesQuery = query(

      collection(db, "courses"),

      where("isPublic", "==", true),

      orderBy("publishedAt", "desc"),

      limit(100)

    )

    snapshot = await getDocs(coursesQuery)

  } catch {

    const coursesQuery = query(

      collection(db, "courses"),

      where("isPublic", "==", true),

      limit(100)

    )

    snapshot = await getDocs(coursesQuery)

  }



  const courses: CommunityCourseSummary[] = snapshot.docs.map((docSnap) => {

    const data = docSnap.data()

    return {

      id: docSnap.id,

      title: data.title || "Untitled",

      description: data.description || "",

      tags: data.tags || [],

      difficulty: data.difficulty || "beginner",

      estimatedDuration: data.estimatedDuration,

      averageRating: data.averageRating,

      ratingCount: data.ratingCount,

    }

  })



  const q = (queryText || "").trim().toLowerCase()

  if (!q) return courses



  return courses.filter(

    (c) =>

      c.title.toLowerCase().includes(q) ||

      c.description.toLowerCase().includes(q) ||

      c.tags.some((t) => t.toLowerCase().includes(q)) ||

      c.difficulty.toLowerCase().includes(q)

  )

}



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

  return snapshot.docs.map((docSnap) => docSnap.data())

}



export async function getQuestionHintContext(questionId: string) {

  const { buildQuestionHintContext } = await import("./quiz-hint-utils")



  const directSnap = await getDoc(doc(db, "quizQuestions", questionId))

  if (directSnap.exists()) {

    return buildQuestionHintContext(directSnap.data() as QuizQuestion)

  }



  const legacyQuery = query(

    collection(db, "quizQuestions"),

    where("questionId", "==", questionId),

    limit(1)

  )

  const legacySnap = await getDocs(legacyQuery)

  if (legacySnap.empty) {

    return { error: "Question not found", questionId }

  }



  return buildQuestionHintContext(legacySnap.docs[0].data() as QuizQuestion)

}


