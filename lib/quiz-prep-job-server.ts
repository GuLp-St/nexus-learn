import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { QuizPrepJob, QuizPrepKind, QuizPrepStatus } from "./quiz-prep-job"

function serializeQuizPrepJob(id: string, data: Record<string, unknown>): QuizPrepJob {
  return {
    id,
    userId: String(data.userId ?? ""),
    courseId: String(data.courseId ?? ""),
    kind: data.kind as QuizPrepKind,
    moduleIndex: typeof data.moduleIndex === "number" ? data.moduleIndex : null,
    status: data.status as QuizPrepStatus,
    questionIds: Array.isArray(data.questionIds) ? (data.questionIds as string[]) : undefined,
    attemptId: typeof data.attemptId === "string" ? data.attemptId : null,
    error: typeof data.error === "string" ? data.error : null,
    courseTitle: typeof data.courseTitle === "string" ? data.courseTitle : undefined,
  }
}

export async function getQuizPrepJobServer(
  jobId: string,
  userId: string
): Promise<QuizPrepJob | null> {
  const db = getAdminFirestore()
  const snap = await db.collection("quizPrepJobs").doc(jobId).get()
  if (!snap.exists || snap.data()?.userId !== userId) return null
  return serializeQuizPrepJob(snap.id, snap.data()!)
}

export async function updateQuizPrepJobServer(
  jobId: string,
  userId: string,
  patch: Partial<Pick<QuizPrepJob, "status" | "questionIds" | "attemptId" | "error">>
): Promise<void> {
  const db = getAdminFirestore()
  const ref = db.collection("quizPrepJobs").doc(jobId)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Quiz prep job not found")
  }
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() })
}
