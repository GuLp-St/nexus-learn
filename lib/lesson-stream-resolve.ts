import type { LessonStream } from "./gemini"
import {
  getLegacyLessonStreamFromCourse,
  getUserLessonStream,
  lessonStreamDocId,
} from "./lesson-stream-store"

/** Lesson stream the viewer can open: own copy, legacy on course, or course creator's stream. */
export async function getAccessibleLessonStream(
  viewerUserId: string,
  courseCreatedBy: string | undefined,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  lesson: unknown
): Promise<LessonStream | null> {
  const own = await getUserLessonStream(viewerUserId, courseId, moduleIndex, lessonIndex)
  if (own) return own

  const legacy = getLegacyLessonStreamFromCourse(lesson)
  if (legacy) return legacy

  if (courseCreatedBy) {
    const creatorStream = await getUserLessonStream(
      courseCreatedBy,
      courseId,
      moduleIndex,
      lessonIndex
    )
    if (creatorStream) return creatorStream
  }

  return null
}

export async function isLessonStreamAccessible(
  viewerUserId: string,
  courseCreatedBy: string | undefined,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  lesson: unknown
): Promise<boolean> {
  const stream = await getAccessibleLessonStream(
    viewerUserId,
    courseCreatedBy,
    courseId,
    moduleIndex,
    lessonIndex,
    lesson
  )
  return stream != null
}

export { lessonStreamDocId }
