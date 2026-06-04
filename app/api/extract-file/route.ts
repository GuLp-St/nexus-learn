import { NextRequest, NextResponse } from "next/server"
import { extractFileOnServer } from "@/lib/extract-file-server"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await extractFileOnServer(buffer, file.name)

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error("extract-file error:", err)
    const message = err instanceof Error ? err.message : "Failed to extract file"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
