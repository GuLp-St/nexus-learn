import type { LessonStream, TextBlock } from "./gemini"

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3)
}

/** Find the teaching block that best matches a lesson fact. */
export function findBlockIndexForFact(stream: LessonStream, factText: string): number | null {
  const textBlocks = stream.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type === "text")

  if (textBlocks.length === 0) return null

  const snippet = factText.trim().slice(0, 48)
  if (snippet.length >= 12) {
    for (const { block, index } of textBlocks) {
      const content = (block as TextBlock).content || ""
      if (content.toLowerCase().includes(snippet.toLowerCase())) {
        return index
      }
    }
  }

  const factWords = new Set(tokenize(factText))
  if (factWords.size === 0) return textBlocks[0].index

  let bestIndex = textBlocks[0].index
  let bestScore = 0

  for (const { block, index } of textBlocks) {
    const content = (block as TextBlock).content || ""
    let score = 0
    for (const word of tokenize(content)) {
      if (factWords.has(word)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestIndex
}

export function buildLessonBlockHref(
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  blockIndex?: number | null
): string {
  const base = `/journey/${courseId}/modules/${moduleIndex}/lessons/${lessonIndex}?view=true`
  if (blockIndex == null || Number.isNaN(blockIndex)) return base
  return `${base}&block=${blockIndex}`
}
