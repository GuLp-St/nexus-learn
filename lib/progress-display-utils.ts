/** Shared progress helpers for UI (client-safe, no firebase-admin). */

export const MODULE_QUIZ_PASS_SCORE = 50

export type QuizAttemptLike = {
  quizType?: string
  moduleIndex?: number | string | null
  completedAt?: unknown
  abandoned?: boolean
  totalScore?: number
  maxScore?: number
}

export function getModuleQuizScore(
  scores: Record<string, number> | undefined,
  moduleIndex: number
): number | undefined {
  if (!scores) return undefined
  const raw =
    scores[String(moduleIndex)] ??
    (scores as Record<number, number>)[moduleIndex]
  if (raw === undefined || raw === null) return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

/** Best completed module quiz attempt score (0–100). */
export function getBestModuleQuizAttemptScore(
  attempts: QuizAttemptLike[],
  moduleIndex: number
): number | undefined {
  const moduleAttempts = attempts.filter(
    (a) =>
      a.quizType === "module" &&
      Number(a.moduleIndex) === moduleIndex &&
      a.completedAt &&
      !(a as { abandoned?: boolean }).abandoned
  )

  let best: number | undefined
  for (const a of moduleAttempts) {
    const max = a.maxScore ?? 0
    if (max <= 0) continue
    const pct = Math.round(((a.totalScore ?? 0) / max) * 100)
    if (best === undefined || pct > best) best = pct
  }
  return best
}

/**
 * Effective module quiz score: max of Firestore progress and real quiz attempts.
 * Admin-set scores must not be overridden by a worse attempt.
 */
export function getEffectiveModuleQuizScore(
  scores: Record<string, number> | undefined,
  moduleIndex: number,
  attempts: QuizAttemptLike[] = []
): number | undefined {
  const fromProgress = getModuleQuizScore(scores, moduleIndex)
  const fromAttempt = getBestModuleQuizAttemptScore(attempts, moduleIndex)
  if (fromProgress === undefined) return fromAttempt
  if (fromAttempt === undefined) return fromProgress
  return Math.max(fromProgress, fromAttempt)
}

export function isModuleQuizPassed(
  scores: Record<string, number> | undefined,
  moduleIndex: number,
  attempts: QuizAttemptLike[] = []
): boolean {
  const score = getEffectiveModuleQuizScore(scores, moduleIndex, attempts)
  return score !== undefined && score >= MODULE_QUIZ_PASS_SCORE
}
