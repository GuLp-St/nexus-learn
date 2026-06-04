import { NextRequest, NextResponse } from "next/server"
import { extractPdfPageScreenshots } from "@/lib/extract-file-server"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const pagesRaw = formData.get("pages")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 })
    }

    let pageNumbers: number[] = []
    if (typeof pagesRaw === "string") {
      pageNumbers = JSON.parse(pagesRaw) as number[]
    }

    if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
      return NextResponse.json({ images: [] })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const images = await extractPdfPageScreenshots(buffer, pageNumbers)

    return NextResponse.json({ images })
  } catch (err: unknown) {
    console.error("extract-pdf-pages error:", err)
    const message = err instanceof Error ? err.message : "Failed to extract pages"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
