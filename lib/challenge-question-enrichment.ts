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

/** Pre-generate powered-mode variants so actions apply instantly during the match. */
export async function enrichQuestionsForPoweredMode(
  questions: QuizQuestion[]
): Promise<QuizQuestion[]> {
  const objective = questions.filter((q) => q.type === "objective")
  if (objective.length === 0) return questions
  if (!(await hasGeminiApiKeys())) return questions

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
      "partialTfOptions": ["Partially true", "Partially false"]
    }
  ]
}

Rules:
- extraOptions: exactly 2 additional plausible WRONG answers (for multiple-choice; for true/false use partialTfOptions instead)
- alternateEasy: easier rewording of the same concept with 4 options (or 4 TF-style options for true/false)
- alternateHard: harder version with 4 options
- For true/false questions: provide partialTfOptions with 2 extra options like "Partially true" and "Partially false", and still provide alternateEasy/alternateHard as related true/false style questions
- extraOptions must NOT include the correct answer
- Keep the same correctAnswer semantics (string matching an option, or index number)

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
      if (!v) return q

      const extraOptions =
        q.objectiveType === "true-false"
          ? (v.partialTfOptions ?? v.extraOptions ?? [])
          : (v.extraOptions ?? [])

      const patch: Partial<QuizQuestion> = {
        extraOptions: extraOptions.slice(0, 2),
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
      }

      return { ...q, ...patch }
    })
  } catch (err) {
    console.error("Powered question enrichment failed:", err)
    return questions
  }
}
