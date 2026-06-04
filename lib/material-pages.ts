import type { CourseMaterialAnalysis, LessonDetail } from "./gemini-upload"

/** All unique 1-based PDF page numbers referenced in the analysis (no cap). */
export function collectMaterialPagesFromAnalysis(
  analysis: CourseMaterialAnalysis,
  fileName?: string
): number[] {
  const pages = new Set<number>()

  for (const mod of analysis.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      addLessonPages(pages, lesson, fileName)
    }
  }

  for (const vd of analysis.visualDescriptions ?? []) {
    if (vd.imageIndex >= 1) pages.add(vd.imageIndex)
  }

  return [...pages].filter((p) => p >= 1).sort((a, b) => a - b)
}

function addLessonPages(
  pages: Set<number>,
  lesson: LessonDetail,
  fileName?: string
) {
  if (lesson.sourceFileName && fileName && lesson.sourceFileName !== fileName) {
    return
  }

  for (const p of lesson.materialPages ?? []) {
    if (typeof p === "number" && p >= 1) pages.add(Math.floor(p))
  }

  if (typeof lesson.primaryImageIndex === "number" && lesson.primaryImageIndex >= 1) {
    pages.add(lesson.primaryImageIndex)
  }

  for (const ref of lesson.references ?? []) {
    const m = ref.match(/page\s*(\d+)/i) ?? ref.match(/index\s*(\d+)/i)
    if (m) pages.add(parseInt(m[1], 10))
  }
}

export function uniquePageList(pages: number[]): number[] {
  return [...new Set(pages.filter((p) => p >= 1))].sort((a, b) => a - b)
}
