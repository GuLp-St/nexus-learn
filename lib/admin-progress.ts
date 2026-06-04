import type { CourseData } from "./gemini"

/** Build lesson keys `moduleIndex-lessonIndex` for every lesson in a course. */
export function getAllLessonKeys(course: Pick<CourseData, "modules">): string[] {
  const keys: string[] = []
  const modules = course.modules ?? []
  modules.forEach((mod, moduleIndex) => {
    const lessons = mod.lessons ?? []
    lessons.forEach((_, lessonIndex) => {
      keys.push(`${moduleIndex}-${lessonIndex}`)
    })
  })
  return keys
}

/** Lesson keys for a single module. */
export function getModuleLessonKeys(
  course: Pick<CourseData, "modules">,
  moduleIndex: number
): string[] {
  const mod = course.modules?.[moduleIndex]
  if (!mod?.lessons?.length) return []
  return mod.lessons.map((_, lessonIndex) => `${moduleIndex}-${lessonIndex}`)
}

export function calcProgressPercent(
  completedLessons: string[],
  course: Pick<CourseData, "modules">
): number {
  const total = getAllLessonKeys(course).length
  if (total === 0) return 0
  return Math.min(100, Math.round((completedLessons.length / total) * 100))
}

/** Read module quiz score whether stored as string or numeric key. */
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

export function buildModuleQuizScores(
  course: Pick<CourseData, "modules">,
  score = 100
): Record<string, number> {
  const scores: Record<string, number> = {}
  const modules = course.modules ?? []
  modules.forEach((_, moduleIndex) => {
    scores[String(moduleIndex)] = score
  })
  return scores
}

/** Merge lesson keys into completedLessons without duplicates. */
export function mergeCompletedLessons(
  existing: string[],
  keysToAdd: string[]
): string[] {
  const set = new Set(existing)
  keysToAdd.forEach((k) => set.add(k))
  return Array.from(set)
}

/** Module quiz pass threshold (matches roadmap). */
export const MODULE_QUIZ_PASS_SCORE = 50

export function isModulePassed(
  scores: Record<string, number> | undefined,
  moduleIndex: number
): boolean {
  const score = getModuleQuizScore(scores, moduleIndex)
  return score !== undefined && score >= MODULE_QUIZ_PASS_SCORE
}
