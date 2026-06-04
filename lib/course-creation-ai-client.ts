/**
 * Client-side AI topic → course pipeline.
 */

import {
  analyzeTopicDifficulty,
  generateCourseSkeleton,
  type DifficultyOption,
  type TopicDifficultyAnalysis,
} from "@/lib/gemini"
import { createCourseAndConsumeCredit } from "@/lib/create-course-with-credit"
import { generateAndUploadImage } from "@/lib/upload-actions"
import { DEFAULT_COURSE_IMAGE_URL } from "@/lib/image-constants"

export type AiProgressPhase = "analyzing" | "generating-skeleton" | "cover-image" | "creating-course"

export type AiProgress = {
  phase: AiProgressPhase
  detail: string
}

export async function runAiCourseCreation(
  userId: string,
  topic: string,
  options: {
    difficulty?: DifficultyOption | null
    difficultyAnalysis?: TopicDifficultyAnalysis | null
    onProgress?: (progress: AiProgress) => void
  }
): Promise<string> {
  const { onProgress } = options
  const report = (phase: AiProgressPhase, detail: string) => {
    onProgress?.({ phase, detail })
  }

  let difficulty = options.difficulty
  let analysis = options.difficultyAnalysis

  if (!analysis) {
    report("analyzing", "Analyzing your topic…")
    analysis = await analyzeTopicDifficulty(topic.trim())
    if (analysis.errorMessage) {
      throw new Error(analysis.errorMessage)
    }
  }

  if (!difficulty && analysis && !analysis.hasVariableDifficulty) {
    difficulty = {
      level: analysis.difficulty || "beginner",
      title: analysis.title || topic,
      modules: analysis.modules || 3,
      lessonsPerModule: analysis.lessonsPerModule || [2, 3, 2],
      xpMultiplier: analysis.xpMultiplier || 1,
    }
  }

  if (!difficulty) {
    throw new Error("Please select a difficulty level")
  }

  report("generating-skeleton", "Building your course structure…")
  const courseData = await generateCourseSkeleton(
    topic.trim(),
    difficulty.level,
    difficulty.modules,
    difficulty.lessonsPerModule
  )

  report("cover-image", "Generating cover image…")
  const prompt = `Professional educational course cover for "${courseData.title}". Topics: ${courseData.tags?.join(", ")}. Style: modern, clean digital art. Landscape 16:9, centered subject.`
  const imageResult = await generateAndUploadImage(prompt)
  if (imageResult) {
    courseData.imageUrl = imageResult.ufsUrl
    courseData.imageKey = imageResult.key
  } else {
    courseData.imageUrl = DEFAULT_COURSE_IMAGE_URL
  }

  report("creating-course", "Creating your journey…")
  return createCourseAndConsumeCredit(userId, courseData, "ai")
}
