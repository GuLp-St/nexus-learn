import { db } from "./firebase"
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp, Timestamp, limit, orderBy } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"

export interface QuizQuestion {
  questionId: string
  courseId: string
  moduleIndex?: number | null
  lessonIndex?: number | null
  quizType: "lesson" | "module" | "course"
  type: "objective" | "subjective"
  objectiveType?: "multiple-choice" | "true-false" | "matching"
  question: string
  options?: string[]
  correctAnswer?: string | number | boolean
  suggestedAnswer?: string
  createdAt?: Timestamp
}

export interface QuizAttempt {
  id?: string
  userId: string
  courseId: string
  quizType: "lesson" | "module" | "course"
  moduleIndex?: number | null
  lessonIndex?: number | null
  questionIds: string[]
  answers: { [questionId: string]: string | number | boolean }
  scores: { [questionId: string]: { correct: boolean; feedback?: string; marks?: number } }
  totalScore: number
  maxScore: number
  completedAt?: Timestamp | null
  isRetake: boolean
  createdAt?: Timestamp
  currentQuestionIndex?: number // For resume functionality
}

export interface QuizQuestionSet {
  questions: QuizQuestion[]
  attemptId?: string
}

/**
 * Get overall quiz statistics for a user
 */
export async function getUserQuizStats(userId: string): Promise<{
  averageAccuracy: number;
  totalQuestionsAnswered: number;
  perfectStreaks: number;
}> {
  try {
    const attemptsQuery = query(
      collection(db, "quizAttempts"),
      where("userId", "==", userId)
    )
    
    const snapshot = await getDocs(attemptsQuery)
    let totalPointsEarned = 0
    let totalPointsPossible = 0
    let perfectStreaks = 0
    let totalQuestionsAnswered = 0
    
    snapshot.forEach((doc) => {
      const attempt = doc.data() as QuizAttempt
      // Only count completed and not abandoned quizzes
      if (attempt.completedAt && !(attempt as any).abandoned) {
        totalPointsEarned += attempt.totalScore
        totalPointsPossible += attempt.maxScore
        totalQuestionsAnswered += Object.keys(attempt.answers || {}).length
        
        if (attempt.totalScore === attempt.maxScore && attempt.maxScore > 0) {
          perfectStreaks++
        }
      }
    })
    
    const averageAccuracy = totalPointsPossible > 0 
      ? Math.round((totalPointsEarned / totalPointsPossible) * 100) 
      : 0
      
    return {
      averageAccuracy,
      totalQuestionsAnswered,
      perfectStreaks,
    }
  } catch (error) {
    console.error("Error fetching quiz stats:", error)
    return {
      averageAccuracy: 0,
      totalQuestionsAnswered: 0,
      perfectStreaks: 0,
    }
  }
}

/**
 * Get document ID for a quiz question based on quiz type
 */
function getQuestionDocId(courseId: string, moduleIndex: number | null, lessonIndex: number | null, questionId: string): string {
  if (lessonIndex !== null && moduleIndex !== null) {
    return `${courseId}-${moduleIndex}-${lessonIndex}-${questionId}`
  } else if (moduleIndex !== null) {
    return `${courseId}-${moduleIndex}-${questionId}`
  } else {
    return `${courseId}-${questionId}`
  }
}

/**
 * Fetch quiz questions from database for a specific quiz type
 */
export async function fetchQuizQuestions(
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<QuizQuestion[]> {
  try {
    let questionsQuery
    
    if (quizType === "lesson" && moduleIndex !== null && moduleIndex !== undefined && lessonIndex !== null && lessonIndex !== undefined) {
      // Fetch lesson-specific questions
      questionsQuery = query(
        collection(db, "quizQuestions"),
        where("courseId", "==", courseId),
        where("moduleIndex", "==", moduleIndex),
        where("lessonIndex", "==", lessonIndex),
        where("quizType", "==", "lesson")
      )
    } else if (quizType === "module" && moduleIndex !== null && moduleIndex !== undefined) {
      // Fetch module-specific questions (from all lessons in module)
      questionsQuery = query(
        collection(db, "quizQuestions"),
        where("courseId", "==", courseId),
        where("moduleIndex", "==", moduleIndex),
        where("quizType", "in", ["lesson", "module"])
      )
    } else {
      // Fetch course-level questions (from all modules/lessons)
      questionsQuery = query(
        collection(db, "quizQuestions"),
        where("courseId", "==", courseId)
      )
    }
    
    const snapshot = await getDocs(questionsQuery)
    const questions: QuizQuestion[] = []
    
    snapshot.forEach((doc) => {
      questions.push(doc.data() as QuizQuestion)
    })
    
    return questions
  } catch (error) {
    console.error("Error fetching quiz questions:", error)
    return []
  }
}

/**
 * Save quiz questions to database
 */
export async function saveQuizQuestions(questions: QuizQuestion[]): Promise<void> {
  try {
    const promises = questions.map((question) => {
      const docId = getQuestionDocId(
        question.courseId,
        question.moduleIndex ?? null,
        question.lessonIndex ?? null,
        question.questionId
      )
      const docRef = doc(db, "quizQuestions", docId)
      return setDoc(docRef, {
        ...question,
        createdAt: serverTimestamp(),
      }, { merge: true })
    })
    
    await Promise.all(promises)
  } catch (error) {
    console.error("Error saving quiz questions:", error)
    throw new Error("Failed to save quiz questions")
  }
}

/**
 * Fetch quiz questions by question IDs
 */
export async function fetchQuizQuestionsByIds(
  courseId: string,
  questionIds: string[]
): Promise<QuizQuestion[]> {
  try {
    // Fetch all questions for the course and filter by questionId
    const questionsQuery = query(
      collection(db, "quizQuestions"),
      where("courseId", "==", courseId)
    )
    
    const snapshot = await getDocs(questionsQuery)
    const questions: QuizQuestion[] = []
    
    snapshot.forEach((docSnap) => {
      const questionData = docSnap.data() as QuizQuestion
      if (questionIds.includes(questionData.questionId)) {
        questions.push(questionData)
      }
    })
    
    // Sort questions to match the order of questionIds
    return questionIds
      .map((id) => questions.find((q) => q.questionId === id))
      .filter((q): q is QuizQuestion => q !== undefined)
  } catch (error) {
    console.error("Error fetching quiz questions by IDs:", error)
    return []
  }
}

/**
 * Get available question count for a quiz type
 */
export async function getAvailableQuestionCount(
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<number> {
  const questions = await fetchQuizQuestions(courseId, quizType, moduleIndex, lessonIndex)
  return questions.length
}

/**
 * Select random questions from available pool
 */
export function selectRandomQuestions(questions: QuizQuestion[], count: number): QuizQuestion[] {
  const shuffled = [...questions].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

/**
 * Create a new quiz attempt record
 */
export async function createQuizAttempt(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  questionIds: string[],
  moduleIndex?: number | null,
  lessonIndex?: number | null,
  isRetake: boolean = false
): Promise<string> {
  try {
    const attemptId = `${userId}-${courseId}-${quizType}-${moduleIndex ?? "null"}-${lessonIndex ?? "null"}-${Date.now()}`
    const attemptRef = doc(db, "quizAttempts", attemptId)
    
    await setDoc(attemptRef, {
      userId,
      courseId,
      quizType,
      moduleIndex: moduleIndex !== undefined && moduleIndex !== null ? moduleIndex : null,
      lessonIndex: lessonIndex !== undefined && lessonIndex !== null ? lessonIndex : null,
      questionIds,
      answers: {},
      scores: {},
      totalScore: 0,
      maxScore: questionIds.length,
      isRetake,
      createdAt: serverTimestamp(),
      completedAt: null,
    })
    
    return attemptId
  } catch (error) {
    console.error("Error creating quiz attempt:", error)
    throw new Error("Failed to create quiz attempt")
  }
}

/**
 * Save quiz attempt answers (for auto-save/resume functionality)
 */
export async function saveQuizAttemptAnswers(
  attemptId: string,
  answers: { [questionId: string]: string | number | boolean },
  currentQuestionIndex?: number
): Promise<void> {
  try {
    const attemptRef = doc(db, "quizAttempts", attemptId)
    const updateData: { [key: string]: any } = {
      answers,
    }
    if (currentQuestionIndex !== undefined) {
      updateData.currentQuestionIndex = currentQuestionIndex
    }
    await updateDoc(attemptRef, updateData)
  } catch (error) {
    console.error("Error saving quiz attempt answers:", error)
    // Don't throw - auto-save failures shouldn't break the quiz
  }
}

/**
 * Save basic quiz attempt data (without XP awards)
 */
export async function saveQuizAttemptBasic(
  attemptId: string,
  answers: { [questionId: string]: string | number | boolean },
  scores: { [questionId: string]: { correct: boolean; feedback?: string; marks?: number } }
): Promise<void> {
  try {
    const attemptRef = doc(db, "quizAttempts", attemptId)
    // Calculate total score: sum marks if available, otherwise count correct answers
    const totalScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + s.marks
      }
      return sum + (s.correct ? 1 : 0)
    }, 0)
    // Max score: count questions, but subjective questions count as 4 marks max
    const maxScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + 4 // Subjective questions max 4 marks
      }
      return sum + 1 // Objective questions 1 mark each
    }, 0)

    await updateDoc(attemptRef, {
      answers,
      scores,
      totalScore,
      maxScore,
      completedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error saving quiz attempt basic:", error)
    throw new Error("Failed to save quiz attempt")
  }
}

/**
 * Save completed quiz attempt with scores and award XP
 */
export async function saveQuizAttempt(
  attemptId: string,
  answers: { [questionId: string]: string | number | boolean },
  scores: { [questionId: string]: { correct: boolean; feedback?: string; marks?: number } },
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null,
  questionIds?: string[],
  isRetake?: boolean
): Promise<XPAwardResult | null> {
  try {
    // First save the basic quiz attempt
    await saveQuizAttemptBasic(attemptId, answers, scores)

    // Calculate total score: sum marks if available, otherwise count correct answers
    const totalScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + s.marks
      }
      return sum + (s.correct ? 1 : 0)
    }, 0)
    // Max score: count questions, but subjective questions count as 4 marks max
    const maxScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + 4 // Subjective questions max 4 marks
      }
      return sum + 1 // Objective questions 1 mark each
    }, 0)
    let totalXPAwarded = 0

    // Award XP for correct answers (only for new questions)
    if (questionIds && Object.keys(scores).length > 0) {
      const { awardQuizQuestionXP, awardPerfectQuizBonus } = await import("./xp-utils")
      
      // Track which questions were actually awarded XP
      const xpAwardPromises = questionIds
        .filter((questionId) => {
          const score = scores[questionId]
          return score && score.correct === true
        })
        .map(async (questionId) => {
          const awarded = await awardQuizQuestionXP(userId, courseId, questionId, quizType, moduleIndex, lessonIndex).catch(
            (error) => {
              console.error(`Error awarding XP for question ${questionId}:`, error)
              return false
            }
          )
          if (awarded) totalXPAwarded += 10
          return awarded
        })

      await Promise.all(xpAwardPromises)

      // Award perfect quiz bonus if: first attempt (not retake) and perfect score
      if (isRetake === false && totalScore === maxScore && maxScore > 0) {
        await awardPerfectQuizBonus(userId, courseId, quizType, moduleIndex, lessonIndex).catch(
          (error) => {
            console.error("Error awarding perfect quiz bonus XP:", error)
          }
        )
        totalXPAwarded += 20

        // Check badges after perfect quiz (quiz-master and perfectionist)
        const { checkAndUpdateBadges } = await import("./badge-utils")
        await checkAndUpdateBadges(userId).catch((error) => {
          console.error("Error checking badges:", error)
        })
      }
    }

    // Emit quest event for quiz completion
    const { trackQuestProgress } = await import("./event-bus")
    trackQuestProgress({
      type: "quest.quiz_completed",
      userId,
      metadata: {
        courseId,
        quizType,
        ...(moduleIndex !== null && moduleIndex !== undefined ? { moduleIndex } : {}),
        ...(lessonIndex !== null && lessonIndex !== undefined ? { lessonIndex } : {}),
      },
    }).catch((error) => {
      console.error("Error emitting quiz completed event:", error)
    })

    // If any XP was awarded, return a consolidated result for the UI
    if (totalXPAwarded > 0) {
      // Note: XP was already added via individual calls, we just need the final state for the UI
      // We'll call a dummy awardXP(0) to get the latest levels and XP totals
      return await awardXP(userId, 0, quizType === "course" ? "Course Quiz" : quizType === "module" ? "Module Quiz" : "Lesson Quiz").then(res => ({
        ...res,
        amount: totalXPAwarded // Overwrite with the total we calculated
      }))
    }

    return null
  } catch (error) {
    console.error("Error saving quiz attempt:", error)
    throw new Error("Failed to save quiz attempt")
  }
}

/**
 * Get quiz attempt history for a user
 */
export async function getQuizAttemptHistory(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<QuizAttempt[]> {
  try {
    let attemptsQuery
    
    if (quizType === "lesson" && moduleIndex !== null && moduleIndex !== undefined && lessonIndex !== null && lessonIndex !== undefined) {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "lesson"),
        where("moduleIndex", "==", moduleIndex),
        where("lessonIndex", "==", lessonIndex),
        orderBy("completedAt", "desc"),
        limit(10)
      )
    } else if (quizType === "module" && moduleIndex !== null && moduleIndex !== undefined) {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "module"),
        where("moduleIndex", "==", moduleIndex),
        orderBy("completedAt", "desc"),
        limit(10)
      )
    } else {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "course"),
        orderBy("completedAt", "desc"),
        limit(10)
      )
    }
    
    const snapshot = await getDocs(attemptsQuery)
    const attempts: QuizAttempt[] = []
    
    snapshot.forEach((doc) => {
      attempts.push({
        ...doc.data(),
        completedAt: doc.data().completedAt,
      } as QuizAttempt)
    })
    
    return attempts
  } catch (error: any) {
    // If index is building, fetch without orderBy and sort client-side
    if (error.code === "failed-precondition") {
      try {
        let fallbackQuery
        if (quizType === "lesson" && moduleIndex !== null && moduleIndex !== undefined && lessonIndex !== null && lessonIndex !== undefined) {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "lesson"),
            where("moduleIndex", "==", moduleIndex),
            where("lessonIndex", "==", lessonIndex),
            limit(50)
          )
        } else if (quizType === "module" && moduleIndex !== null && moduleIndex !== undefined) {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "module"),
            where("moduleIndex", "==", moduleIndex),
            limit(50)
          )
        } else {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "course"),
            limit(50)
          )
        }
        
        const snapshot = await getDocs(fallbackQuery)
        const attempts: QuizAttempt[] = []
        
        snapshot.forEach((doc) => {
          attempts.push({
            ...doc.data(),
            completedAt: doc.data().completedAt,
          } as QuizAttempt)
        })
        
        // Sort client-side
        attempts.sort((a, b) => {
          const aTime = a.completedAt?.toMillis() || 0
          const bTime = b.completedAt?.toMillis() || 0
          return bTime - aTime
        })
        
        return attempts.slice(0, 10)
      } catch (fallbackError) {
        console.error("Error fetching quiz attempts (fallback):", fallbackError)
        return []
      }
    }
    
    console.error("Error fetching quiz attempts:", error)
    return []
  }
}

/**
 * Get the most recent quiz attempt for retake functionality
 */
export async function getMostRecentQuizAttempt(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<QuizAttempt | null> {
  const attempts = await getQuizAttemptHistory(userId, courseId, quizType, moduleIndex, lessonIndex)
  return attempts.length > 0 ? attempts[0] : null
}

/**
 * Get any incomplete quiz attempt for a user (across all courses and types)
 */
export async function getAnyIncompleteQuizAttempt(userId: string): Promise<(QuizAttempt & { courseTitle?: string }) | null> {
  try {
    const attemptsQuery = query(
      collection(db, "quizAttempts"),
      where("userId", "==", userId),
      where("completedAt", "==", null),
      orderBy("createdAt", "desc"),
      limit(5) // Check a few in case of data inconsistencies
    )
    
    const snapshot = await getDocs(attemptsQuery)
    if (!snapshot.empty) {
      // Find the first one that truly doesn't have a completedAt value
      for (const docSnap of snapshot.docs) {
        const attempt = docSnap.data() as QuizAttempt
        if (!attempt.completedAt) {
          // Fetch course title for better UX
          const courseRef = doc(db, "courses", attempt.courseId)
          const courseSnap = await getDoc(courseRef)
          const courseData = courseSnap.data()
          
          return {
            id: docSnap.id,
            ...attempt,
            courseTitle: courseData?.title || "Unknown Course",
            currentQuestionIndex: attempt.currentQuestionIndex || 0,
          } as QuizAttempt & { courseTitle?: string }
        }
      }
    }
    
    return null
  } catch (error: any) {
    // Fallback for index building or other errors
    try {
      const fallbackQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        limit(20)
      )
      const snapshot = await getDocs(fallbackQuery)
      const attempts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as QuizAttempt))
        .filter(a => a.completedAt === null || a.completedAt === undefined)
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0
          return bTime - aTime
        })
        
      if (attempts.length > 0) {
        const attempt = attempts[0]
        const courseRef = doc(db, "courses", attempt.courseId)
        const courseSnap = await getDoc(courseRef)
        return {
          ...attempt,
          courseTitle: courseSnap.data()?.title || "Unknown Course"
        } as QuizAttempt & { courseTitle?: string }
      }
      return null
    } catch (fallbackError) {
      console.error("Error in fallback global incomplete check:", fallbackError)
      return null
    }
  }
}

/**
 * Abandon an incomplete quiz attempt (mark it as "cancelled" by setting a special flag or just completing it)
 */
export async function abandonQuizAttempt(attemptId: string): Promise<void> {
  try {
    const attemptRef = doc(db, "quizAttempts", attemptId)
    await updateDoc(attemptRef, {
      completedAt: serverTimestamp(),
      abandoned: true,
      totalScore: 0,
    })
  } catch (error) {
    console.error("Error abandoning quiz:", error)
    throw error
  }
}

/**
 * Get incomplete quiz attempt (for resume functionality)
 */
export async function getIncompleteQuizAttempt(
  userId: string,
  courseId: string,
  quizType: "lesson" | "module" | "course",
  moduleIndex?: number | null,
  lessonIndex?: number | null
): Promise<QuizAttempt | null> {
  try {
    let attemptsQuery
    
    if (quizType === "lesson" && moduleIndex !== null && moduleIndex !== undefined && lessonIndex !== null && lessonIndex !== undefined) {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "lesson"),
        where("moduleIndex", "==", moduleIndex),
        where("lessonIndex", "==", lessonIndex),
        orderBy("createdAt", "desc"),
        limit(10)
      )
    } else if (quizType === "module" && moduleIndex !== null && moduleIndex !== undefined) {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "module"),
        where("moduleIndex", "==", moduleIndex),
        orderBy("createdAt", "desc"),
        limit(10)
      )
    } else {
      attemptsQuery = query(
        collection(db, "quizAttempts"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("quizType", "==", "course"),
        orderBy("createdAt", "desc"),
        limit(10)
      )
    }
    
    const snapshot = await getDocs(attemptsQuery)
    
        // Find the most recent incomplete attempt
        for (const doc of snapshot.docs) {
          const attempt = doc.data() as QuizAttempt
          if (!attempt.completedAt) {
            return {
              id: doc.id,
              ...attempt,
              completedAt: undefined,
              currentQuestionIndex: attempt.currentQuestionIndex || 0,
            } as QuizAttempt
          }
        }
    
    return null
  } catch (error: any) {
    // If index is building, fetch without orderBy and filter client-side
    if (error.code === "failed-precondition") {
      try {
        let fallbackQuery
        if (quizType === "lesson" && moduleIndex !== null && moduleIndex !== undefined && lessonIndex !== null && lessonIndex !== undefined) {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "lesson"),
            where("moduleIndex", "==", moduleIndex),
            where("lessonIndex", "==", lessonIndex),
            limit(50)
          )
        } else if (quizType === "module" && moduleIndex !== null && moduleIndex !== undefined) {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "module"),
            where("moduleIndex", "==", moduleIndex),
            limit(50)
          )
        } else {
          fallbackQuery = query(
            collection(db, "quizAttempts"),
            where("userId", "==", userId),
            where("courseId", "==", courseId),
            where("quizType", "==", "course"),
            limit(50)
          )
        }
        
        const snapshot = await getDocs(fallbackQuery)
        
        // Sort by createdAt and find incomplete attempt
        const attempts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as QuizAttempt))
        
        attempts.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0
          return bTime - aTime
        })
        
        for (const attempt of attempts) {
          if (!attempt.completedAt) {
            return {
              ...attempt,
              completedAt: undefined,
              currentQuestionIndex: attempt.currentQuestionIndex || 0,
            } as QuizAttempt
          }
        }
        
        return null
      } catch (fallbackError) {
        console.error("Error fetching incomplete quiz attempt (fallback):", fallbackError)
        return null
      }
    }
    
    console.error("Error fetching incomplete quiz attempt:", error)
    return null
  }
}

/**
 * Get course-specific average accuracy (percentage)
 */
export async function getCourseAverageAccuracy(
  userId: string,
  courseId: string
): Promise<number> {
  try {
    const attempts = await getQuizAttempts(userId, courseId)
    
    if (attempts.length === 0) {
      return 0
    }
    
    let totalScore = 0
    let maxScore = 0
    
    attempts.forEach((attempt) => {
      if (attempt.completedAt && attempt.maxScore > 0) {
        totalScore += attempt.totalScore
        maxScore += attempt.maxScore
      }
    })
    
    if (maxScore === 0) {
      return 0
    }
    
    return Math.round((totalScore / maxScore) * 100)
  } catch (error) {
    console.error("Error calculating course average accuracy:", error)
    return 0
  }
}

/**
 * Get all quiz attempts for a course (all quiz types)
 */
export async function getQuizAttempts(
  userId: string,
  courseId: string
): Promise<QuizAttempt[]> {
  try {
    const attemptsQuery = query(
      collection(db, "quizAttempts"),
      where("userId", "==", userId),
      where("courseId", "==", courseId),
      orderBy("createdAt", "desc"),
      limit(100)
    )
    
    const snapshot = await getDocs(attemptsQuery)
    const attempts: QuizAttempt[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      attempts.push({
        id: doc.id,
        ...data,
        completedAt: data.completedAt,
      } as QuizAttempt)
    })
    
    // Filter to only completed attempts
    return attempts.filter(attempt => attempt.completedAt)
  } catch (error: any) {
    // Fallback if index doesn't exist
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "quizAttempts"),
          where("userId", "==", userId),
          where("courseId", "==", courseId),
          limit(100)
        )
        
        const snapshot = await getDocs(fallbackQuery)
        const attempts: QuizAttempt[] = []
        
        snapshot.forEach((doc) => {
          const data = doc.data()
          attempts.push({
            id: doc.id,
            ...data,
            completedAt: data.completedAt,
          } as QuizAttempt)
        })
        
        // Filter to only completed attempts and sort by date
        const completed = attempts.filter(attempt => attempt.completedAt)
        completed.sort((a, b) => {
          const aTime = a.completedAt?.toMillis() || 0
          const bTime = b.completedAt?.toMillis() || 0
          return bTime - aTime
        })
        
        return completed
      } catch (fallbackError) {
        console.error("Error fetching quiz attempts (fallback):", fallbackError)
        return []
      }
    }
    
    console.error("Error fetching quiz attempts:", error)
    return []
  }
}
