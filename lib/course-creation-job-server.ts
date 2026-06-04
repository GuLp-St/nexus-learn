import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { CreationCreditType } from "./course-creation-credits-shared"
import type { CourseCreationJob, CreationJobStatus } from "./course-creation-job"

export type { CourseCreationJob, CreationJobStatus }

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
  return { id: snap.id, ...data } as CourseCreationJob
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
    const d = sorted[0]
    return { id: d.id, ...d.data() } as CourseCreationJob
  } catch (error) {
    console.error("Error fetching active creation job:", error)
    return null
  }
}
