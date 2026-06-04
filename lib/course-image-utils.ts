import type { CourseMaterialAnalysis, ModuleDetail } from "./gemini-upload"
import type { LessonMaterialImage } from "./lesson-material-images"

/** Which material image indices are referenced by the outline (client-safe, no "use server"). */
export function collectReferencedImageIndices(
  modules: ModuleDetail[],
  visualDescriptions: Array<{ imageIndex: number }> = []
): Set<number> {
  const used = new Set<number>()

  for (const vd of visualDescriptions) {
    used.add(vd.imageIndex)
  }

  const refPattern = /image\s*index\s*(\d+)/gi
  const pagePattern = /page\s*(\d+)/gi

  for (const mod of modules) {
    for (const les of mod.lessons ?? []) {
      for (const p of les.materialPages ?? []) {
        if (p >= 1) used.add(p)
      }
      if (typeof les.primaryImageIndex === "number" && les.primaryImageIndex >= 1) {
        used.add(les.primaryImageIndex)
      }
      for (const ref of les.references ?? []) {
        let match: RegExpExecArray | null
        const r = ref.toLowerCase()
        refPattern.lastIndex = 0
        while ((match = refPattern.exec(r)) !== null) {
          used.add(parseInt(match[1], 10))
        }
        pagePattern.lastIndex = 0
        while ((match = pagePattern.exec(r)) !== null) {
          used.add(parseInt(match[1], 10))
        }
      }
    }
  }

  return used
}

/** Build processedImages for Firestore from outline + uploaded page URLs. */
export function buildProcessedImagesForMaterial(
  analysis: CourseMaterialAnalysis,
  imageMap: Record<number, string>
): LessonMaterialImage[] {
  const byIndex = new Map<number, LessonMaterialImage>()

  for (const vd of analysis.visualDescriptions ?? []) {
    const url = imageMap[vd.imageIndex]
    if (!url) continue
    byIndex.set(vd.imageIndex, {
      url,
      description: vd.description,
      tags: vd.tags ?? [],
      imageIndex: vd.imageIndex,
      pageNumber: vd.imageIndex,
    })
  }

  for (const mod of analysis.modules ?? []) {
    for (const les of mod.lessons ?? []) {
      for (const page of les.materialPages ?? []) {
        if (page < 1 || byIndex.has(page)) continue
        const url = imageMap[page]
        if (!url) continue
        byIndex.set(page, {
          url,
          description: `PDF page ${page}`,
          tags: ["pdf", "material"],
          imageIndex: page,
          pageNumber: page,
        })
      }
    }
  }

  return [...byIndex.values()].sort((a, b) => a.imageIndex - b.imageIndex)
}
