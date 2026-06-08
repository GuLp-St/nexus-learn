import { auth } from "./firebase"
import {
  createQuizAttempt,
  fetchQuizQuestionsByIds,
  type QuizQuestion,
} from "./quiz-utils"
import type { QuizPrepJob, QuizPrepKind } from "./quiz-prep-job"

const PREP_LOAD_RETRY_DELAYS_MS = [0, 400, 800]

async function loadQuestionsFromPrepJobApi(
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  job: QuizPrepJob
): Promise<QuizQuestion[]> {
  const user = auth.currentUser
  if (!user) {
    throw new Error("Not authenticated")
  }

  const idToken = await user.getIdToken()
  const response = await fetch("/api/quiz-prep/load", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      userId: user.uid,
      jobId: job.id,
      courseId,
      kind,
      moduleIndex,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as {
    questions?: QuizQuestion[]
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.error || "Failed to load generated questions")
  }

  return data.questions ?? []
}

export async function loadQuestionsFromPrepJob(
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  job: QuizPrepJob
): Promise<QuizQuestion[]> {
  if (!job.questionIds?.length) return []

  const scopedModuleIndex = kind === "module" ? moduleIndex : null

  for (const delayMs of PREP_LOAD_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    const clientQuestions = await fetchQuizQuestionsByIds(
      courseId,
      job.questionIds,
      scopedModuleIndex,
      null
    )
    if (clientQuestions.length === job.questionIds.length) {
      return clientQuestions
    }
  }

  return loadQuestionsFromPrepJobApi(courseId, kind, moduleIndex, job)
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
