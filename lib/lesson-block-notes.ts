import { db } from "./firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

function noteDocId(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  blockIndex: number
) {
  return `${userId}-${courseId}-${moduleIndex}-${lessonIndex}-${blockIndex}`
}

export function blockContentFingerprint(content: string): string {
  return content.trim().slice(0, 200)
}

export interface LessonBlockNoteRecord {
  note: string
  contentFingerprint?: string
  hasConflict?: boolean
}

export async function getLessonBlockNote(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  blockIndex: number,
  currentContent?: string
): Promise<LessonBlockNoteRecord> {
  const snap = await getDoc(
    doc(db, "userLessonBlockNotes", noteDocId(userId, courseId, moduleIndex, lessonIndex, blockIndex))
  )
  if (!snap.exists()) return { note: "" }

  const data = snap.data()
  const note = (data.note as string) || ""
  const storedFingerprint = data.contentFingerprint as string | undefined
  const hasConflict =
    !!note &&
    !!currentContent &&
    !!storedFingerprint &&
    storedFingerprint !== blockContentFingerprint(currentContent)

  return { note, contentFingerprint: storedFingerprint, hasConflict }
}

export async function saveLessonBlockNote(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  blockIndex: number,
  note: string,
  blockContent?: string
): Promise<void> {
  await setDoc(
    doc(db, "userLessonBlockNotes", noteDocId(userId, courseId, moduleIndex, lessonIndex, blockIndex)),
    {
      userId,
      courseId,
      moduleIndex,
      lessonIndex,
      blockIndex,
      note,
      contentFingerprint: blockContent ? blockContentFingerprint(blockContent) : undefined,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function resolveLessonBlockNoteConflict(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  blockIndex: number,
  action: "keep" | "discard",
  blockContent?: string
): Promise<void> {
  if (action === "discard") {
    await saveLessonBlockNote(userId, courseId, moduleIndex, lessonIndex, blockIndex, "", blockContent)
    return
  }
  const existing = await getLessonBlockNote(userId, courseId, moduleIndex, lessonIndex, blockIndex)
  await saveLessonBlockNote(
    userId,
    courseId,
    moduleIndex,
    lessonIndex,
    blockIndex,
    existing.note,
    blockContent
  )
}
