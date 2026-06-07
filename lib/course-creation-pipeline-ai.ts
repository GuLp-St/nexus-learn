import {
  analyzeTopicDifficulty,
  generateCourseSkeleton,
  type DifficultyOption,
  type TopicDifficultyAnalysis,
} from "@/lib/gemini"
import { generateAndUploadImage } from "@/lib/upload-actions"
import { DEFAULT_COURSE_IMAGE_URL } from "@/lib/image-constants"
import { createCourseAndConsumeCredit } from "@/lib/create-course-with-credit"
import { updateCourseCreationJob } from "@/lib/course-creation-job-server"
import { createServerNotification } from "@/lib/notification-server"

export async function runAiCourseCreationPipeline(
  userId: string,
  jobId: string,
  topic: string,
  options: {
    difficulty?: DifficultyOption | null
    difficultyAnalysis?: TopicDifficultyAnalysis | null
  }
): Promise<string> {
  const report = async (phase: string, detail: string) => {
    await updateCourseCreationJob(jobId, userId, {
      status: "running",
      phase,
      detail,
    })
  }

  let difficulty = options.difficulty
  let analysis = options.difficultyAnalysis

  if (!analysis) {
    await report("analyzing", "Analyzing your topic…")
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

  await report("generating-skeleton", "Building your course structure…")
  const courseData = await generateCourseSkeleton(
    topic.trim(),
    difficulty.level,
    difficulty.modules,
    difficulty.lessonsPerModule
  )

  await report("cover-image", "Generating cover image…")
  const prompt = `Professional educational course cover for "${courseData.title}". Topics: ${courseData.tags?.join(", ")}. Style: modern, clean digital art. Landscape 16:9, centered subject.`
  const imageResult = await generateAndUploadImage(prompt)
  if (imageResult) {
    courseData.imageUrl = imageResult.ufsUrl
    courseData.imageKey = imageResult.key
  } else {
    courseData.imageUrl = DEFAULT_COURSE_IMAGE_URL
  }

  await report("creating-course", "Creating your journey…")
  const courseId = await createCourseAndConsumeCredit(userId, courseData, "ai")

  await updateCourseCreationJob(jobId, userId, {
    status: "completed",
    phase: "done",
    detail: "Your journey is ready!",
    courseId,
  })

  try {
    await createServerNotification(userId, "course_ready", {
      courseId,
      courseTitle: courseData.title,
      jobType: "ai",
    })
  } catch (err) {
    console.error("Failed to send course ready notification:", err)
  }

  try {
    const { pregenerateFirstLessonForCourse } = await import("./pregenerate-lesson-server")
    void pregenerateFirstLessonForCourse(userId, courseId).catch((err) =>
      console.error("First lesson pregenerate failed:", err)
    )
  } catch (err) {
    console.error("Failed to start first lesson pregenerate:", err)
  }

  return courseId
}
