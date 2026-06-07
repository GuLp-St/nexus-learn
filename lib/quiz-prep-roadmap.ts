import type { QuizPrepJob, QuizPrepKind } from "./quiz-prep-job"

export function quizPrepKey(kind: QuizPrepKind, moduleIndex: number | null): string {
  return kind === "course" ? "course" : `module-${moduleIndex}`
}

export function getQuizPrepFor(
  jobs: Record<string, QuizPrepJob | undefined>,
  kind: QuizPrepKind,
  moduleIndex: number | null
): QuizPrepJob | undefined {
  return jobs[quizPrepKey(kind, moduleIndex)]
}

export function isQuizPrepGenerating(job?: QuizPrepJob): boolean {
  return job?.status === "pending" || job?.status === "running"
}

export function isQuizPrepReady(job?: QuizPrepJob): boolean {
  return job?.status === "completed" && !!job.questionIds?.length
}
