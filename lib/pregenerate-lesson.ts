import { doc, getDoc } from "firebase/firestore"
import { db } from "./firebase"
import { generateLessonStreamWithImages } from "./lesson-stream-actions"
import type { LessonMaterialImage } from "./lesson-material-images"
import { getUserLessonStream, saveUserLessonStream } from "./lesson-stream-store"
import type { CourseWithProgress } from "./course-utils"

/** Lesson immediately after the one the user is currently viewing. */
export function getNextLessonAfterCurrent(
  course: CourseWithProgress,
  moduleIndex: number,
  lessonIndex: number,
  isModuleUnlocked: (moduleIndex: number) => boolean
): { moduleIndex: number; lessonIndex: number } | null {
  const mod = course.modules[moduleIndex]
  if (!mod) return null
  if (lessonIndex + 1 < mod.lessons.length) {
    return { moduleIndex, lessonIndex: lessonIndex + 1 }
  }
  const nextMod = moduleIndex + 1
  if (nextMod < course.modules.length && isModuleUnlocked(nextMod)) {
    return { moduleIndex: nextMod, lessonIndex: 0 }
  }
  return null
}

export function getPregenerateTarget(
  nextLesson: { moduleIndex: number; lessonIndex: number } | null,
  course: CourseWithProgress,
  isModuleUnlocked: (moduleIndex: number) => boolean
): { moduleIndex: number; lessonIndex: number } | null {
  if (!nextLesson) return null
  const { moduleIndex, lessonIndex } = nextLesson
  const mod = course.modules[moduleIndex]
  if (!mod) return null
  if (lessonIndex + 1 < mod.lessons.length) {
    return { moduleIndex, lessonIndex: lessonIndex + 1 }
  }
  const nextMod = moduleIndex + 1
  if (nextMod < course.modules.length && isModuleUnlocked(nextMod)) {
    return { moduleIndex: nextMod, lessonIndex: 0 }
  }
  return null
}

export function lessonKey(moduleIndex: number, lessonIndex: number): string {
  return `${moduleIndex}-${lessonIndex}`
}

export async function isLessonPregenerated(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<boolean> {
  const stream = await getUserLessonStream(userId, courseId, moduleIndex, lessonIndex)
  return !!stream
}

export async function pregenerateLesson(
  userId: string,
  course: CourseWithProgress,
  moduleIndex: number,
  lessonIndex: number
): Promise<void> {
  const existing = await getUserLessonStream(userId, course.id, moduleIndex, lessonIndex)
  if (existing) return

  const mod = course.modules[moduleIndex]
  const lesson = mod.lessons[lessonIndex]
  const sourceContext = (lesson as { sourceContext?: Record<string, unknown> }).sourceContext

  let loadedMaterialContext:
    | { sourceFiles?: Array<{ name: string; url: string }>; imageMap?: Record<number, string> }
    | undefined

  const sourceMaterialId = (course as { sourceMaterialId?: string }).sourceMaterialId
  if (sourceMaterialId) {
    const materialSnap = await getDoc(doc(db, "course_materials", sourceMaterialId))
    if (materialSnap.exists()) {
      const mat = materialSnap.data()
      loadedMaterialContext = {
        sourceFiles: mat.sourceFiles as Array<{ name: string; url: string }>,
        imageMap: mat.imageMap as Record<number, string>,
      }
    }
  }

  const stream = await generateLessonStreamWithImages(
    lesson.title,
    course.title,
    mod.title,
    sourceContext
      ? {
          sourceMaterialId:
            (sourceContext.sourceMaterialId as string) || sourceMaterialId,
          keyPoints: (sourceContext.keyPoints as string[]) || [],
          references: (sourceContext.references as string[]) || [],
          lessonSummary: sourceContext.lessonSummary as string | undefined,
          moduleSummary: sourceContext.moduleSummary as string | undefined,
          processedImages:
            (sourceContext.processedImages as LessonMaterialImage[]) || [],
          sourceFiles: loadedMaterialContext?.sourceFiles,
          imageMap: loadedMaterialContext?.imageMap,
        }
      : loadedMaterialContext
        ? {
            keyPoints: [],
            references: [],
            sourceFiles: loadedMaterialContext.sourceFiles,
            imageMap: loadedMaterialContext.imageMap,
          }
        : undefined
  )

  await saveUserLessonStream(userId, course.id, moduleIndex, lessonIndex, stream)
}
