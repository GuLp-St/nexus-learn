import type { QuizQuestion } from "./quiz-utils"

/** Safe payload for hint tool — never includes correctAnswer or option indices. */
export interface QuestionHintContext {
  questionId: string
  question: string
  quizType: QuizQuestion["quizType"]
  type: QuizQuestion["type"]
  hint: string
  conceptExplanation: string
}

function stripAnswerLeaks(text: string, options?: string[]): string {
  let out = text
  if (options?.length) {
    for (const opt of options) {
      if (opt && opt.length > 2) {
        out = out.replace(new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[option]")
      }
    }
  }
  return out
}

function fallbackConceptExplanation(question: QuizQuestion): string {
  const base = question.question.trim()
  if (question.type === "subjective") {
    return `Think about the core ideas behind: "${base}". Structure your answer with definitions, one example, and a short conclusion.`
  }
  return `Review the main concept tested by this question: "${base}". Eliminate choices that contradict the lesson material; compare what each remaining option implies.`
}

function fallbackHint(question: QuizQuestion): string {
  if (question.type === "subjective") {
    return "Break the question into smaller parts. What is being asked? List key terms you should define."
  }
  return "Re-read the question stem. Which concept does each option relate to? Rule out options that don't fit the topic."
}

/**
 * Build zero-knowledge hint context from a quiz question document.
 */
export function buildQuestionHintContext(question: QuizQuestion): QuestionHintContext {
  const conceptExplanation = stripAnswerLeaks(
    question.conceptExplanation?.trim() ||
      question.hint?.trim() ||
      fallbackConceptExplanation(question),
    question.options
  )

  const hint = stripAnswerLeaks(
    question.hint?.trim() || fallbackHint(question),
    question.options
  )

  return {
    questionId: question.questionId,
    question: question.question,
    quizType: question.quizType,
    type: question.type,
    hint,
    conceptExplanation,
  }
}
