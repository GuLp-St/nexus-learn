import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { QuizQuestion } from "./quiz-utils"
import { getQuizQuestionDocId } from "./quiz-utils"
import type { QuizPrepKind } from "./quiz-prep-job"

function buildQuizQuestionDocCandidates(
  courseId: string,
  questionId: string,
  moduleIndex: number | null,
  lessonIndex: number | null
): string[] {
  return [
    getQuizQuestionDocId(courseId, moduleIndex, lessonIndex, questionId),
    moduleIndex !== null
      ? getQuizQuestionDocId(courseId, moduleIndex, null, questionId)
      : null,
    getQuizQuestionDocId(courseId, null, null, questionId),
  ].filter((id, idx, arr) => id && arr.indexOf(id) === idx) as string[]
}

async function fetchQuizQuestionByIdAdmin(
  courseId: string,
  questionId: string,
  moduleIndex: number | null,
  lessonIndex: number | null
): Promise<QuizQuestion | null> {
  const db = getAdminFirestore()

  for (const docId of buildQuizQuestionDocCandidates(courseId, questionId, moduleIndex, lessonIndex)) {
    const snap = await db.collection("quizQuestions").doc(docId).get()
    if (snap.exists) {
      return snap.data() as QuizQuestion
    }
  }

  const legacySnap = await db
    .collection("quizQuestions")
    .where("questionId", "==", questionId)
    .limit(5)
    .get()

  for (const legacyDoc of legacySnap.docs) {
    const data = legacyDoc.data() as QuizQuestion
    if (data.courseId === courseId) {
      return data
    }
  }

  return null
}

export async function fetchQuizQuestionsByIdsAdmin(
  courseId: string,
  questionIds: string[],
  moduleIndex: number | null = null,
  lessonIndex: number | null = null
): Promise<QuizQuestion[]> {
  const fetched = await Promise.all(
    questionIds.map((questionId) =>
      fetchQuizQuestionByIdAdmin(courseId, questionId, moduleIndex, lessonIndex)
    )
  )

  return questionIds
    .map((id, i) => (fetched[i]?.questionId === id ? fetched[i] : null))
    .filter((q): q is QuizQuestion => q !== null)
}

export async function loadQuestionsForPrepJobAdmin(
  userId: string,
  jobId: string,
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null
): Promise<QuizQuestion[]> {
  const db = getAdminFirestore()
  const jobSnap = await db.collection("quizPrepJobs").doc(jobId).get()
  if (!jobSnap.exists || jobSnap.data()?.userId !== userId) {
    throw new Error("Quiz prep job not found")
  }

  const job = jobSnap.data()!
  if (job.status !== "completed" || !Array.isArray(job.questionIds) || job.questionIds.length === 0) {
    throw new Error("Quiz is not ready yet")
  }
  if (job.courseId !== courseId || job.kind !== kind || job.moduleIndex !== moduleIndex) {
    throw new Error("Quiz prep job mismatch")
  }

  const questions = await fetchQuizQuestionsByIdsAdmin(
    courseId,
    job.questionIds as string[],
    kind === "module" ? moduleIndex : null,
    null
  )

  if (questions.length === 0) {
    throw new Error("Failed to load generated questions")
  }

  return questions
}

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
