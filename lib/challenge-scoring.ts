/** Combo multiplier: 1.0 base, +0.1 per consecutive correct (max 2.0). */
export const COMBO_STEP = 0.1
export const COMBO_BASE = 1
export const COMBO_MAX = 2
export const COMBO_TIMEOUT_MS = 10000

export function comboMultiplierFromStreak(streak: number): number {
  if (streak <= 0) return COMBO_BASE
  return Math.min(COMBO_MAX, COMBO_BASE + streak * COMBO_STEP)
}

/**
 * Competitive score: higher raw score, combo, and speed yield a higher value.
 * Formula: (rawScore × comboMultiplier × 1000) / timeSeconds
 */
export function calculatePerformanceScore(
  rawScore: number,
  comboMultiplier: number,
  timeTakenSeconds: number
): number {
  const time = Math.max(timeTakenSeconds, 1)
  return Math.round((rawScore * comboMultiplier * 1000) / time)
}

export function filterObjectiveQuestions<T extends { type: string }>(
  questions: T[],
  targetCount: number
): T[] {
  const objective = questions.filter((q) => q.type === "objective")
  if (objective.length === 0) {
    throw new Error("No objective questions available for this challenge")
  }
  const shuffled = [...objective].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(targetCount, shuffled.length))
}
