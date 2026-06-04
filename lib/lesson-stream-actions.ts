"use server"

import { generateLessonStream } from "./gemini"
import type { LessonStream } from "./gemini"
import { enrichLessonStreamWithImages } from "./lesson-image-enrichment"
import {
  distributeMaterialImagesToTextBlocks,
  type LessonMaterialImage,
} from "./lesson-material-images"
import { isCloudflareConfigured } from "./cloudflare-keys"

export async function generateLessonStreamWithImages(
  lessonTitle: string,
  courseTitle: string,
  moduleTitle: string,
  sourceContext?: {
    sourceMaterialId?: string
    keyPoints: string[]
    references: string[]
    lessonSummary?: string
    moduleSummary?: string
    processedImages?: LessonMaterialImage[]
  }
): Promise<LessonStream> {
  let stream = await generateLessonStream(
    lessonTitle,
    courseTitle,
    moduleTitle,
    sourceContext
  )

  const materialImages = sourceContext?.processedImages ?? []

  if (materialImages.length > 0) {
    stream = distributeMaterialImagesToTextBlocks(stream, materialImages)
    return stream
  }

  if (await isCloudflareConfigured()) {
    return enrichLessonStreamWithImages(stream, {
      lessonTitle,
      courseTitle,
      moduleTitle,
    })
  }

  return stream
}
