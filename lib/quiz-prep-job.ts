import { db } from "./firebase"
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore"

export type QuizPrepKind = "module" | "course"
export type QuizPrepStatus = "pending" | "running" | "completed" | "failed"

export interface QuizPrepJob {
  id: string
  userId: string
  courseId: string
  kind: QuizPrepKind
  moduleIndex: number | null
  status: QuizPrepStatus
  questionIds?: string[]
  attemptId?: string | null
  error?: string | null
  courseTitle?: string
}

export async function createQuizPrepJob(
  userId: string,
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null,
  courseTitle?: string
): Promise<string> {
  const ref = doc(collection(db, "quizPrepJobs"))
  await setDoc(ref, {
    userId,
    courseId,
    kind,
    moduleIndex,
    status: "pending",
    questionIds: null,
    attemptId: null,
    error: null,
    courseTitle: courseTitle ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateQuizPrepJob(
  jobId: string,
  userId: string,
  patch: Partial<Pick<QuizPrepJob, "status" | "questionIds" | "attemptId" | "error">>
): Promise<void> {
  const ref = doc(db, "quizPrepJobs", jobId)
  const snap = await getDoc(ref)
  if (!snap.exists() || snap.data()?.userId !== userId) {
    throw new Error("Quiz prep job not found")
  }
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

export async function getQuizPrepJob(jobId: string, userId: string): Promise<QuizPrepJob | null> {
  const ref = doc(db, "quizPrepJobs", jobId)
  const snap = await getDoc(ref)
  if (!snap.exists() || snap.data()?.userId !== userId) return null
  return { id: snap.id, ...snap.data() } as QuizPrepJob
}

export async function findActiveQuizPrepJob(
  userId: string,
  courseId: string,
  kind: QuizPrepKind,
  moduleIndex: number | null
): Promise<QuizPrepJob | null> {
  const q = query(
    collection(db, "quizPrepJobs"),
    where("userId", "==", userId),
    where("courseId", "==", courseId),
    where("kind", "==", kind),
    limit(5)
  )
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    const job = { id: d.id, ...d.data() } as QuizPrepJob
    if (job.moduleIndex !== moduleIndex) continue
    if (job.status === "pending" || job.status === "running" || job.status === "completed") {
      return job
    }
  }
  return null
}
