import { db } from "./firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
  limit,
} from "firebase/firestore"
import type { CreationCreditType } from "./course-creation-credit-actions"

export type CreationJobStatus = "pending" | "running" | "completed" | "failed"

export interface CourseCreationJob {
  id: string
  userId: string
  type: CreationCreditType
  status: CreationJobStatus
  phase: string
  detail: string
  courseId?: string | null
  error?: string | null
  topic?: string
  /** JSON-serialized DifficultyOption */
  difficultyJson?: string | null
  difficulty?: string | null
  toneInstruction?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

export async function createCourseCreationJob(
  userId: string,
  type: CreationCreditType,
  meta?: {
    topic?: string
    difficultyJson?: string
    difficulty?: string
    toneInstruction?: string
  }
): Promise<string> {
  const ref = doc(collection(db, "courseCreationJobs"))
  await setDoc(ref, {
    userId,
    type,
    status: "pending",
    phase: "queued",
    detail: "Waiting to start…",
    courseId: null,
    error: null,
    ...meta,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateCourseCreationJob(
  jobId: string,
  userId: string,
  patch: Partial<Pick<CourseCreationJob, "status" | "phase" | "detail" | "courseId" | "error">>
): Promise<void> {
  const ref = doc(db, "courseCreationJobs", jobId)
  const snap = await getDoc(ref)
  if (!snap.exists() || snap.data()?.userId !== userId) {
    throw new Error("Creation job not found")
  }
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function getCourseCreationJob(
  jobId: string,
  userId: string
): Promise<CourseCreationJob | null> {
  const snap = await getDoc(doc(db, "courseCreationJobs", jobId))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.userId !== userId) return null
  return { id: snap.id, ...data } as CourseCreationJob
}

export async function getActiveCourseCreationJob(
  userId: string
): Promise<CourseCreationJob | null> {
  try {
    const q = query(
      collection(db, "courseCreationJobs"),
      where("userId", "==", userId),
      where("status", "in", ["pending", "running"]),
      limit(5)
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    const sorted = snap.docs.sort((a, b) => {
      const aT = a.data().updatedAt?.toMillis?.() ?? 0
      const bT = b.data().updatedAt?.toMillis?.() ?? 0
      return bT - aT
    })
    const d = sorted[0]
    return { id: d.id, ...d.data() } as CourseCreationJob
  } catch (error) {
    console.error("Error fetching active creation job:", error)
    return null
  }
}
