import type { ParsedReference } from "./lesson-block-references"

export type MaterialReferenceContext = {
  sourceFiles?: Array<{ name: string; url: string }>
  imageMap?: Record<number, string>
}

function findSourceFile(
  fileName: string,
  sourceFiles?: Array<{ name: string; url: string }>
): { name: string; url: string } | undefined {
  if (!sourceFiles?.length) return undefined
  const lower = fileName.toLowerCase()
  return sourceFiles.find(
    (f) =>
      f.name.toLowerCase() === lower ||
      f.name.toLowerCase().endsWith(lower) ||
      lower.endsWith(f.name.toLowerCase())
  )
}

export function resolveBlockReferenceUrl(
  ref: ParsedReference,
  material?: MaterialReferenceContext
): string | undefined {
  if (ref.url) return ref.url

  if (ref.page != null && material?.imageMap?.[ref.page]) {
    return material.imageMap[ref.page]
  }

  if (ref.fileName) {
    const file = findSourceFile(ref.fileName, material?.sourceFiles)
    if (file) {
      if (ref.page != null && file.name.toLowerCase().endsWith(".pdf")) {
        return `${file.url}#page=${ref.page}`
      }
      return file.url
    }
  }

  if (material?.sourceFiles?.[0]?.url) {
    const fallback = material.sourceFiles[0]
    if (ref.page != null && fallback.name.toLowerCase().endsWith(".pdf")) {
      return `${fallback.url}#page=${ref.page}`
    }
    return fallback.url
  }

  return undefined
}

export function formatReferenceLabel(ref: ParsedReference): string {
  if (ref.fileName) {
    const base = ref.fileName
    const page = ref.page != null ? `, page ${ref.page}` : ""
    return `${base}${page}`
  }
  return ref.label || "Course material"
}

/** APA-style citation text for AI-generated sources (no hyperlinks). */
export function formatApaCitation(ref: ParsedReference): string {
  const label = (ref.label || "Course material").trim()
  if (!label) return "Course material. (n.d.)."

  const yearMatch = label.match(/\((\d{4})\)/)
  const year = yearMatch?.[1] ?? "n.d."

  let title = label
    .replace(/\(\d{4}\)/, "")
    .replace(/^[\w\s,.-]+\.\s*/, "")
    .trim()
  if (!title) title = label

  const authorGuess = label.split(/[.,(]/)[0]?.trim() || "Unknown author"
  const hasAuthorInLabel = /^[A-Z][a-z]+,?\s+[A-Z]/.test(label) || label.includes(" et al")

  const author = hasAuthorInLabel ? authorGuess : title.split(":")[0]?.trim() || authorGuess
  const citationTitle = hasAuthorInLabel
    ? title || label
    : title.includes(":")
      ? title
      : title

  return `${author}. (${year}). ${citationTitle}.`
}

export function formatBlockCitation(
  ref: ParsedReference,
  isUploadCourse: boolean
): string {
  if (isUploadCourse || ref.fileName) {
    return formatReferenceLabel(ref)
  }
  return formatApaCitation(ref)
}

export function enrichReferenceWithMaterial(
  ref: ParsedReference,
  material?: MaterialReferenceContext
): ParsedReference {
  const url = resolveBlockReferenceUrl(ref, material)
  return url ? { ...ref, url } : ref
}
