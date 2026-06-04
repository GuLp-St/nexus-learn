import { db } from "./firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import type { LessonStream } from "./gemini"

const COLLECTION = "userLessonStreams"

export function lessonStreamDocId(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): string {
  return `${userId}-${courseId}-${moduleIndex}-${lessonIndex}`
}

export async function getUserLessonStream(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<LessonStream | null> {
  try {
    const ref = doc(db, COLLECTION, lessonStreamDocId(userId, courseId, moduleIndex, lessonIndex))
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const data = snap.data()
    const stream = data?.stream as LessonStream | undefined
    if (stream?.blocks && Array.isArray(stream.blocks) && stream.blocks.length > 0) {
      return stream
    }
    return null
  } catch (error) {
    console.error("Error loading user lesson stream:", error)
    return null
  }
}

export async function saveUserLessonStream(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  stream: LessonStream
): Promise<void> {
  const ref = doc(db, COLLECTION, lessonStreamDocId(userId, courseId, moduleIndex, lessonIndex))
  await setDoc(
    ref,
    {
      userId,
      courseId,
      moduleIndex,
      lessonIndex,
      stream,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

/** Read legacy stream embedded on the course (pre-migration). */
export function getLegacyLessonStreamFromCourse(lesson: unknown): LessonStream | null {
  const lessonData = lesson as { stream?: LessonStream }
  const stream = lessonData?.stream
  if (stream?.blocks && Array.isArray(stream.blocks) && stream.blocks.length > 0) {
    return stream
  }
  return null
}
