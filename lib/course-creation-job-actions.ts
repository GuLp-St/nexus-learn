"use server"

import {
  createCourseCreationJob,
  failCourseCreationJob,
  getActiveCourseCreationJob,
  getCourseCreationJob,
} from "./course-creation-job-server"
import { getCourseCreationCredits } from "./course-creation-credit-actions"
import type { CreationCreditType } from "./course-creation-credit-actions"

export async function startCourseCreationJob(
  userId: string,
  type: CreationCreditType,
  meta?: {
    topic?: string
    difficultyJson?: string
    difficulty?: string
    toneInstruction?: string
  }
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    const credits = await getCourseCreationCredits(userId)
    if (!credits[type]) {
      return {
        ok: false,
        error: `Pay the ${type === "ai" ? "AI" : "upload"} creation fee before starting.`,
      }
    }

    const active = await getActiveCourseCreationJob(userId)
    if (active) {
      return { ok: true, jobId: active.id }
    }

    const jobId = await createCourseCreationJob(userId, type, meta)
    return { ok: true, jobId }
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start creation job",
    }
  }
}

export async function fetchCourseCreationJob(jobId: string, userId: string) {
  return getCourseCreationJob(jobId, userId)
}

export async function fetchActiveCourseCreationJob(userId: string) {
  return getActiveCourseCreationJob(userId)
}

export async function cancelCourseCreationJob(
  jobId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const job = await getCourseCreationJob(jobId, userId)
    if (!job) {
      return { ok: false, error: "Job not found" }
    }
    if (job.status === "completed") {
      return { ok: true }
    }
    await failCourseCreationJob(jobId, userId, "Cancelled by user.")
    return { ok: true }
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cancel job",
    }
  }
}
