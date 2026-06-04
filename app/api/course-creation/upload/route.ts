import { NextRequest, NextResponse } from "next/server"
import { runUploadCourseCreationPipeline } from "@/lib/course-creation-pipeline-upload"
import {
  getCourseCreationJob,
  updateCourseCreationJob,
} from "@/lib/course-creation-job-server"
import type { CourseDifficulty } from "@/lib/difficulty-structure"
import {
  AuthError,
  assertMatchingUserId,
  verifyRequestUserId,
} from "@/lib/verify-firebase-token"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10

export async function POST(request: NextRequest) {
  let jobId: string | undefined
  let userId: string | undefined

  try {
    const verifiedUid = await verifyRequestUserId(request)
    const formData = await request.formData()
    userId = assertMatchingUserId(verifiedUid, formData.get("userId") as string | undefined)
    jobId = formData.get("jobId") as string | undefined
    const difficulty = (formData.get("difficulty") as CourseDifficulty) || "intermediate"
    const toneInstruction = (formData.get("toneInstruction") as string) || ""

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
    }

    const job = await getCourseCreationJob(jobId, userId)
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    if (job.status === "completed" && job.courseId) {
      return NextResponse.json({ courseId: job.courseId })
    }

    const fileInputs: Array<{ name: string; buffer: Buffer }> = []
    const entries = formData.getAll("files")
    for (const entry of entries) {
      if (!(entry instanceof File)) continue
      if (fileInputs.length >= MAX_FILES) break
      const name = entry.name.toLowerCase()
      if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".pptx")) {
        continue
      }
      if (entry.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `${entry.name} exceeds ${MAX_BYTES / 1024 / 1024}MB limit` },
          { status: 400 }
        )
      }
      fileInputs.push({
        name: entry.name,
        buffer: Buffer.from(await entry.arrayBuffer()),
      })
    }

    if (fileInputs.length === 0) {
      return NextResponse.json({ error: "No valid files provided" }, { status: 400 })
    }

    await updateCourseCreationJob(jobId, userId, {
      status: "running",
      phase: "starting",
      detail: "Starting upload pipeline…",
    })

    const courseId = await runUploadCourseCreationPipeline(userId, jobId, fileInputs, {
      difficulty,
      toneInstruction,
    })

    return NextResponse.json({ courseId })
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error("course-creation/upload error:", err)
    const message = err instanceof Error ? err.message : "Failed to create course from upload"

    if (jobId && userId) {
      try {
        await updateCourseCreationJob(jobId, userId, {
          status: "failed",
          phase: "error",
          detail: message,
          error: message,
        })
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
