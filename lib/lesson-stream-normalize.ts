import type { FillBlankInteraction, LessonStream, LessonStreamBlock } from "./gemini"

const INTERACTION_TYPES = new Set([
  "swipe",
  "reorder",
  "fill_blank",
  "bug_hunter",
  "matching",
  "chat_sim",
])

function isInteractionBlock(block: LessonStreamBlock): boolean {
  return block.type !== "text" && INTERACTION_TYPES.has(block.type)
}

type FillBlankOptionRaw =
  | string
  | { label?: string; text?: string; value?: string; isCorrect?: boolean }

/** Gemini sometimes emits swipe-style `{ label, isCorrect }` options for fill_blank. */
export function normalizeFillBlankInteraction(
  interaction: FillBlankInteraction
): FillBlankInteraction {
  const rawOptions = (interaction.options ?? []) as FillBlankOptionRaw[]
  const options: string[] = []
  let correctAnswer =
    typeof interaction.correctAnswer === "string"
      ? interaction.correctAnswer.trim()
      : ""

  for (const opt of rawOptions) {
    if (typeof opt === "string") {
      const label = opt.trim()
      if (label) options.push(label)
      continue
    }
    if (!opt || typeof opt !== "object") continue
    const label = String(opt.label ?? opt.text ?? opt.value ?? "").trim()
    if (!label) continue
    options.push(label)
    if (opt.isCorrect && !correctAnswer) correctAnswer = label
  }

  if (!correctAnswer) {
    const fromObjects = rawOptions.find(
      (o) => typeof o === "object" && o && (o as { isCorrect?: boolean }).isCorrect
    ) as { label?: string; text?: string; value?: string } | undefined
    if (fromObjects) {
      correctAnswer = String(
        fromObjects.label ?? fromObjects.text ?? fromObjects.value ?? ""
      ).trim()
    }
  }

  if (!correctAnswer && options.length > 0) {
    correctAnswer = options[0]
  }

  return {
    ...interaction,
    options,
    correctAnswer,
  }
}

function normalizeInteractionBlock(block: LessonStreamBlock): LessonStreamBlock {
  if (block.type === "fill_blank") {
    return normalizeFillBlankInteraction(block)
  }
  return block
}

/**
 * Enforces strict text → interaction alternation so each activity
 * immediately follows the teaching block it tests.
 */
export function normalizeLessonStreamBlocks(stream: LessonStream): LessonStream {
  const texts: LessonStreamBlock[] = []
  const interactions: LessonStreamBlock[] = []

  for (const block of stream.blocks) {
    if (block.type === "text") {
      texts.push(block)
    } else if (isInteractionBlock(block)) {
      interactions.push(normalizeInteractionBlock(block))
    }
  }

  const normalized: LessonStreamBlock[] = []
  const maxPairs = Math.min(6, texts.length, interactions.length)
  const pairs = Math.min(texts.length, interactions.length, maxPairs)

  for (let i = 0; i < pairs; i++) {
    normalized.push(texts[i])
    normalized.push(interactions[i])
  }

  return { ...stream, blocks: normalized }
}
