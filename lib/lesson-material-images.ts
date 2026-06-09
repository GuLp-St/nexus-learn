import type { LessonStream, LessonStreamBlock, TextBlock } from "./gemini"

export type LessonMaterialImage = {
  url: string
  description: string
  tags: string[]
  imageIndex: number
  pageNumber?: number
}

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]*)\)/g

function isTextBlock(block: LessonStreamBlock): block is TextBlock {
  return block.type === "text"
}

function collectValidImageUrls(images: LessonMaterialImage[]): Set<string> {
  return new Set(images.map((img) => img.url).filter(Boolean))
}

function blockHasValidMarkdownImage(content: string, validUrls: Set<string>): boolean {
  if (validUrls.size === 0) return false
  for (const match of content.matchAll(MARKDOWN_IMAGE_RE)) {
    const url = match[2]?.trim()
    if (url && validUrls.has(url)) return true
  }
  return false
}

/** Remove or fix markdown images whose URLs are missing, truncated, or hallucinated by the model. */
export function sanitizeMaterialImageMarkdown(
  content: string,
  validImages: LessonMaterialImage[]
): string {
  const validUrls = collectValidImageUrls(validImages)
  if (validUrls.size === 0) {
    return content.replace(MARKDOWN_IMAGE_RE, "").replace(/\n{3,}/g, "\n\n").trim()
  }

  const urlByIndex = new Map(validImages.map((img) => [img.imageIndex, img.url]))

  return content
    .replace(MARKDOWN_IMAGE_RE, (match, alt: string, url: string) => {
      const trimmedUrl = url.trim()
      if (trimmedUrl && validUrls.has(trimmedUrl)) return match

      const indexMatch = alt.match(/(?:image\s*)?index\s*(\d+)|page\s*(\d+)/i)
      const idx = indexMatch
        ? parseInt(indexMatch[1] ?? indexMatch[2], 10)
        : undefined
      if (idx != null && !Number.isNaN(idx) && urlByIndex.has(idx)) {
        return `![${alt}](${urlByIndex.get(idx)})`
      }

      if (trimmedUrl) {
        const partial = validImages.find(
          (img) => trimmedUrl.includes(img.url) || img.url.includes(trimmedUrl)
        )
        if (partial) return `![${alt}](${partial.url})`
      }

      return ""
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function sanitizeLessonStreamMaterialImages(
  stream: LessonStream,
  validImages: LessonMaterialImage[]
): LessonStream {
  return {
    ...stream,
    blocks: stream.blocks.map((block) => {
      if (!isTextBlock(block)) return block
      return {
        ...block,
        content: sanitizeMaterialImageMarkdown(block.content, validImages),
      }
    }),
  }
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
  const indexSet = new Set<number>()
  if (typeof storedLesson.primaryImageIndex === "number" && storedLesson.primaryImageIndex >= 0) {
    indexSet.add(storedLesson.primaryImageIndex)
  }

  const refsLower = storedLesson.references?.map((r) => r.toLowerCase()) ?? []
  const keyPointsLower = storedLesson.keyPoints?.map((kp) => kp.toLowerCase()) ?? []

  for (const ref of refsLower) {
    const idxMatch = ref.match(/image\s*index\s*(\d+)/i)
    if (idxMatch) indexSet.add(parseInt(idxMatch[1], 10))
    const pageMatch = ref.match(/(?:pdf\s*)?page\s*(\d+)/i)
    if (pageMatch) pageSet.add(parseInt(pageMatch[1], 10))
  }

  if (pageSet.size > 0 || indexSet.size > 0) {
    const byPageOrIndex = allImages.filter(
      (img) =>
        indexSet.has(img.imageIndex) ||
        (img.pageNumber != null && img.pageNumber >= 1 && pageSet.has(img.pageNumber)) ||
        pageSet.has(img.imageIndex)
    )
    if (byPageOrIndex.length > 0) return byPageOrIndex.slice(0, 6)
  }

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

  const validUrls = collectValidImageUrls(images)
  const blocks = [...stream.blocks]
  let imgIdx = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (!isTextBlock(block)) continue
    if (blockHasValidMarkdownImage(block.content, validUrls)) continue
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
