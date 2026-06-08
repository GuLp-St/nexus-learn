import { NextRequest, NextResponse } from "next/server"
import { loadQuestionsForPrepJobAdmin } from "@/lib/quiz-prep-server"
import type { QuizPrepKind } from "@/lib/quiz-prep-job"
import {
  AuthError,
  assertMatchingUserId,
  verifyRequestUserId,
} from "@/lib/verify-firebase-token"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const verifiedUid = await verifyRequestUserId(request)
    const body = await request.json()
    const userId = assertMatchingUserId(verifiedUid, body.userId as string | undefined)
    const jobId = body.jobId as string | undefined
    const courseId = body.courseId as string | undefined
    const kind = body.kind as QuizPrepKind | undefined
    const moduleIndex =
      typeof body.moduleIndex === "number" ? (body.moduleIndex as number) : null

    if (!jobId || !courseId || (kind !== "module" && kind !== "course")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const questions = await loadQuestionsForPrepJobAdmin(
      userId,
      jobId,
      courseId,
      kind,
      moduleIndex
    )

    return NextResponse.json({ questions })
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Failed to load quiz questions"
    console.error("[quiz-prep/load]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
