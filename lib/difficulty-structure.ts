import type { CourseMaterialAnalysis, LessonDetail } from "./gemini-upload"

export type CourseDifficulty = "beginner" | "intermediate" | "expert"

export const DIFFICULTY_STRUCTURE: Record<
  CourseDifficulty,
  { modules: number; lessonsPerModule: number[]; xpMultiplier: number }
> = {
  beginner: { modules: 3, lessonsPerModule: [2, 2, 2], xpMultiplier: 1 },
  intermediate: { modules: 4, lessonsPerModule: [3, 3, 3, 3], xpMultiplier: 1.5 },
  expert: { modules: 5, lessonsPerModule: [4, 4, 4, 4, 4], xpMultiplier: 2 },
}

function cloneLesson(les: LessonDetail, title: string, keepPages: boolean): LessonDetail {
  if (keepPages) {
    return { ...les, title: les.title || title }
  }
  return {
    title,
    summary: les.summary ?? "",
    keyPoints: [...(les.keyPoints ?? [])],
    references: [...(les.references ?? [])],
    materialPages: [],
    sourceFileName: les.sourceFileName,
  }
}

/** Trim or pad module/lesson outline to match chosen difficulty size. */
export function applyDifficultyToAnalysis(
  analysis: CourseMaterialAnalysis,
  difficulty: CourseDifficulty
): CourseMaterialAnalysis {
  const preset = DIFFICULTY_STRUCTURE[difficulty]
  const sourceModules = analysis.modules ?? []

  const modules = Array.from({ length: preset.modules }, (_, i) => {
    const src = sourceModules[i] ?? sourceModules[sourceModules.length - 1]
    const lessonTarget = preset.lessonsPerModule[i] ?? 3
    const srcLessons = src?.lessons ?? []
    const lessons = Array.from({ length: lessonTarget }, (_, li) => {
      const srcLesson = srcLessons[li]
      if (srcLesson) {
        return cloneLesson(srcLesson, srcLesson.title || `Lesson ${li + 1}`, true)
      }
      const fallback = srcLessons[srcLessons.length - 1]
      if (fallback) {
        return cloneLesson(fallback, `Lesson ${li + 1}`, false)
      }
      return {
        title: `Lesson ${li + 1}`,
        summary: "",
        keyPoints: [],
        references: [],
        materialPages: [],
      }
    })
    return {
      title: src?.title ?? `Module ${i + 1}`,
      summary: src?.summary ?? "",
      lessons,
    }
  })

  return {
    ...analysis,
    modules,
    suggestedModules: modules.map((m) => m.title),
  }
}
