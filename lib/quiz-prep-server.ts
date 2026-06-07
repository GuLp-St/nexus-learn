import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { QuizQuestion } from "./quiz-utils"
import { getQuizQuestionDocId } from "./quiz-utils"

export async function saveQuizQuestionsAdmin(questions: QuizQuestion[]): Promise<void> {
  const db = getAdminFirestore()
  const batch = db.batch()

  for (const question of questions) {
    const cleaned = Object.fromEntries(
      Object.entries(question).filter(([, v]) => v !== undefined)
    ) as QuizQuestion

    const docId = getQuizQuestionDocId(
      cleaned.courseId,
      cleaned.moduleIndex ?? null,
      cleaned.lessonIndex ?? null,
      cleaned.questionId
    )

    batch.set(
      db.collection("quizQuestions").doc(docId),
      { ...cleaned, createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
  }

  await batch.commit()
}
