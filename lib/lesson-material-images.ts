import type { LessonStream, LessonStreamBlock, TextBlock } from "./gemini"

export type LessonMaterialImage = {
  url: string
  description: string
  tags: string[]
  imageIndex: number
  pageNumber?: number
}

function isTextBlock(block: LessonStreamBlock): block is TextBlock {
  return block.type === "text"
}

function blockHasMarkdownImage(content: string): boolean {
  return /!\[[^\]]*\]\([^)]+\)/.test(content)
}

/** All material images for a lesson (by materialPages, tags, or references). */
export function resolveLessonMaterialImages(
  storedLesson: {
    materialPages?: number[]
    primaryImageIndex?: number
    sourceFileName?: string
    keyPoints?: string[]
    references?: string[]
  },
  allImages: LessonMaterialImage[],
  _fallbackIndex: number
): LessonMaterialImage[] {
  if (allImages.length === 0) return []

  const pageSet = new Set(
    (storedLesson.materialPages ?? []).filter((p) => p >= 1)
  )
  if (typeof storedLesson.primaryImageIndex === "number") {
    pageSet.add(storedLesson.primaryImageIndex)
  }

  if (pageSet.size > 0) {
    const byPage = allImages.filter(
      (img) =>
        (img.pageNumber && pageSet.has(img.pageNumber)) ||
        pageSet.has(img.imageIndex)
    )
    if (byPage.length > 0) return byPage.slice(0, 6)
  }

  const refsLower = storedLesson.references?.map((r) => r.toLowerCase()) ?? []
  const keyPointsLower = storedLesson.keyPoints?.map((kp) => kp.toLowerCase()) ?? []

  const matched = allImages.filter((img) => {
    const tagsLower = img.tags.map((t) => t.toLowerCase())
    return (
      refsLower.some(
        (ref) =>
          ref.includes(`page ${img.pageNumber ?? img.imageIndex}`) ||
          ref.includes(`image index ${img.imageIndex}`) ||
          ref.includes(`index ${img.imageIndex}`)
      ) || tagsLower.some((tag) => keyPointsLower.some((kp) => kp.includes(tag)))
    )
  })

  if (matched.length > 0) return matched.slice(0, 6)

  return []
}

/**
 * If Gemini omitted material images, attach up to one per text block (0–1 per block).
 */
export function distributeMaterialImagesToTextBlocks(
  stream: LessonStream,
  images: LessonMaterialImage[]
): LessonStream {
  if (images.length === 0) return stream

  const blocks = [...stream.blocks]
  let imgIdx = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (!isTextBlock(block)) continue
    if (blockHasMarkdownImage(block.content)) continue
    if (imgIdx >= images.length || imgIdx >= 6) break

    const img = images[imgIdx++]
    const desc = img.description?.slice(0, 120) || `Page ${img.pageNumber ?? img.imageIndex}`
    blocks[i] = {
      ...block,
      content: `${block.content.trim()}\n\n![${desc}](${img.url})\n\n`,
      reference: block.reference ?? {
        label: img.pageNumber
          ? `Page ${img.pageNumber}`
          : `Image ${img.imageIndex}`,
        page: img.pageNumber ?? img.imageIndex,
      },
    }
  }

  return { ...stream, blocks }
}
