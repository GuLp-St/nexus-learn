import type { QuizQuestion } from "./quiz-utils"

export type PowerActionType =
  | "add_more_answers"
  | "combo_breaker"
  | "swap_harder"
  | "distort_screen"
  | "remove_wrong"
  | "combo_shield"
  | "swap_easier"
  | "combo_switcher"

export type PowerActionCategory = "sabotage" | "powerup"

export interface PowerEffectsBucket {
  extraOptionsByQuestionId?: Record<string, string[]>
  swappedQuestionByQuestionId?: Record<string, "easy" | "hard">
  removedWrongByQuestionId?: Record<string, boolean>
  comboShield?: boolean
}

export const SABOTAGE_ACTIONS: { id: PowerActionType; label: string; short: string }[] = [
  { id: "add_more_answers", label: "Add more answers", short: "+Answers" },
  { id: "combo_breaker", label: "Combo breaker", short: "Break" },
  { id: "swap_harder", label: "Harder question", short: "Harder" },
  { id: "distort_screen", label: "Distort screen", short: "Distort" },
]

export const POWERUP_ACTIONS: { id: PowerActionType; label: string; short: string }[] = [
  { id: "remove_wrong", label: "Remove wrong answers", short: "Halve" },
  { id: "combo_shield", label: "Combo shield", short: "Shield" },
  { id: "swap_easier", label: "Easier question", short: "Easier" },
  { id: "combo_switcher", label: "Combo switcher", short: "Switch" },
]

function isCorrectOption(
  options: string[],
  correct: string | number | boolean | undefined,
  opt: string,
  idx: number
): boolean {
  if (typeof correct === "number") return idx === correct
  if (typeof correct === "boolean") {
    return opt.toLowerCase() === (correct ? "true" : "false")
  }
  return opt === correct || opt.toLowerCase() === String(correct).toLowerCase()
}

/** Apply stored powered effects to the question shown to a player */
export function applyPowerEffectsToQuestion(
  question: QuizQuestion,
  effects?: PowerEffectsBucket
): QuizQuestion {
  if (!effects) return question

  let q: QuizQuestion = { ...question }
  const qid = question.questionId

  const swap = effects.swappedQuestionByQuestionId?.[qid]
  if (swap === "easy" && question.alternateEasy) {
    q = {
      ...q,
      question: question.alternateEasy.question,
      options: [...question.alternateEasy.options],
      correctAnswer: question.alternateEasy.correctAnswer,
    }
  } else if (swap === "hard" && question.alternateHard) {
    q = {
      ...q,
      question: question.alternateHard.question,
      options: [...question.alternateHard.options],
      correctAnswer: question.alternateHard.correctAnswer,
    }
  }

  const extras = effects.extraOptionsByQuestionId?.[qid]
  if (extras?.length && q.options) {
    q = { ...q, options: [...q.options, ...extras] }
  }

  if (effects.removedWrongByQuestionId?.[qid] && q.options && q.correctAnswer !== undefined) {
    const kept = q.options.filter((opt, idx) =>
      isCorrectOption(q.options!, q.correctAnswer, opt, idx)
    )
    q = { ...q, options: kept.length > 0 ? kept : q.options.slice(0, 1) }
  }

  return q
}

export function getActionCategory(type: PowerActionType): PowerActionCategory {
  return type === "remove_wrong" ||
    type === "combo_shield" ||
    type === "swap_easier" ||
    type === "combo_switcher"
    ? "powerup"
    : "sabotage"
}
