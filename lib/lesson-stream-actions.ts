"use server"

import { generateLessonStream } from "./gemini"
import type { LessonStream } from "./gemini"
import { enrichLessonStreamWithImages } from "./lesson-image-enrichment"
import { isCloudflareConfigured } from "./cloudflare-keys"

export async function generateLessonStreamWithImages(
  lessonTitle: string,
  courseTitle: string,
  moduleTitle: string,
  sourceContext?: {
    keyPoints: string[]
    references: string[]
    processedImages?: Array<{
      url: string
      description: string
      tags: string[]
      imageIndex: number
    }>
  }
): Promise<LessonStream> {
  const stream = await generateLessonStream(
    lessonTitle,
    courseTitle,
    moduleTitle,
    sourceContext
  )

  if (await isCloudflareConfigured()) {
    return enrichLessonStreamWithImages(stream, {
      lessonTitle,
      courseTitle,
      moduleTitle,
    })
  }

  return stream
}
