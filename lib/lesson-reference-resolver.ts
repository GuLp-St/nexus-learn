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
    const page = ref.page != null ? ` · page ${ref.page}` : ""
    const extra = ref.label && !ref.label.toLowerCase().includes(ref.fileName.toLowerCase())
      ? ` — ${ref.label}`
      : ""
    return `${base}${page}${extra}`
  }
  return ref.label || "Course material"
}

export function enrichReferenceWithMaterial(
  ref: ParsedReference,
  material?: MaterialReferenceContext
): ParsedReference {
  const url = resolveBlockReferenceUrl(ref, material)
  return url ? { ...ref, url } : ref
}
