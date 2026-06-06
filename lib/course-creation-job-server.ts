import { FieldValue, type DocumentData } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { CreationCreditType } from "./course-creation-credits-shared"
import type { CourseCreationJob, CreationJobStatus } from "./course-creation-job"

export type { CourseCreationJob, CreationJobStatus }

/** Pending jobs never resume the pipeline — fail after this age. */
const STALE_PENDING_MS = 60_000
/** Running pipelines time out (upload API maxDuration is 300s). */
const STALE_RUNNING_MS = 12 * 60_000

function serializeCourseCreationJob(
  id: string,
  data: DocumentData
): CourseCreationJob {
  return {
    id,
    userId: data.userId,
    type: data.type,
    status: data.status,
    phase: data.phase,
    detail: data.detail,
    courseId: data.courseId ?? null,
    error: data.error ?? null,
    topic: data.topic,
    difficultyJson: data.difficultyJson ?? null,
    difficulty: data.difficulty ?? null,
    toneInstruction: data.toneInstruction ?? null,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  }
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
  const db = getAdminFirestore()
  const ref = db.collection("courseCreationJobs").doc()
  await ref.set({
    userId,
    type,
    status: "pending",
    phase: "queued",
    detail: "Waiting to start…",
    courseId: null,
    error: null,
    ...meta,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function updateCourseCreationJob(
  jobId: string,
  userId: string,
  patch: Partial<Pick<CourseCreationJob, "status" | "phase" | "detail" | "courseId" | "error">>
): Promise<void> {
  const db = getAdminFirestore()
  const ref = db.collection("courseCreationJobs").doc(jobId)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Creation job not found")
  }
  await ref.update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function getCourseCreationJob(
  jobId: string,
  userId: string
): Promise<CourseCreationJob | null> {
  const snap = await getAdminFirestore().collection("courseCreationJobs").doc(jobId).get()
  if (!snap.exists) return null
  const data = snap.data()
  if (data?.userId !== userId) return null
  return serializeCourseCreationJob(snap.id, data)
}

function jobAgeMs(job: CourseCreationJob): number {
  const ts = job.updatedAt ?? job.createdAt
  if (ts == null) return Number.POSITIVE_INFINITY
  return Date.now() - ts
}

function isJobStale(job: CourseCreationJob): boolean {
  const age = jobAgeMs(job)
  if (job.status === "pending") return age > STALE_PENDING_MS
  if (job.status === "running") return age > STALE_RUNNING_MS
  return false
}

export async function failCourseCreationJob(
  jobId: string,
  userId: string,
  message: string
): Promise<void> {
  await updateCourseCreationJob(jobId, userId, {
    status: "failed",
    phase: "error",
    detail: message,
    error: message,
  })
}

export async function getActiveCourseCreationJob(
  userId: string
): Promise<CourseCreationJob | null> {
  try {
    const snap = await getAdminFirestore()
      .collection("courseCreationJobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "running"])
      .limit(5)
      .get()

    if (snap.empty) return null

    const sorted = snap.docs.sort((a, b) => {
      const aT = a.data().updatedAt?.toMillis?.() ?? 0
      const bT = b.data().updatedAt?.toMillis?.() ?? 0
      return bT - aT
    })

    let activeRunning: CourseCreationJob | null = null

    for (const d of sorted) {
      const job = serializeCourseCreationJob(d.id, d.data())
      if (job.status === "running" && !isJobStale(job)) {
        activeRunning = job
        continue
      }
      const message =
        job.status === "pending"
          ? "Creation was interrupted before starting. Please try again."
          : "Creation timed out. Please try again."
      await failCourseCreationJob(job.id, userId, message)
    }

    return activeRunning
  } catch (error) {
    console.error("Error fetching active creation job:", error)
    return null
  }
}
