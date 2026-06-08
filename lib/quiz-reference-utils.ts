import type { CourseModule } from "./gemini"
import { buildLessonBlockHref, findBlockIndexForFact } from "./lesson-fact-blocks"
import { isLessonStreamAccessible } from "./lesson-stream-resolve"
import { getLegacyLessonStreamFromCourse } from "./lesson-stream-store"
import type { QuizQuestion } from "./quiz-utils"

export type QuizLessonReference = {
  moduleIndex: number
  lessonIndex: number
  lessonTitle: string
  blockIndex: number | null
  href: string
  label: string
}

type FactMatch = {
  moduleIndex: number
  lessonIndex: number
  lessonTitle: string
  blockIndex: number | null
}

function parseSourceLessonId(
  sourceLessonId: string
): { moduleIndex: number; lessonIndex: number } | null {
  const parts = sourceLessonId.split("-")
  if (parts.length < 3) return null

  const lessonIndex = Number(parts[parts.length - 1])
  const moduleIndex = Number(parts[parts.length - 2])
  if (Number.isNaN(moduleIndex) || Number.isNaN(lessonIndex)) return null

  return { moduleIndex, lessonIndex }
}

function resolveBlockIndexForFact(
  modules: CourseModule[],
  moduleIndex: number,
  lessonIndex: number,
  factText: string,
  storedBlockIndex?: number | null
): number | null {
  if (typeof storedBlockIndex === "number" && storedBlockIndex >= 0) {
    return storedBlockIndex
  }

  const lesson = modules[moduleIndex]?.lessons?.[lessonIndex]
  const stream = getLegacyLessonStreamFromCourse(lesson)
  if (!stream) return null

  return findBlockIndexForFact(stream, factText)
}

function findFactInCourse(modules: CourseModule[], factId: string): FactMatch | null {
  for (const mod of modules) {
    const fact = mod.accumulatedContext?.find(
      (entry) =>
        entry.id === factId ||
        entry.id.toLowerCase() === factId.toLowerCase()
    )
    if (!fact) continue

    const parsed = parseSourceLessonId(fact.sourceLessonId)
    if (!parsed) continue

    const blockIndex = resolveBlockIndexForFact(
      modules,
      parsed.moduleIndex,
      parsed.lessonIndex,
      fact.text,
      fact.sourceBlockIndex
    )

    return {
      moduleIndex: parsed.moduleIndex,
      lessonIndex: parsed.lessonIndex,
      lessonTitle: fact.sourceLessonTitle,
      blockIndex,
    }
  }

  return null
}

function formatReferenceLabel(lessonTitle: string, blockIndex: number | null): string {
  if (blockIndex == null) return lessonTitle
  return `${lessonTitle} · Block ${blockIndex + 1}`
}

function toReference(
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  lessonTitle: string,
  blockIndex: number | null
): QuizLessonReference {
  return {
    moduleIndex,
    lessonIndex,
    lessonTitle,
    blockIndex,
    href: buildLessonBlockHref(courseId, moduleIndex, lessonIndex, blockIndex),
    label: formatReferenceLabel(lessonTitle, blockIndex),
  }
}

/** Build candidate references from question metadata (may include ungenerated lessons). */
export function getQuizReferenceCandidates(
  courseId: string,
  question: QuizQuestion,
  course?: { modules: CourseModule[] } | null
): QuizLessonReference[] {
  if (!course) return []

  const seen = new Set<string>()
  const refs: QuizLessonReference[] = []

  const push = (
    moduleIndex: number,
    lessonIndex: number,
    lessonTitle: string,
    blockIndex: number | null = null
  ) => {
    const key = `${moduleIndex}-${lessonIndex}-${blockIndex ?? "lesson"}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push(toReference(courseId, moduleIndex, lessonIndex, lessonTitle, blockIndex))
  }

  const factIds = [
    ...(question.sourceFactIds ?? []),
    ...(question.sourceFactId ? [question.sourceFactId] : []),
  ].filter(Boolean) as string[]

  if (factIds.length > 0) {
    for (const factId of factIds) {
      const match = findFactInCourse(course.modules, factId)
      if (match) {
        push(match.moduleIndex, match.lessonIndex, match.lessonTitle, match.blockIndex)
      }
    }
    if (refs.length > 0) return refs
  }

  for (const link of question.sourceLessonLinks ?? []) {
    push(link.moduleIndex, link.lessonIndex, link.lessonTitle, link.blockIndex ?? null)
  }
  if (refs.length > 0) return refs

  if (
    question.moduleIndex != null &&
    question.moduleIndex >= 0 &&
    question.lessonIndex != null &&
    question.lessonIndex >= 0
  ) {
    const lesson = course.modules[question.moduleIndex]?.lessons?.[question.lessonIndex]
    if (lesson) {
      push(question.moduleIndex, question.lessonIndex, lesson.title, null)
    }
  }

  return refs
}

export async function filterReferencesByAccessibleStreams(
  viewerUserId: string,
  courseId: string,
  course: { modules: CourseModule[]; createdBy?: string },
  candidates: QuizLessonReference[]
): Promise<QuizLessonReference[]> {
  const available: QuizLessonReference[] = []

  for (const ref of candidates) {
    const lesson = course.modules[ref.moduleIndex]?.lessons?.[ref.lessonIndex]
    const accessible = await isLessonStreamAccessible(
      viewerUserId,
      course.createdBy,
      courseId,
      ref.moduleIndex,
      ref.lessonIndex,
      lesson
    )
    if (accessible) available.push(ref)
  }

  return available
}

export async function resolveQuizQuestionReferencesForViewer(
  viewerUserId: string,
  courseId: string,
  course: { modules: CourseModule[]; createdBy?: string },
  question: QuizQuestion
): Promise<QuizLessonReference[]> {
  const candidates = getQuizReferenceCandidates(courseId, question, course)
  if (candidates.length === 0) return []
  return filterReferencesByAccessibleStreams(viewerUserId, courseId, course, candidates)
}

/** @deprecated Use resolveQuizQuestionReferencesForViewer — kept for sync callers without stream checks */
export function resolveQuizQuestionReferences(
  courseId: string,
  question: QuizQuestion,
  course?: { modules: CourseModule[] } | null
): QuizLessonReference[] {
  return getQuizReferenceCandidates(courseId, question, course)
}

