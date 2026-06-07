import { db } from "./firebase"
import { doc, getDoc } from "firebase/firestore"

export const MATERIAL_ONLY_RULES = `CRITICAL RULES — MATERIAL-ONLY GENERATION:
- Use ONLY facts, definitions, and examples present in the provided source material excerpts.
- Do NOT invent content, external facts, analogies, or examples not grounded in the material.
- If the material does not cover something, say it is not covered — do not guess.
- Paraphrase is allowed; fabrication is not.`

export type StoredCourseMaterial = {
  sourceFiles?: Array<{ name: string; url: string }>
  imageMap?: Record<number, string>
  extractedText?: string
  toneInstruction?: string
  difficulty?: string
  modules?: Array<{
    title?: string
    summary?: string
    lessons?: Array<{
      title?: string
      summary?: string
      keyPoints?: string[]
      references?: string[]
    }>
  }>
  summary?: string
}

export async function getCourseMaterial(
  sourceMaterialId: string
): Promise<StoredCourseMaterial | null> {
  try {
    const snap = await getDoc(doc(db, "course_materials", sourceMaterialId))
    if (!snap.exists()) return null
    return snap.data() as StoredCourseMaterial
  } catch {
    return null
  }
}

/** Full extracted text for grounding (truncated for token limits). */
export async function getMaterialContextBlock(
  sourceMaterialId: string,
  maxChars = 100_000
): Promise<string> {
  const material = await getCourseMaterial(sourceMaterialId)
  if (!material?.extractedText?.trim()) return ""

  const tone = material.toneInstruction?.trim()
    ? `\nTeaching tone: ${material.toneInstruction.trim()}`
    : ""
  const diff = material.difficulty
    ? `\nDifficulty: ${material.difficulty}`
    : ""

  return `${MATERIAL_ONLY_RULES}${tone}${diff}

SOURCE MATERIAL (excerpt):
${material.extractedText.slice(0, maxChars)}`
}

/** Module + lesson summaries only — used for course skeleton (not the display summary). */
export function buildModuleContextBlock(
  material: StoredCourseMaterial,
  moduleIndex?: number
): string {
  const modules = material.modules ?? []
  const slice =
    moduleIndex !== undefined ? modules.slice(moduleIndex, moduleIndex + 1) : modules

  const lines = slice.map((mod, idx) => {
    const num = moduleIndex !== undefined ? moduleIndex + 1 : idx + 1
    const modSummary = mod.summary?.trim() || "(no module summary)"
    const lessons = (mod.lessons ?? [])
      .map((les, li) => {
        const ls = les.summary?.trim() || les.keyPoints?.join("; ") || "(no lesson summary)"
        return `    Lesson ${li + 1} "${les.title || "Untitled"}": ${ls}`
      })
      .join("\n")
    return `Module ${num} "${mod.title || "Untitled"}":\n  Summary: ${modSummary}\n${lessons}`
  })

  return lines.join("\n\n")
}
