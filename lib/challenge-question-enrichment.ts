import type { QuizQuestion } from "./quiz-utils"
import { hasGeminiApiKeys } from "./gemini-keys"
import { poolGenerateText } from "./gemini-pool"

type VariantPayload = {
  questionId: string
  extraOptions?: string[]
  alternateEasy?: {
    question: string
    options: string[]
    correctAnswer: string | number | boolean
  }
  alternateHard?: {
    question: string
    options: string[]
    correctAnswer: string | number | boolean
  }
  partialTfOptions?: string[]
  tfExpandedVariant?: {
    question: string
    options: string[]
    correctAnswer: string | number | boolean
  }
}

function normalizeCorrectAnswer(
  options: string[],
  raw: string | number | boolean | undefined
): string | number | boolean {
  if (typeof raw === "number" && options[raw]) return raw
  if (typeof raw === "boolean") return raw
  if (typeof raw === "string") {
    const idx = options.findIndex((o) => o.toLowerCase() === raw.toLowerCase())
    if (idx >= 0) return idx
    return raw
  }
  return options[0] ?? 0
}

function buildFallbackEnrichment(q: QuizQuestion): Partial<QuizQuestion> {
  if (q.objectiveType === "true-false") {
    const correct =
      typeof q.correctAnswer === "boolean"
        ? q.correctAnswer
          ? "True"
          : "False"
        : String(q.correctAnswer ?? "True")
    return {
      extraOptions: ["Partially true", "Partially false"],
      tfExpandedVariant: {
        question: `${q.question} (consider edge cases and nuance)`,
        options: ["True", "False", "Partially true", "Partially false"],
        correctAnswer: correct,
      },
      alternateEasy: {
        question: q.question,
        options: ["True", "False"],
        correctAnswer: q.correctAnswer ?? "True",
      },
      alternateHard: {
        question: `Advanced: ${q.question}`,
        options: ["True", "False", "Partially true", "Partially false"],
        correctAnswer: correct,
      },
    }
  }

  const existing = q.options ?? []
  const correctStr =
    typeof q.correctAnswer === "number"
      ? existing[q.correctAnswer]
      : String(q.correctAnswer ?? "")
  const wrongPool = [
    "None of the above",
    "All of the above",
    "Not enough information",
    "The opposite is true",
  ].filter((w) => w.toLowerCase() !== correctStr?.toLowerCase())

  const extraOptions = wrongPool.slice(0, 2)
  const easyOpts = existing.length >= 2 ? existing.slice(0, 2) : ["Option A", "Option B"]
  const hardOpts = [
    ...existing,
    ...extraOptions.filter((e) => !existing.includes(e)),
  ].slice(0, 4)

  return {
    extraOptions,
    alternateEasy: {
      question: q.question,
      options: easyOpts.length >= 2 ? easyOpts : ["A", "B", "C", "D"],
      correctAnswer: q.correctAnswer ?? 0,
    },
    alternateHard: {
      question: `Advanced: ${q.question}`,
      options: hardOpts.length >= 4 ? hardOpts : [...hardOpts, "None of the above", "All of the above"].slice(0, 4),
      correctAnswer: q.correctAnswer ?? 0,
    },
  }
}

export type SwapReserveMeta = {
  courseId: string
  quizType: QuizQuestion["quizType"]
  moduleIndex: number | null
  lessonIndex: number | null
}

function buildFallbackReserveQuestion(
  base: QuizQuestion,
  index: number,
  difficulty: "easy" | "hard",
  meta: SwapReserveMeta
): QuizQuestion {
  const fallback = buildFallbackEnrichment(base)
  const variant = difficulty === "easy" ? fallback.alternateEasy : fallback.alternateHard
  const questionId = `swap-${difficulty}-${index}-${base.questionId}`
  return {
    questionId,
    courseId: meta.courseId,
    moduleIndex: meta.moduleIndex,
    lessonIndex: meta.lessonIndex,
    quizType: meta.quizType,
    type: "objective",
    objectiveType: base.objectiveType,
    question: variant?.question ?? base.question,
    options: variant?.options ?? base.options ?? [],
    correctAnswer: variant?.correctAnswer ?? base.correctAnswer ?? 0,
    swapReserveRole: difficulty,
  }
}

/**
 * Pre-generate N easy + N hard swap reserve questions (2N total) for Powered challenges.
 * Base quiz keeps 10 (module) or 20 (final) questions; reserves are consumed by swap actions.
 */
export async function generateSwapReserveQuestions(
  baseQuestions: QuizQuestion[],
  variantCount: number,
  meta: SwapReserveMeta
): Promise<{ easy: QuizQuestion[]; hard: QuizQuestion[] }> {
  const count = Math.min(10, Math.max(1, Math.floor(variantCount)))
  const objective = baseQuestions.filter((q) => q.type === "objective")
  if (objective.length === 0) {
    return { easy: [], hard: [] }
  }

  const seeds = Array.from({ length: count }, (_, i) => objective[i % objective.length])
  const hasKeys = await hasGeminiApiKeys()

  if (!hasKeys) {
    return {
      easy: seeds.map((q, i) => buildFallbackReserveQuestion(q, i, "easy", meta)),
      hard: seeds.map((q, i) => buildFallbackReserveQuestion(q, i, "hard", meta)),
    }
  }

  const compact = seeds.map((q, i) => ({
    reserveIndex: i,
    sourceQuestionId: q.questionId,
    type: q.objectiveType,
    question: q.question,
    options: q.options ?? [],
    correctAnswer: q.correctAnswer,
  }))

  const prompt = `Generate ${count} EASY and ${count} HARD alternate quiz questions for a 1v1 Powered challenge swap pool.

Return ONLY valid JSON:
{
  "easy": [
    { "reserveIndex": 0, "question": "...", "options": ["..."], "correctAnswer": "..." }
  ],
  "hard": [
    { "reserveIndex": 0, "question": "...", "options": ["..."], "correctAnswer": "..." }
  ]
}

Rules:
- Provide exactly ${count} items in "easy" and exactly ${count} in "hard"
- Each reserveIndex 0..${count - 1} must appear once per array
- Base each variant on the source question at the same reserveIndex below
- easy: simpler wording, fewer distractors (True/False ok for T/F sources)
- hard: more advanced wording, 4 options for multiple-choice (partial T/F ok for T/F sources)
- correctAnswer must match an option (string) or be a 0-based option index
- Do NOT copy the source question verbatim

Source questions:
${JSON.stringify(compact, null, 2)}`

  try {
    const text = await poolGenerateText(prompt)
    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const data = JSON.parse(jsonText) as {
      easy?: Array<{
        reserveIndex: number
        question: string
        options: string[]
        correctAnswer: string | number | boolean
      }>
      hard?: Array<{
        reserveIndex: number
        question: string
        options: string[]
        correctAnswer: string | number | boolean
      }>
    }

    const easyByIdx = new Map((data.easy ?? []).map((e) => [e.reserveIndex, e]))
    const hardByIdx = new Map((data.hard ?? []).map((h) => [h.reserveIndex, h]))

    const easy: QuizQuestion[] = []
    const hard: QuizQuestion[] = []

    for (let i = 0; i < count; i++) {
      const seed = seeds[i]
      const easyVar = easyByIdx.get(i)
      const hardVar = hardByIdx.get(i)

      if (easyVar?.question && easyVar.options?.length) {
        easy.push({
          questionId: `swap-easy-${i}-${seed.questionId}`,
          courseId: meta.courseId,
          moduleIndex: meta.moduleIndex,
          lessonIndex: meta.lessonIndex,
          quizType: meta.quizType,
          type: "objective",
          objectiveType: seed.objectiveType,
          question: easyVar.question,
          options: easyVar.options,
          correctAnswer: normalizeCorrectAnswer(easyVar.options, easyVar.correctAnswer),
          swapReserveRole: "easy",
        })
      } else {
        easy.push(buildFallbackReserveQuestion(seed, i, "easy", meta))
      }

      if (hardVar?.question && hardVar.options?.length) {
        hard.push({
          questionId: `swap-hard-${i}-${seed.questionId}`,
          courseId: meta.courseId,
          moduleIndex: meta.moduleIndex,
          lessonIndex: meta.lessonIndex,
          quizType: meta.quizType,
          type: "objective",
          objectiveType: seed.objectiveType,
          question: hardVar.question,
          options: hardVar.options,
          correctAnswer: normalizeCorrectAnswer(hardVar.options, hardVar.correctAnswer),
          swapReserveRole: "hard",
        })
      } else {
        hard.push(buildFallbackReserveQuestion(seed, i, "hard", meta))
      }
    }

    return { easy, hard }
  } catch (err) {
    console.error("Swap reserve generation failed:", err)
    return {
      easy: seeds.map((q, i) => buildFallbackReserveQuestion(q, i, "easy", meta)),
      hard: seeds.map((q, i) => buildFallbackReserveQuestion(q, i, "hard", meta)),
    }
  }
}

/** Pre-generate powered-mode sabotage variants (false answers, T/F expansion) on base questions. */
export async function enrichQuestionsForPoweredMode(
  questions: QuizQuestion[]
): Promise<QuizQuestion[]> {
  const objective = questions.filter((q) => q.type === "objective")
  if (objective.length === 0) return questions

  const hasKeys = await hasGeminiApiKeys()
  if (!hasKeys) {
    return questions.map((q) => {
      if (q.type !== "objective") return q
      const fallback = buildFallbackEnrichment(q)
      return {
        ...q,
        extraOptions: fallback.extraOptions ?? q.extraOptions,
        tfExpandedVariant: fallback.tfExpandedVariant ?? q.tfExpandedVariant,
      }
    })
  }

  const compact = objective.map((q) => ({
    questionId: q.questionId,
    type: q.objectiveType,
    question: q.question,
    options: q.options ?? [],
    correctAnswer: q.correctAnswer,
  }))

  const prompt = `For each quiz question below, generate Powered-mode sabotage variants for a 1v1 challenge.

Return ONLY valid JSON:
{
  "variants": [
    {
      "questionId": "same id",
      "extraOptions": ["wrong1", "wrong2"],
      "partialTfOptions": ["Partially true", "Partially false"],
      "tfExpandedVariant": { "question": "similar but different question", "options": ["True", "False", "Partially true", "Partially false"], "correctAnswer": "..." }
    }
  ]
}

Rules:
- EVERY question must have exactly 2 extraOptions (plausible WRONG answers for multiple-choice)
- For true/false questions:
  - Provide tfExpandedVariant: a SIMILAR but DIFFERENT question with exactly 4 options ["True", "False", "Partially true", "Partially false"] where any of them could be correct
  - Provide partialTfOptions as ["Partially true", "Partially false"]
- extraOptions must NOT include the correct answer
- Keep correctAnswer semantics (string matching an option, or index number)

Questions:
${JSON.stringify(compact, null, 2)}`

  try {
    const text = await poolGenerateText(prompt)
    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const data = JSON.parse(jsonText) as { variants?: VariantPayload[] }
    const byId = new Map((data.variants ?? []).map((v) => [v.questionId, v]))

    return questions.map((q) => {
      if (q.type !== "objective") return q
      const v = byId.get(q.questionId)
      const fallback = buildFallbackEnrichment(q)
      if (!v) {
        return { ...q, ...fallback }
      }

      const extraOptions =
        q.objectiveType === "true-false"
          ? (v.partialTfOptions ?? v.extraOptions ?? fallback.extraOptions ?? [])
          : (v.extraOptions ?? fallback.extraOptions ?? [])

      const patch: Partial<QuizQuestion> = {
        extraOptions: extraOptions.slice(0, 2),
      }

      const tfVar = v.tfExpandedVariant ?? fallback.tfExpandedVariant
      if (tfVar?.question && tfVar.options?.length) {
        patch.tfExpandedVariant = {
          question: tfVar.question,
          options: tfVar.options,
          correctAnswer: normalizeCorrectAnswer(tfVar.options, tfVar.correctAnswer),
        }
      }

      if (!patch.extraOptions?.length && fallback.extraOptions) {
        patch.extraOptions = fallback.extraOptions
      }

      return { ...q, ...patch }
    })
  } catch (err) {
    console.error("Powered question enrichment failed:", err)
    return questions.map((q) => {
      if (q.type !== "objective") return q
      return { ...q, ...buildFallbackEnrichment(q) }
    })
  }
}
