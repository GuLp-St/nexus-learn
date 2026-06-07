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

/** Pre-generate powered-mode variants so actions apply instantly during the match. */
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
        alternateEasy: fallback.alternateEasy ?? q.alternateEasy,
        alternateHard: fallback.alternateHard ?? q.alternateHard,
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

  const prompt = `For each quiz question below, generate Powered-mode variants for a 1v1 challenge.

Return ONLY valid JSON:
{
  "variants": [
    {
      "questionId": "same id",
      "extraOptions": ["wrong1", "wrong2"],
      "alternateEasy": { "question": "...", "options": ["..."], "correctAnswer": "..." },
      "alternateHard": { "question": "...", "options": ["..."], "correctAnswer": "..." },
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
  - alternateHard for T/F must also use 4 options including partially true/false
- alternateEasy: easier rewording with 4 options (or True/False for simple T/F)
- alternateHard: harder version with 4 options
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

      if (v.alternateEasy?.question && v.alternateEasy.options?.length) {
        patch.alternateEasy = {
          question: v.alternateEasy.question,
          options: v.alternateEasy.options,
          correctAnswer: normalizeCorrectAnswer(
            v.alternateEasy.options,
            v.alternateEasy.correctAnswer
          ),
        }
      } else if (fallback.alternateEasy) {
        patch.alternateEasy = fallback.alternateEasy
      }

      if (v.alternateHard?.question && v.alternateHard.options?.length) {
        patch.alternateHard = {
          question: v.alternateHard.question,
          options: v.alternateHard.options,
          correctAnswer: normalizeCorrectAnswer(
            v.alternateHard.options,
            v.alternateHard.correctAnswer
          ),
        }
      } else if (fallback.alternateHard) {
        patch.alternateHard = fallback.alternateHard
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
