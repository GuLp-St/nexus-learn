import "@/lib/pdf-server-polyfills"
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



type RemoteFileRef = { name: string; url: string; key?: string }



function isValidCourseFileName(name: string): boolean {

  const lower = name.toLowerCase()

  return lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".pptx")

}



async function downloadRemoteFile(ref: RemoteFileRef): Promise<{ name: string; buffer: Buffer }> {

  const res = await fetch(ref.url)

  if (!res.ok) {

    throw new Error(`Failed to download ${ref.name}`)

  }

  const buffer = Buffer.from(await res.arrayBuffer())

  if (buffer.byteLength > MAX_BYTES) {

    throw new Error(`${ref.name} exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)

  }

  return { name: ref.name, buffer }

}



async function parseFileInputs(request: NextRequest): Promise<{

  userId: string

  jobId: string

  difficulty: CourseDifficulty

  toneInstruction: string

  fileInputs: Array<{ name: string; buffer: Buffer }>

}> {

  const contentType = request.headers.get("content-type") || ""



  if (contentType.includes("application/json")) {

    const body = await request.json()

    const userId = body.userId as string | undefined

    const jobId = body.jobId as string | undefined

    const difficulty = (body.difficulty as CourseDifficulty) || "intermediate"

    const toneInstruction = (body.toneInstruction as string) || ""

    const remoteFiles = (body.files as RemoteFileRef[] | undefined) ?? []



    if (!userId || !jobId) {

      throw new AuthError("Missing userId or jobId", 400)

    }



    const fileInputs: Array<{ name: string; buffer: Buffer }> = []

    for (const ref of remoteFiles.slice(0, MAX_FILES)) {

      if (!ref?.name || !ref?.url || !isValidCourseFileName(ref.name)) continue

      fileInputs.push(await downloadRemoteFile(ref))

    }



    return { userId, jobId, difficulty, toneInstruction, fileInputs }

  }



  const formData = await request.formData()

  const userId = formData.get("userId") as string | undefined

  const jobId = formData.get("jobId") as string | undefined

  const difficulty = (formData.get("difficulty") as CourseDifficulty) || "intermediate"

  const toneInstruction = (formData.get("toneInstruction") as string) || ""



  if (!userId || !jobId) {

    throw new AuthError("Missing userId or jobId", 400)

  }



  const fileInputs: Array<{ name: string; buffer: Buffer }> = []

  const entries = formData.getAll("files")

  for (const entry of entries) {

    if (!(entry instanceof File)) continue

    if (fileInputs.length >= MAX_FILES) break

    if (!isValidCourseFileName(entry.name)) continue

    if (entry.size > MAX_BYTES) {

      throw new Error(`${entry.name} exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)

    }

    fileInputs.push({

      name: entry.name,

      buffer: Buffer.from(await entry.arrayBuffer()),

    })

  }



  return { userId, jobId, difficulty, toneInstruction, fileInputs }

}



export async function POST(request: NextRequest) {

  let jobId: string | undefined

  let userId: string | undefined



  try {

    const verifiedUid = await verifyRequestUserId(request)

    const parsed = await parseFileInputs(request)

    userId = assertMatchingUserId(verifiedUid, parsed.userId)

    jobId = parsed.jobId



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



    if (parsed.fileInputs.length === 0) {

      return NextResponse.json({ error: "No valid files provided" }, { status: 400 })

    }



    await updateCourseCreationJob(jobId, userId, {

      status: "running",

      phase: "starting",

      detail: "Starting upload pipeline…",

    })



    const courseId = await runUploadCourseCreationPipeline(userId, jobId, parsed.fileInputs, {

      difficulty: parsed.difficulty,

      toneInstruction: parsed.toneInstruction,

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


