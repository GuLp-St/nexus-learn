import { doc, getDoc } from "firebase/firestore"
import { db } from "./firebase"
import type { QuizPrepKind } from "./quiz-prep-job"
import {
  generateCourseQuizQuestions,
  generateModuleQuizQuestions,
} from "./quiz-generator"
import { selectRandomQuestions, type QuizQuestion } from "./quiz-utils"
import { saveQuizQuestionsAdmin } from "./quiz-prep-server"

const MODULE_QUIZ_COUNT = 10
const FINAL_QUIZ_COUNT = 20

export async function runQuizPrepPipeline(
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null
): Promise<string[]> {
  const courseRef = doc(db, "courses", courseId)
  const courseSnap = await getDoc(courseRef)
  if (!courseSnap.exists()) {
    throw new Error("Course not found")
  }
  const courseData = { id: courseSnap.id, ...courseSnap.data() }

  let generatedQuestions: QuizQuestion[] = []
  if (kind === "module" && moduleIndex !== null) {
    generatedQuestions = await generateModuleQuizQuestions(
      courseData as any,
      moduleIndex,
      courseId,
      MODULE_QUIZ_COUNT
    )
    const objectiveQuestions = generatedQuestions.filter((q) => q.type === "objective")
    const subjectiveQuestions = generatedQuestions.filter((q) => q.type === "subjective")
    const selectedObjective = selectRandomQuestions(objectiveQuestions, 9)
    const selectedSubjective = selectRandomQuestions(subjectiveQuestions, 1)
    generatedQuestions = [...selectedObjective, ...selectedSubjective].sort(
      () => Math.random() - 0.5
    )
  } else {
    generatedQuestions = await generateCourseQuizQuestions(
      courseData as any,
      courseId,
      FINAL_QUIZ_COUNT
    )
    const objectiveQuestions = generatedQuestions.filter((q) => q.type === "objective")
    const subjectiveQuestions = generatedQuestions.filter((q) => q.type === "subjective")
    const selectedObjective = selectRandomQuestions(objectiveQuestions, 18)
    const selectedSubjective = selectRandomQuestions(subjectiveQuestions, 2)
    generatedQuestions = [...selectedObjective, ...selectedSubjective].sort(
      () => Math.random() - 0.5
    )
  }

  if (generatedQuestions.length === 0) {
    throw new Error("No questions available")
  }

  await saveQuizQuestionsAdmin(generatedQuestions)
  return generatedQuestions.map((q) => q.questionId)
}
