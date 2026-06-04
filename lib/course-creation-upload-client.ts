/**
 * Client-side upload → material → course pipeline (no outline review step).
 */

import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore"
import { processFile } from "@/lib/file-processor"
import { collectMaterialPagesFromAnalysis } from "@/lib/material-pages"
import { analyzeCourseFromFiles, type FileProcessedData } from "@/lib/gemini-upload"
import { generateCourseSkeleton } from "@/lib/gemini"
import { createCourseAndConsumeCredit } from "@/lib/create-course-with-credit"
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
import { db } from "@/lib/firebase"

export type UploadProgressPhase =
  | "extracting"
  | "uploading-images"
  | "analyzing"
  | "pdf-pages"
  | "saving-material"
  | "generating-skeleton"
  | "creating-course"

export type UploadProgress = {
  phase: UploadProgressPhase
  detail: string
  fileIndex?: number
  fileTotal?: number
}

const IMAGE_BATCH_SIZE = 4

export async function runUploadCourseCreation(
  userId: string,
  files: File[],
  options: {
    difficulty: CourseDifficulty
    toneInstruction?: string
    onProgress?: (progress: UploadProgress) => void
  }
): Promise<string> {
  const { difficulty, toneInstruction = "", onProgress } = options
  const report = (phase: UploadProgressPhase, detail: string, extra?: Partial<UploadProgress>) => {
    onProgress?.({ phase, detail, ...extra })
  }

  if (files.length === 0) {
    throw new Error("Please select at least one file")
  }

  const fileData: FileProcessedData[] = []
  let globalImageIndex = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    report("extracting", `Reading ${file.name}…`, { fileIndex: i + 1, fileTotal: files.length })
    const result = await processFile(file, {
      onProgress: (msg) => report("extracting", msg, { fileIndex: i + 1, fileTotal: files.length }),
    })
    const imagesWithGlobalIndex = result.images.map((img) => ({
      ...img,
      index: globalImageIndex++,
    }))
    fileData.push({
      fileName: file.name,
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
    report("uploading-images", `Uploading ${allImages.length} images…`)
    for (let i = 0; i < allImages.length; i += IMAGE_BATCH_SIZE) {
      const batch = allImages.slice(i, i + IMAGE_BATCH_SIZE)
      report(
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

  report("analyzing", "Analyzing your materials with AI…")
  const rawAnalysis = await analyzeCourseFromFiles(
    fileData,
    (processed, total) =>
      report("analyzing", `Analyzing file ${processed} of ${total}…`, {
        fileIndex: processed,
        fileTotal: total,
      }),
    { toneInstruction, difficulty, includeFullText: true }
  )

  const analysis = applyDifficultyToAnalysis(rawAnalysis, difficulty)

  const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"))
  for (const pdfFile of pdfFiles) {
    const pages = collectMaterialPagesFromAnalysis(analysis, pdfFile.name)
    if (pages.length === 0) continue

    report("pdf-pages", `Rendering pages from ${pdfFile.name}…`)
    const formData = new FormData()
    formData.append("file", pdfFile)
    formData.append("pages", JSON.stringify(pages))
    const pageRes = await fetch("/api/extract-pdf-pages", { method: "POST", body: formData })
    const pagePayload = await pageRes.json().catch(() => ({}))
    if (!pageRes.ok) {
      console.warn(`${pdfFile.name}: ${pagePayload.error || "Failed to render pages"}`)
      continue
    }

    const pageImages: Array<{ index: number; base64: string; pageNumber?: number }> =
      pagePayload.images ?? []

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
                description: `PDF page ${pageNum} from ${pdfFile.name}`,
                tags: ["pdf", "slide", "material"],
              },
            ]
          }
        }
      } catch (err) {
        console.error("Page image upload failed:", err)
      }
    }
  }

  const combinedText = fileData.map((f) => f.text).join("\n\n")
  if (!combinedText.trim()) {
    throw new Error("No text could be extracted from your files. Try different files.")
  }

  const courseTitle =
    analysis.modules?.[0]?.title ||
    analysis.suggestedModules?.[0] ||
    files[0]?.name.replace(/\.[^.]+$/, "") ||
    "My Course"

  const coverImageUrl =
    pickMaterialCoverImage(imageMapLocal, analysis.visualDescriptions) ||
    DEFAULT_COURSE_IMAGE_URL

  report("saving-material", "Saving material library…")
  const processedImages = buildProcessedImagesForMaterial(analysis, imageMapLocal)
  const materialRef = doc(collection(db, "course_materials"))
  await setDoc(
    materialRef,
    omitUndefinedDeep({
      userId,
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
      createdAt: serverTimestamp(),
    })
  )

  const materialId = materialRef.id
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
  const topic = courseTitle || analysis.summary.slice(0, 120) || files[0]?.name || "Uploaded course"

  report("generating-skeleton", "Building your course structure…")
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

  report("creating-course", "Creating your journey…")
  return createCourseAndConsumeCredit(userId, courseData, "upload", materialId)
}
