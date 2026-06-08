import { findBlockIndexForFact } from "./lesson-fact-blocks"
import { getAccessibleLessonStreamAdmin } from "./lesson-stream-resolve-server"
import { getQuizReferenceCandidates } from "./quiz-reference-utils"
import type { CourseModule } from "./gemini"
import type { QuizQuestion } from "./quiz-utils"

export async function enrichQuestionLessonLinks(
  courseId: string,
  question: QuizQuestion,
  course: { modules: CourseModule[]; createdBy?: string }
): Promise<QuizQuestion> {
  const candidates = getQuizReferenceCandidates(courseId, question, course)
  if (candidates.length === 0) return question

  const available: Array<{
    moduleIndex: number
    lessonIndex: number
    lessonTitle: string
    blockIndex: number | null
  }> = []

  for (const ref of candidates) {
    const lesson = course.modules[ref.moduleIndex]?.lessons?.[ref.lessonIndex]
    const stream = await getAccessibleLessonStreamAdmin(
      course.createdBy,
      courseId,
      ref.moduleIndex,
      ref.lessonIndex,
      lesson
    )
    if (!stream) continue

    let blockIndex = ref.blockIndex
    if (blockIndex == null) {
      const factIds = [
        ...(question.sourceFactIds ?? []),
        ...(question.sourceFactId ? [question.sourceFactId] : []),
      ].filter(Boolean) as string[]
      for (const factId of factIds) {
        const fact = course.modules
          .flatMap((m) => m.accumulatedContext ?? [])
          .find((f) => f.id === factId || f.id.toLowerCase() === factId.toLowerCase())
        if (fact) {
          blockIndex = findBlockIndexForFact(stream, fact.text)
          break
        }
      }
    }

    available.push({
      moduleIndex: ref.moduleIndex,
      lessonIndex: ref.lessonIndex,
      lessonTitle: ref.lessonTitle,
      blockIndex,
    })
  }

  if (available.length === 0) return question

  return {
    ...question,
    sourceLessonLinks: available,
  }
}
