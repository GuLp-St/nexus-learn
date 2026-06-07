import {
  createQuizAttempt,
  fetchQuizQuestionsByIds,
  type QuizQuestion,
} from "./quiz-utils"
import type { QuizPrepJob, QuizPrepKind } from "./quiz-prep-job"

export async function loadQuestionsFromPrepJob(
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  job: QuizPrepJob
): Promise<QuizQuestion[]> {
  if (!job.questionIds?.length) return []
  return fetchQuizQuestionsByIds(
    courseId,
    job.questionIds,
    kind === "module" ? moduleIndex : null,
    null
  )
}

export async function startAttemptFromPrepJob(
  userId: string,
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  job: QuizPrepJob
): Promise<{ questions: QuizQuestion[]; attemptId: string }> {
  const questions = await loadQuestionsFromPrepJob(courseId, kind, moduleIndex, job)
  if (questions.length === 0) {
    throw new Error("Failed to load generated questions")
  }

  const attemptId = await createQuizAttempt(
    userId,
    courseId,
    kind === "course" ? "course" : "module",
    questions.map((q) => q.questionId),
    kind === "module" ? moduleIndex : null,
    null,
    false
  )

  return { questions, attemptId }
}
