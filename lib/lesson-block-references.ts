import type { LessonStream, TextBlock } from "./gemini"
import {
  enrichReferenceWithMaterial,
  type MaterialReferenceContext,
} from "./lesson-reference-resolver"

export type ParsedReference = {
  label: string
  url?: string
  fileName?: string
  page?: number
}

/** Parse strings like "notes.pdf p.12", "slides.pptx — page 3", or URLs */
export function parseReferenceString(ref: string): ParsedReference {
  const trimmed = ref.trim()
  if (!trimmed) return { label: "Course material" }

  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i)
  if (urlMatch) {
    return { label: trimmed.replace(urlMatch[0], "").trim() || urlMatch[0], url: urlMatch[0] }
  }

  const pageMatch = trimmed.match(/(?:page|p\.?|pg\.?)\s*(\d+)/i)
  const page = pageMatch ? parseInt(pageMatch[1], 10) : undefined
  const fileMatch = trimmed.match(/([\w.-]+\.(?:pdf|docx|pptx|txt))/i)
  const fileName = fileMatch?.[1]

  if (fileName) {
    return {
      label: trimmed,
      fileName,
      page,
    }
  }

  return { label: trimmed, page }
}

function isWeakReference(
  ref: ParsedReference,
  options?: {
    lessonTitle?: string
    moduleTitle?: string
    courseTitle?: string
    material?: MaterialReferenceContext
  }
): boolean {
  const label = (ref.label || "").trim().toLowerCase()
  if (!label && !ref.fileName && ref.page == null && !ref.url) return true

  const lesson = options?.lessonTitle?.trim().toLowerCase()
  const module = options?.moduleTitle?.trim().toLowerCase()
  const course = options?.courseTitle?.trim().toLowerCase()

  if (lesson && label === lesson) return true
  if (lesson && module && label === `${lesson} · ${module}`) return true
  if (lesson && module && label === `${lesson} — ${module}`) return true
  if (lesson && label.startsWith(`${lesson} —`)) return true
  if (lesson && label.startsWith(`${lesson} ·`)) return true
  if (course && label === course) return true

  if (ref.url && options?.material?.imageMap) {
    const imageUrls = new Set(Object.values(options.material.imageMap))
    if (imageUrls.has(ref.url)) return true
  }

  return false
}

export function ensureTextBlockReferences(
  stream: LessonStream,
  options?: {
    references?: string[]
    courseTitle?: string
    moduleTitle?: string
    lessonTitle?: string
    defaultFileName?: string
    material?: MaterialReferenceContext
  }
): LessonStream {
  const parsedRefs = (options?.references ?? [])
    .map(parseReferenceString)
    .filter((r) => r.label)

  const defaultFileName =
    options?.defaultFileName ?? options?.material?.sourceFiles?.[0]?.name

  const fallback: ParsedReference = parsedRefs[0] ?? {
    label: defaultFileName ?? options?.courseTitle ?? "Course material",
    fileName: defaultFileName,
  }

  let textIndex = 0
  const enrich = (ref: ParsedReference): ParsedReference =>
    enrichReferenceWithMaterial(
      {
        ...ref,
        fileName: ref.fileName ?? defaultFileName,
        url: isWeakReference(ref, options) ? undefined : ref.url,
      },
      options?.material
    )

  const blocks = stream.blocks.map((block) => {
    if (block.type !== "text") return block
    const textBlock = block as TextBlock
    const existing = textBlock.reference
    if (
      existing &&
      (existing.label || existing.url || existing.fileName || existing.page != null) &&
      !isWeakReference(
        {
          label: existing.label || "",
          url: existing.url,
          fileName: existing.fileName,
          page: existing.page,
        },
        options
      )
    ) {
      return {
        ...textBlock,
        reference: enrich({
          label: existing.label || defaultFileName || "Course material",
          url: existing.url,
          fileName: existing.fileName ?? defaultFileName,
          page: existing.page,
        }),
      }
    }
    const ref = enrich(parsedRefs[textIndex % Math.max(parsedRefs.length, 1)] ?? fallback)
    textIndex++
    return { ...textBlock, reference: ref }
  })

  return { ...stream, blocks }
}
