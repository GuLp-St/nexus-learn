import { extractFileOnServer, extractPdfPageScreenshots } from "@/lib/extract-file-server"
import { collectMaterialPagesFromAnalysis } from "@/lib/material-pages"
import { analyzeCourseFromFiles, type FileProcessedData } from "@/lib/gemini-upload"
import { generateCourseSkeleton } from "@/lib/gemini"
import { uploadCourseMaterialImagesBatch } from "@/lib/upload-actions"
import { DEFAULT_COURSE_IMAGE_URL } from "@/lib/image-constants"
import {
  buildProcessedImagesForMaterial,
  collectReferencedImageIndices,
} from "@/lib/course-image-utils"
import { omitUndefinedDeep } from "@/lib/firestore-sanitize"
import { pruneUnusedMaterialImages } from "@/lib/course-image-cleanup"
import {
  applyDifficultyToAnalysis,
  type CourseDifficulty,
  DIFFICULTY_STRUCTURE,
} from "@/lib/difficulty-structure"
import { pickMaterialCoverImage } from "@/lib/course-material-images"
import { createCourseAndConsumeCredit } from "@/lib/create-course-with-credit"
import { updateCourseCreationJob } from "@/lib/course-creation-job-server"
import { createCourseMaterial } from "@/lib/course-material-server"

const IMAGE_BATCH_SIZE = 4

export type JobReporter = (phase: string, detail: string) => Promise<void>

export async function runUploadCourseCreationPipeline(
  userId: string,
  jobId: string,
  fileInputs: Array<{ name: string; buffer: Buffer }>,
  options: {
    difficulty: CourseDifficulty
    toneInstruction?: string
  }
): Promise<string> {
  const { difficulty, toneInstruction = "" } = options
  const report = async (phase: string, detail: string) => {
    await updateCourseCreationJob(jobId, userId, {
      status: "running",
      phase,
      detail,
    })
  }

  if (fileInputs.length === 0) {
    throw new Error("Please select at least one file")
  }

  const fileData: FileProcessedData[] = []
  const pdfBuffers = new Map<string, Buffer>()
  let globalImageIndex = 0

  for (let i = 0; i < fileInputs.length; i++) {
    const { name, buffer } = fileInputs[i]
    await report("extracting", `Reading ${name}… (${i + 1}/${fileInputs.length})`)
    if (name.toLowerCase().endsWith(".pdf")) {
      pdfBuffers.set(name, buffer)
    }
    const result = await extractFileOnServer(buffer, name)
    const imagesWithGlobalIndex = result.images.map((img) => ({
      ...img,
      index: globalImageIndex++,
    }))
    fileData.push({
      fileName: name,
      text: result.text,
      images: imagesWithGlobalIndex,
    })
  }

  const allImages: Array<{ index: number; base64: string }> = []
  fileData.forEach((f) => f.images.forEach((img) => allImages.push(img)))

  const imageMapLocal: Record<number, string> = {}
  const imageKeysLocal: Record<number, string> = {}
  const materialImages: { ufsUrl: string; key: string; index: number }[] = []

  if (allImages.length > 0) {
    await report("uploading-images", `Uploading ${allImages.length} images…`)
    for (let i = 0; i < allImages.length; i += IMAGE_BATCH_SIZE) {
      const batch = allImages.slice(i, i + IMAGE_BATCH_SIZE)
      await report(
        "uploading-images",
        `Uploading images ${i + 1}–${Math.min(i + IMAGE_BATCH_SIZE, allImages.length)} of ${allImages.length}…`
      )
      const batchResults = await uploadCourseMaterialImagesBatch(batch.map((img) => img.base64))
      batchResults.forEach((uploaded, batchIdx) => {
        const originalIndex = batch[batchIdx].index
        materialImages.push({ ...uploaded, index: originalIndex })
        imageMapLocal[originalIndex] = uploaded.ufsUrl
        imageKeysLocal[originalIndex] = uploaded.key
      })
    }
  }

  await report("analyzing", "Analyzing your materials with AI…")
  const rawAnalysis = await analyzeCourseFromFiles(
    fileData,
    async (processed, total) => {
      await report("analyzing", `Analyzing file ${processed} of ${total}…`)
    },
    { toneInstruction, difficulty, includeFullText: true }
  )

  const analysis = applyDifficultyToAnalysis(rawAnalysis, difficulty)

  for (const { name } of fileInputs) {
    if (!name.toLowerCase().endsWith(".pdf")) continue
    const buffer = pdfBuffers.get(name)
    if (!buffer) continue

    const pages = collectMaterialPagesFromAnalysis(analysis, name)
    if (pages.length === 0) continue

    await report("pdf-pages", `Rendering pages from ${name}…`)
    try {
      const pageImages = await extractPdfPageScreenshots(buffer, pages)
      for (const img of pageImages) {
        try {
          const batchResults = await uploadCourseMaterialImagesBatch([img.base64])
          if (batchResults[0]) {
            const pageNum = img.pageNumber ?? img.index
            materialImages.push({ ...batchResults[0], index: pageNum })
            imageMapLocal[pageNum] = batchResults[0].ufsUrl
            imageKeysLocal[pageNum] = batchResults[0].key
            const existing = analysis.visualDescriptions?.find((v) => v.imageIndex === pageNum)
            if (!existing) {
              analysis.visualDescriptions = [
                ...(analysis.visualDescriptions ?? []),
                {
                  imageIndex: pageNum,
                  description: `PDF page ${pageNum} from ${name}`,
                  tags: ["pdf", "slide", "material"],
                },
              ]
            }
          }
        } catch (err) {
          console.error("Page image upload failed:", err)
        }
      }
    } catch (err) {
      console.warn(`${name}: page render failed`, err)
    }
  }

  const combinedText = fileData.map((f) => f.text).join("\n\n")
  if (!combinedText.trim()) {
    throw new Error("No text could be extracted from your files. Try different files.")
  }

  const courseTitle =
    analysis.modules?.[0]?.title ||
    analysis.suggestedModules?.[0] ||
    fileInputs[0]?.name.replace(/\.[^.]+$/, "") ||
    "My Course"

  const coverImageUrl =
    pickMaterialCoverImage(imageMapLocal, analysis.visualDescriptions) ||
    DEFAULT_COURSE_IMAGE_URL

  await report("saving-material", "Saving material library…")
  const processedImages = buildProcessedImagesForMaterial(analysis, imageMapLocal)
  const materialId = await createCourseMaterial(userId, {
    summary: analysis.summary,
    visualDescriptions: analysis.visualDescriptions,
    suggestedModules: analysis.suggestedModules,
    modules: analysis.modules || [],
    toneInstruction,
    difficulty,
    extractedText: combinedText.trim(),
    imageCount: allImages.length,
    imageUrls: materialImages.map((img) => img.ufsUrl),
    imageKeys: materialImages.map((img) => img.key),
    imageMap: imageMapLocal,
    imageKeysByIndex: imageKeysLocal,
    courseTitle,
    processedImages,
  })
  const modules = analysis.modules ?? []
  const usedIndices = collectReferencedImageIndices(modules, analysis.visualDescriptions)
  for (const img of processedImages) {
    usedIndices.add(img.imageIndex)
  }
  try {
    await pruneUnusedMaterialImages(imageKeysLocal, [...usedIndices])
  } catch (pruneErr) {
    console.warn("Image cleanup skipped:", pruneErr)
  }

  const preset = DIFFICULTY_STRUCTURE[difficulty]
  const topic = courseTitle || analysis.summary.slice(0, 120) || fileInputs[0]?.name || "Uploaded course"

  await report("generating-skeleton", "Building your course structure…")
  const courseData = await generateCourseSkeleton(
    topic,
    difficulty,
    preset.modules,
    preset.lessonsPerModule,
    materialId
  )

  courseData.imageUrl = coverImageUrl
  courseData.imageConfig = {
    fit: "cover",
    position: { x: 50, y: 50 },
    scale: 1,
  }

  await report("creating-course", "Creating your journey…")
  const courseId = await createCourseAndConsumeCredit(
    userId,
    courseData,
    "upload",
    materialId
  )

  await updateCourseCreationJob(jobId, userId, {
    status: "completed",
    phase: "done",
    detail: "Your journey is ready!",
    courseId,
  })

  return courseId
}
