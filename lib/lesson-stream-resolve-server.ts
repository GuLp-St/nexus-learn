import type { LessonStream } from "./gemini"
import { getAdminFirestore } from "./firebase-admin"
import { getLegacyLessonStreamFromCourse, lessonStreamDocId } from "./lesson-stream-store"

async function readUserLessonStreamAdmin(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<LessonStream | null> {
  const db = getAdminFirestore()
  const snap = await db
    .collection("userLessonStreams")
    .doc(lessonStreamDocId(userId, courseId, moduleIndex, lessonIndex))
    .get()

  if (!snap.exists) return null
  const stream = snap.data()?.stream as LessonStream | undefined
  if (stream?.blocks && Array.isArray(stream.blocks) && stream.blocks.length > 0) {
    return stream
  }
  return null
}

export async function getAccessibleLessonStreamAdmin(
  courseCreatedBy: string | undefined,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  lesson: unknown
): Promise<LessonStream | null> {
  const legacy = getLegacyLessonStreamFromCourse(lesson)
  if (legacy) return legacy

  if (courseCreatedBy) {
    const creatorStream = await readUserLessonStreamAdmin(
      courseCreatedBy,
      courseId,
      moduleIndex,
      lessonIndex
    )
    if (creatorStream) return creatorStream
  }

  return null
}
