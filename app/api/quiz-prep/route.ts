import { NextRequest, NextResponse } from "next/server"
import {
  getQuizPrepJobServer,
  updateQuizPrepJobServer,
} from "@/lib/quiz-prep-job-server"
import { runQuizPrepPipeline } from "@/lib/quiz-prep-pipeline"
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

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
    }

    const job = await getQuizPrepJobServer(jobId, userId)
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    if (job.status === "completed" && job.questionIds?.length) {
      return NextResponse.json({ questionIds: job.questionIds })
    }
    if (job.status === "failed") {
      return NextResponse.json({ error: job.error || "Job failed" }, { status: 400 })
    }

    await updateQuizPrepJobServer(jobId, userId, { status: "running", error: null })

    const questionIds = await runQuizPrepPipeline(
      job.courseId,
      job.kind,
      job.moduleIndex
    )

    await updateQuizPrepJobServer(jobId, userId, {
      status: "completed",
      questionIds,
      error: null,
    })

    return NextResponse.json({ questionIds })
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Quiz prep failed"
    if (userId && jobId) {
      await updateQuizPrepJobServer(jobId, userId, {
        status: "failed",
        error: message,
      }).catch(() => {})
    }
    console.error("[quiz-prep]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
