import type { LessonStream, TextBlock, LessonStreamBlock } from "./gemini"
import { generateAIImage, mapParallelCloudflareImages } from "./cloudflare-ai-utils"
import { uploadGeneratedImage } from "./upload-actions"

const MAX_AI_IMAGES_PER_LESSON = 3

function buildImagePrompt(
  illustrationPrompt: string,
  lessonTitle: string,
  courseTitle: string
): string {
  return `Educational illustration for an online course. Course: "${courseTitle}". Lesson: "${lessonTitle}". Scene: ${illustrationPrompt}. Style: clean, modern, professional, clear labels, no watermark, suitable for students.`
}

function isTextBlock(block: LessonStreamBlock): block is TextBlock {
  return block.type === "text"
}

/**
 * After Gemini builds the lesson JSON, generate Cloudflare images for blocks
 * that include illustrationPrompt and inject markdown images into content.
 */
export async function enrichLessonStreamWithImages(
  stream: LessonStream,
  meta: { lessonTitle: string; courseTitle: string; moduleTitle: string }
): Promise<LessonStream> {
  const targets: { blockIndex: number; prompt: string }[] = []

  stream.blocks.forEach((block, blockIndex) => {
    if (!isTextBlock(block)) return
    const prompt = block.illustrationPrompt?.trim()
    if (!prompt) return
    if (targets.length >= MAX_AI_IMAGES_PER_LESSON) return
    targets.push({ blockIndex, prompt })
  })

  if (targets.length === 0) {
    return stripIllustrationPrompts(stream)
  }

  const uploads = await mapParallelCloudflareImages(
    targets,
    async (target, tokenIndex, i) => {
      const fullPrompt = buildImagePrompt(
        target.prompt,
        meta.lessonTitle,
        meta.courseTitle
      )
      const blob = await generateAIImage(fullPrompt, undefined, tokenIndex)
      if (!blob) return { blockIndex: target.blockIndex, url: null as string | null }

      const fileName = `lesson-${Date.now()}-${i}.png`
      const uploaded = await uploadGeneratedImage(blob, fileName)
      return { blockIndex: target.blockIndex, url: uploaded.ufsUrl }
    },
    2
  )

  const enrichedBlocks = [...stream.blocks]

  for (const { blockIndex, url } of uploads) {
    if (!url) continue
    const block = enrichedBlocks[blockIndex]
    if (!isTextBlock(block)) continue

    const desc =
      block.illustrationPrompt?.slice(0, 80) ?? "Lesson illustration"
    const imageMd = `\n\n![${desc}](${url})\n\n`
    enrichedBlocks[blockIndex] = {
      type: "text",
      content: block.content.trim() + imageMd,
    }
  }

  return stripIllustrationPrompts({
    ...stream,
    blocks: enrichedBlocks,
  })
}

function stripIllustrationPrompts(stream: LessonStream): LessonStream {
  return {
    ...stream,
    blocks: stream.blocks.map((block) => {
      if (!isTextBlock(block)) return block
      const { illustrationPrompt: _, ...rest } = block
      return rest as TextBlock
    }),
  }
}
