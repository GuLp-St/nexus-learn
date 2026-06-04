import { NextRequest, NextResponse } from "next/server"
import { runAiCourseCreationPipeline } from "@/lib/course-creation-pipeline-ai"
import {
  getCourseCreationJob,
  updateCourseCreationJob,
} from "@/lib/course-creation-job-server"
import type { DifficultyOption } from "@/lib/gemini"
import {
  AuthError,
  assertMatchingUserId,
  verifyRequestUserId,
} from "@/lib/verify-firebase-token"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  let userId: string | undefined
  let jobId: string | undefined

  try {
    const verifiedUid = await verifyRequestUserId(request)
    const body = await request.json()
    userId = assertMatchingUserId(verifiedUid, body.userId as string | undefined)
    jobId = body.jobId as string | undefined
    const topic = body.topic as string | undefined
    const difficulty = body.difficulty as DifficultyOption | null | undefined
    const difficultyAnalysis = body.difficultyAnalysis ?? null

    if (!jobId || !topic?.trim()) {
      return NextResponse.json({ error: "Missing jobId or topic" }, { status: 400 })
    }

    const job = await getCourseCreationJob(jobId, userId)
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    if (job.status === "completed" && job.courseId) {
      return NextResponse.json({ courseId: job.courseId })
    }
    if (job.status === "failed") {
      return NextResponse.json({ error: job.error || "Job failed" }, { status: 400 })
    }

    await updateCourseCreationJob(jobId, userId, {
      status: "running",
      phase: "starting",
      detail: "Starting AI course generation…",
    })

    const courseId = await runAiCourseCreationPipeline(userId, jobId, topic.trim(), {
      difficulty: difficulty ?? null,
      difficultyAnalysis,
    })

    return NextResponse.json({ courseId })
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error("course-creation/ai error:", err)
    const message = err instanceof Error ? err.message : "Failed to create course"

    if (jobId && userId) {
      try {
        await updateCourseCreationJob(jobId, userId, {
          status: "failed",
          phase: "error",
          detail: message,
          error: message,
        })
      } catch {
        /* ignore secondary failure */
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
