import { db } from "./firebase"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import type { LessonStream } from "./gemini"
import { findBlockIndexForFact } from "./lesson-fact-blocks"

/**
 * Update module accumulatedContext on the course doc — only for the course creator.
 */
export async function mergeLessonFactsIntoCourseModule(
  courseId: string,
  userId: string,
  courseCreatedBy: string | undefined,
  moduleIndex: number,
  lessonIndex: number,
  lessonTitle: string,
  stream: LessonStream
): Promise<void> {
  if (!courseCreatedBy || userId !== courseCreatedBy) {
    return
  }

  const courseRef = doc(db, "courses", courseId)
  const courseDoc = await getDoc(courseRef)
  const courseDataForUpdate = courseDoc.data()
  if (!courseDataForUpdate) return

  const updatedModules = JSON.parse(JSON.stringify(courseDataForUpdate.modules || []))
  if (!updatedModules[moduleIndex]) return

  if (!updatedModules[moduleIndex].accumulatedContext) {
    updatedModules[moduleIndex].accumulatedContext = []
  }

  const lessonId = `${courseId}-${moduleIndex}-${lessonIndex}`
  for (const fact of stream.facts || []) {
    const factEntry = {
      id: fact.id,
      text: fact.text,
      sourceLessonId: lessonId,
      sourceLessonTitle: lessonTitle,
      sourceBlockIndex: findBlockIndexForFact(stream, fact.text),
    }
    const exists = updatedModules[moduleIndex].accumulatedContext.some(
      (f: { id: string }) => f.id === fact.id
    )
    if (!exists) {
      updatedModules[moduleIndex].accumulatedContext.push(factEntry)
    }
  }

  await updateDoc(courseRef, { modules: updatedModules })
}
