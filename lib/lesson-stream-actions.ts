"use server"

import { generateLessonStream } from "./gemini"
import type { LessonStream } from "./gemini"
import { enrichLessonStreamWithImages } from "./lesson-image-enrichment"
import {
  distributeMaterialImagesToTextBlocks,
  type LessonMaterialImage,
} from "./lesson-material-images"
import { isCloudflareConfigured } from "./cloudflare-keys"
import { ensureTextBlockReferences } from "./lesson-block-references"

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
    defaultFileName?: string
    sourceFiles?: Array<{ name: string; url: string }>
    imageMap?: Record<number, string>
  }
): Promise<LessonStream> {
  let stream = await generateLessonStream(
    lessonTitle,
    courseTitle,
    moduleTitle,
    sourceContext
  )

  const materialContext = sourceContext?.sourceFiles || sourceContext?.imageMap
    ? { sourceFiles: sourceContext?.sourceFiles, imageMap: sourceContext?.imageMap }
    : undefined

  stream = ensureTextBlockReferences(stream, {
    references: sourceContext?.references,
    courseTitle,
    moduleTitle,
    lessonTitle,
    defaultFileName: sourceContext?.defaultFileName,
    material: materialContext,
  })

  const materialImages = sourceContext?.processedImages ?? []

  if (materialImages.length > 0) {
    stream = distributeMaterialImagesToTextBlocks(stream, materialImages)
    return ensureTextBlockReferences(stream, {
      references: sourceContext?.references,
      courseTitle,
      moduleTitle,
      lessonTitle,
      defaultFileName: sourceContext?.defaultFileName,
      material: materialContext,
    })
  }

  if (await isCloudflareConfigured()) {
    stream = await enrichLessonStreamWithImages(stream, {
      lessonTitle,
      courseTitle,
      moduleTitle,
    })
  }

  return ensureTextBlockReferences(stream, {
    references: sourceContext?.references,
    courseTitle,
    moduleTitle,
    lessonTitle,
    defaultFileName: sourceContext?.defaultFileName,
    material: materialContext,
  })
}
