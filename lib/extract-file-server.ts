import { PDFParse } from "pdf-parse"
import mammoth from "mammoth"
import JSZip from "jszip"
import { uniquePageList } from "./material-pages"

export interface ProcessedImage {
  index: number
  base64: string
  /** 1-based PDF page when sourced from a PDF screenshot */
  pageNumber?: number
}

export interface ProcessedFileResult {
  text: string
  images: ProcessedImage[]
  /** Total PDF pages (PDF only) */
  pageCount?: number
}

export async function extractFileOnServer(
  buffer: Buffer,
  fileName: string
): Promise<ProcessedFileResult> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return extractPdfTextOnly(buffer, fileName)
  if (lower.endsWith(".docx")) return extractDocx(buffer)
  if (lower.endsWith(".pptx")) return extractPptx(buffer)
  throw new Error(`Unsupported file type: ${fileName}`)
}

/** Full text from PDF; images are fetched later for AI-selected pages only. */
async function extractPdfTextOnly(
  buffer: Buffer,
  _fileName: string
): Promise<ProcessedFileResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })

  try {
    const textResult = await parser.getText()
    const text = textResult.text?.trim() ?? ""
    const pageCount = textResult.pages?.length ?? 0

    return {
      text,
      images: [],
      pageCount,
    }
  } finally {
    await parser.destroy().catch(() => {})
  }
}

/**
 * Render specific 1-based PDF pages as images (after AI picks page numbers per lesson).
 */
export async function extractPdfPageScreenshots(
  buffer: Buffer,
  pageNumbers: number[]
): Promise<ProcessedImage[]> {
  const pages = uniquePageList(pageNumbers)
  if (pages.length === 0) return []

  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const images: ProcessedImage[] = []

  try {
    const shots = await parser.getScreenshot({
      partial: pages,
      imageDataUrl: true,
      scale: 1.25,
    })

    const rendered = shots.pages ?? []
    for (let i = 0; i < rendered.length; i++) {
      const page = rendered[i]
      const pageNum = pages[i]
      if (!page?.dataUrl || !pageNum) continue
      images.push({
        index: pageNum,
        pageNumber: pageNum,
        base64: page.dataUrl,
      })
    }

    return images
  } finally {
    await parser.destroy().catch(() => {})
  }
}

async function extractDocx(buffer: Buffer): Promise<ProcessedFileResult> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer

  const { value: text } = await mammoth.extractRawText({ arrayBuffer })
  const images: ProcessedImage[] = []
  const zip = await JSZip.loadAsync(buffer)
  const mediaFolder = zip.folder("word/media")

  if (mediaFolder) {
    let imageIndex = 0
    for (const filename of Object.keys(mediaFolder.files)) {
      const entry = mediaFolder.files[filename]
      if (!entry || entry.dir || !/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename)) continue
      const blob = await entry.async("nodebuffer")
      const base64 = `data:image/png;base64,${blob.toString("base64")}`
      images.push({ index: imageIndex++, base64 })
    }
  }

  return { text: text.trim(), images }
}

async function extractPptx(buffer: Buffer): Promise<ProcessedFileResult> {
  const zip = await JSZip.loadAsync(buffer)
  let text = ""

  const slidesFolder = zip.folder("ppt/slides")
  if (slidesFolder) {
    for (const slidePath of Object.keys(slidesFolder.files)) {
      const slideFile = slidesFolder.files[slidePath]
      if (!slideFile || slideFile.dir || !slidePath.endsWith(".xml")) continue
      const xmlContent = await slideFile.async("text")
      const matches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g)
      if (matches) {
        for (const m of matches) {
          const inner = m.replace(/<[^>]+>/g, "")
          if (inner) text += inner + " "
        }
      }
      text += "\n\n"
    }
  }

  const images: ProcessedImage[] = []
  const mediaFolder = zip.folder("ppt/media")
  if (mediaFolder) {
    let imageIndex = 0
    for (const imagePath of Object.keys(mediaFolder.files)) {
      const imageFile = mediaFolder.files[imagePath]
      if (!imageFile || imageFile.dir || !/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(imagePath)) {
        continue
      }
      const blob = await imageFile.async("nodebuffer")
      const ext = imagePath.split(".").pop()?.toLowerCase() || "png"
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "image/png"
      images.push({
        index: imageIndex++,
        base64: `data:${mime};base64,${blob.toString("base64")}`,
      })
    }
  }

  return { text: text.trim(), images }
}
