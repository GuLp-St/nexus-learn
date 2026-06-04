import type { VisualDescription } from "./gemini-upload"

/**
 * Pick the best cover image from uploaded course materials (no AI generation).
 */
export function pickMaterialCoverImage(
  imageMap: Record<number, string>,
  visualDescriptions: VisualDescription[] = []
): string | null {
  for (const visual of visualDescriptions) {
    const url = imageMap[visual.imageIndex]
    if (url) return url
  }

  const urls = Object.values(imageMap)
  return urls.length > 0 ? urls[0] : null
}
