import { getGeminiModelName } from "./gemini-model"
import { hasGeminiApiKeys } from "./gemini-keys"
import { mapParallelWithKeys, poolGenerateContent } from "./gemini-pool"

export interface LessonDetail {
  title: string
  keyPoints: string[]
  references: string[]
}

export interface ModuleDetail {
  title: string
  lessons: LessonDetail[]
}

export interface VisualDescription {
  imageIndex: number
  description: string
  tags: string[]
}

export interface CourseMaterialAnalysis {
  summary: string
  visualDescriptions: VisualDescription[] // Updated to include imageIndex and tags
  suggestedModules: string[] // Legacy field for backward compatibility
  modules?: ModuleDetail[] // New detailed structure with lessons
}

// Processed data for a single uploaded file
export interface FileProcessedData {
  fileName: string
  text: string
  images: Array<{ index: number; base64: string }> // Updated to use indexed images
}

// Important information extracted per file before aggregation
interface SingleFileAnalysis {
  fileName: string
  summary: string
  visualDescriptions: VisualDescription[]
  keyPoints: string[]
}

/**
 * Internal helper: analyze a SINGLE file (text + images) to extract its key information.
 * This keeps the request size small and avoids overloading the model with all files at once.
 */
async function analyzeSingleFileMaterial(
  fileName: string,
  text: string,
  images: Array<{ index: number; base64: string }>,
  keyIndex: number
): Promise<SingleFileAnalysis> {
  if (!(await hasGeminiApiKeys())) {
    throw new Error("Gemini API key is not configured")
  }

  // Construct parts array
  const parts: any[] = []

  // Add text as first part
  if (text.trim()) {
    parts.push({ text: text })
  }

  // Add images as inline data with their indices
  // Note: We need to maintain the order and index mapping
  for (const imageData of images) {
    // Extract base64 data and mime type from data URI
    const matches = imageData.base64.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      const rawMimeType = matches[1] || ""
      // Gemini only supports actual image MIME types here.
      // Some blobs (e.g. from JSZip) may come through as application/octet-stream,
      // so we coerce any non-image type to image/jpeg.
      const mimeType = rawMimeType.startsWith("image/") ? rawMimeType : "image/jpeg"
      const base64Data = matches[2]

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      })
    }
  }

  // Build image index reference for the prompt
  const imageIndexList = images.length > 0 
    ? `\n\nIMAGES PROVIDED (in order):\n${images.map((img, idx) => `Image Index ${img.index}: This is image #${idx + 1} of ${images.length} in the file`).join("\n")}`
    : "\n\nNO IMAGES PROVIDED"

  const systemInstruction = `You are an expert academic synthesizer.

Task: Analyze a single uploaded course material file (Text + Images) and extract its most important information.

File name: ${fileName}${imageIndexList}

Instructions:
1. Summary: Provide a concise summary (1-3 paragraphs) of the key concepts, definitions, and workflows in THIS file only.
2. Visual Analysis: If you see diagrams/charts in the images, describe them in detail and link them to the concepts mentioned in the text. You MUST reference each image by its Index number (0, 1, 2, etc.).
3. Key Points: Extract the most important bullet-point key ideas that a learner must understand from this file.

Output Requirements:
- Return ONLY valid JSON without markdown formatting
- The JSON must follow this exact structure:
{
  "summary": "Short summary of this file only",
  "visualDescriptions": [
    {
      "imageIndex": 0,
      "description": "Detailed description of what is shown in image at index 0 and how it relates to the concepts",
      "tags": ["tag1", "tag2", "tag3"]
    },
    {
      "imageIndex": 1,
      "description": "Detailed description of what is shown in image at index 1 and how it relates to the concepts",
      "tags": ["tag1", "tag2"]
    }
  ],
  "keyPoints": ["Key idea 1", "Key idea 2", "Key idea 3", ...]
}

Guidelines:
- Focus ONLY on the content of this single file
- The summary should be 1-3 paragraphs
- visualDescriptions MUST be an array of objects, each with imageIndex (number), description (string), and tags (array of strings)
- Each visualDescription MUST reference the image by its exact Index number (0, 1, 2, etc.) as provided above
- tags should be relevant keywords like ["biology", "cell", "diagram"] or ["chemistry", "molecule", "structure"]
- keyPoints should be 5-15 bullet points capturing the essential concepts, steps, or definitions from this file
- If there are no images, visualDescriptions should be an empty array`

  try {
    const { response } = await poolGenerateContent(
      {
        contents: [{ role: "user", parts }],
        systemInstruction,
      },
      { systemInstruction },
      keyIndex
    )

    const textResponse = response.text()

    // Clean the response
    let jsonText = textResponse.trim()

    // Extract JSON between { and }
    const firstBrace = jsonText.indexOf("{")
    const lastBrace = jsonText.lastIndexOf("}")

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const analysis = JSON.parse(jsonText) as {
      summary: string
      visualDescriptions?: Array<{ imageIndex: number; description: string; tags: string[] }> | string[]
      keyPoints?: string[]
    }

    // Handle both old format (string[]) and new format (VisualDescription[])
    let visualDescriptions: VisualDescription[] = []
    if (Array.isArray(analysis.visualDescriptions)) {
      if (analysis.visualDescriptions.length > 0) {
        // Check if it's the new format (objects) or old format (strings)
        if (typeof analysis.visualDescriptions[0] === "object" && "imageIndex" in analysis.visualDescriptions[0]) {
          visualDescriptions = analysis.visualDescriptions as VisualDescription[]
        } else {
          // Old format: convert strings to VisualDescription objects with sequential indices
          visualDescriptions = (analysis.visualDescriptions as string[]).map((desc, idx) => ({
            imageIndex: idx,
            description: desc,
            tags: [],
          }))
        }
      }
    }

    return {
      fileName,
      summary: analysis.summary || "No summary available",
      visualDescriptions,
      keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints : [],
    }
  } catch (error) {
    console.error("Error analyzing single file material:", error)
    throw error
  }
}

/**
 * Aggregate analysis: take per-file summaries/key points and derive a full course structure.
 * This function only uses text (no inline images) to keep the request light.
 */
export async function analyzeCourseFromFiles(
  files: FileProcessedData[],
  onProgress?: (processed: number, total: number) => void
): Promise<CourseMaterialAnalysis> {
  if (!(await hasGeminiApiKeys())) {
    throw new Error("Gemini API key is not configured")
  }

  // Step 1: parallel per-file analysis (spread across API keys)
  let completed = 0
  const fileAnalyses = await mapParallelWithKeys(
    files,
    async (file, keyIndex) => {
      const analysis = await analyzeSingleFileMaterial(
        file.fileName,
        file.text,
        file.images,
        keyIndex
      )
      completed++
      if (onProgress) onProgress(completed, files.length)
      return analysis
    },
    files.length
  )

  // Step 2: build combined text from per-file analyses
  const combinedText = fileAnalyses
    .map((fa, fileIdx) => {
      const keyPointsText =
        fa.keyPoints.length > 0 ? fa.keyPoints.map((kp) => `- ${kp}`).join("\n") : "- (none)"
      
      // Visual descriptions already use globally-unique image indices
      // (assigned during client-side extraction), so we keep them as-is.
      const visualsText =
        fa.visualDescriptions.length > 0
          ? fa.visualDescriptions.map((v) => {
              return `- Image Index ${v.imageIndex}: ${v.description} [Tags: ${v.tags.join(", ")}]`
            }).join("\n")
          : "- (none)"
      
      return `FILE ${fileIdx + 1}: ${fa.fileName}

SUMMARY:
${fa.summary}

KEY POINTS:
${keyPointsText}

VISUALS:
${visualsText}`
    })
    .join("\n\n------------------------\n\n")

  // Step 3: single coherent aggregation (one key, full combined context from step 1+2)
  const systemInstruction = `You are an expert academic course designer.

Task: You will receive summarized important information from MULTIPLE uploaded files (summaries, key points, and visual descriptions). Based on ALL of this combined information, design a complete course.

Instructions:
1. Read all file summaries, key points, and visual descriptions carefully.
2. Identify the main themes and concepts across all files.
3. Design a coherent course that covers all key points from all files.
4. Create a detailed breakdown with Modules, Lessons within each module, and key points/references for each lesson.

Output Requirements:
- Return ONLY valid JSON without markdown formatting
- The JSON must follow this exact structure:
{
  "summary": "Comprehensive summary of the combined course material covering key concepts, definitions, and workflows",
  "visualDescriptions": [
    {
      "imageIndex": 0,
      "description": "Detailed description of the image at index 0 and how it relates to course concepts",
      "tags": ["tag1", "tag2", "tag3"]
    },
    {
      "imageIndex": 5,
      "description": "Detailed description of the image at index 5 and how it relates to course concepts",
      "tags": ["tag1", "tag2"]
    }
  ],
  "suggestedModules": ["Module 1 Title", "Module 2 Title", ...],
  "modules": [
    {
      "title": "Module 1 Title",
      "lessons": [
        {
          "title": "Lesson 1 Title",
          "keyPoints": ["Key concept 1", "Key concept 2", "Key concept 3"],
          "references": ["Reference to Image Index X", "Reference to specific section"]
        }
      ]
    }
  ]
}

Guidelines:
- The summary should be comprehensive (3-5 paragraphs) covering all major topics across ALL files
- visualDescriptions MUST be an array of objects with imageIndex (number), description (string), and tags (array of strings)
- Each visualDescription MUST reference images by their exact Index number as provided in the input (e.g., "Image Index 0", "Image Index 5")
- Only include the most important/relevant images in visualDescriptions (not all images)
- tags should be relevant keywords like ["biology", "cell", "diagram"] or ["chemistry", "molecule", "structure"]
- Create 3-7 modules that logically organize the content across all files
- Each module should have 2-5 lessons
- Each lesson should have 3-7 keyPoints that capture the essential concepts, derived from the key points of all files
- references should link lessons to specific Image Index numbers (e.g., "See Image Index 3") or specific sections mentioned in the input
- Module and lesson titles should be clear and descriptive
- If there are no images, visualDescriptions should be an empty array
- suggestedModules array should contain just the module titles`

  const parts: any[] = []
  if (combinedText.trim()) {
    parts.push({ text: combinedText })
  }

  try {
    const { response } = await poolGenerateContent(
      {
        contents: [{ role: "user", parts }],
        systemInstruction,
      },
      { systemInstruction }
    )

    const textResponse = response.text()

    // Clean the response
    let jsonText = textResponse.trim()
    const firstBrace = jsonText.indexOf("{")
    const lastBrace = jsonText.lastIndexOf("}")

    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const rawAnalysis = JSON.parse(jsonText) as any

    // Validate and convert visualDescriptions to new format
    let visualDescriptions: VisualDescription[] = []
    if (Array.isArray(rawAnalysis.visualDescriptions)) {
      if (rawAnalysis.visualDescriptions.length > 0) {
        // Check if it's the new format (objects) or old format (strings)
        if (typeof rawAnalysis.visualDescriptions[0] === "object" && "imageIndex" in rawAnalysis.visualDescriptions[0]) {
          visualDescriptions = rawAnalysis.visualDescriptions as VisualDescription[]
        } else {
          // Old format: convert strings to VisualDescription objects (no index info available)
          visualDescriptions = (rawAnalysis.visualDescriptions as string[]).map((desc, idx) => ({
            imageIndex: idx,
            description: desc,
            tags: [],
          }))
        }
      }
    }

    const analysis: CourseMaterialAnalysis = {
      summary: rawAnalysis.summary || "No summary available",
      visualDescriptions,
      suggestedModules: Array.isArray(rawAnalysis.suggestedModules) ? rawAnalysis.suggestedModules : [],
      modules: rawAnalysis.modules,
    }

    // Validate modules structure
    if (analysis.modules && Array.isArray(analysis.modules)) {
      analysis.modules = analysis.modules.map((module) => ({
        title: module.title || "Untitled Module",
        lessons: Array.isArray(module.lessons)
          ? module.lessons.map((lesson) => ({
              title: lesson.title || "Untitled Lesson",
              keyPoints: Array.isArray(lesson.keyPoints) ? lesson.keyPoints : [],
              references: Array.isArray(lesson.references) ? lesson.references : [],
            }))
          : [],
      }))

      // Populate suggestedModules from modules if not present
      if (analysis.suggestedModules.length === 0 && analysis.modules.length > 0) {
        analysis.suggestedModules = analysis.modules.map((m) => m.title)
      }
    } else {
      // If modules not provided, create empty array
      analysis.modules = []
    }

    return analysis
  } catch (error) {
    console.error("Error analyzing aggregated course material:", error)
    throw new Error("Failed to analyze course material. Please try again.")
  }
}

/**
 * Legacy-style analyzer kept for potential reuse:
 * Analyze course material (text + images) and generate a knowledge base.
 * Currently used internally by analyzeCourseFromFiles.
 */
export async function analyzeCourseMaterial(
  text: string,
  images: string[]
): Promise<CourseMaterialAnalysis> {
  // For now, delegate to analyzeCourseFromFiles by treating all input as a single pseudo-file.
  // Convert string[] to indexed format
  const indexedImages = images.map((base64, index) => ({ index, base64 }))
  const singleFile: FileProcessedData = {
    fileName: "combined",
    text,
    images: indexedImages,
  }
  return analyzeCourseFromFiles([singleFile])
}
