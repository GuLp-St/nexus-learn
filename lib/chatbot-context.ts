/**
 * Context types for the chatbot to understand what page the user is currently viewing
 */

export interface LessonPageContext {
  type: "lesson"
  courseTitle: string
  courseDescription?: string
  moduleTitle: string
  moduleIndex: number
  lessonTitle: string
  lessonIndex: number
  currentSlide: {
    index: number
    totalSlides: number
    title: string
    content: string
  }
}

export interface QuizResultPageContext {
  type: "quiz-result"
  courseTitle: string
  quizType: "lesson" | "module" | "course"
  moduleIndex?: number | null
  lessonIndex?: number | null
  questions: Array<{
    questionId: string
    question: string
    type: "objective" | "subjective"
    options?: string[]
    userAnswer: string | number | boolean
    correctAnswer?: string | number | boolean
    isCorrect: boolean
  }>
  score: {
    correct: number
    total: number
    percentage: number
  }
}

export interface CoursePageContext {
  type: "course"
  courseTitle: string
  courseDescription: string
  estimatedDuration: string
  difficulty: string
  modules: Array<{
    title: string
    description: string
    duration: string
    lessonsCount: number
    lessons: Array<{
      title: string
      content: string
      duration: string
    }>
  }>
  progress?: {
    percentage: number
    completedLessons: string[]
  }
}

export interface GenericPageContext {
  type: "generic"
  pageName?: string
  description?: string
}

export type PageContext = LessonPageContext | QuizResultPageContext | CoursePageContext | GenericPageContext

export function formatContextForAI(context: PageContext | null): string {
  if (!context) {
    return "The user is on a general page. Provide helpful assistance."
  }

  switch (context.type) {
    case "lesson":
      return `The student is currently viewing a lesson slide:
- Course: "${context.courseTitle}"${context.courseDescription ? ` (${context.courseDescription})` : ""}
- Module: "${context.moduleTitle}" (Module ${context.moduleIndex + 1})
- Lesson: "${context.lessonTitle}" (Lesson ${context.lessonIndex + 1})
- Current Slide: ${context.currentSlide.index + 1} of ${context.currentSlide.totalSlides}
- Slide Title: "${context.currentSlide.title}"
- Slide Content: "${context.currentSlide.content}"

The student can ask questions about this slide, request a summary, ask for clarification, or get help understanding the concepts.`

    case "quiz-result":
      const questionsText = context.questions
        .map((q, idx) => {
          const questionNum = idx + 1
          const questionText = `Question ${questionNum}: ${q.question}`
          const optionsText = q.options
            ? `\n  Options: ${q.options.map((opt, i) => `${i}: ${opt}`).join(", ")}`
            : ""
          const userAnswerText = `User's answer: ${q.userAnswer}`
          const correctAnswerText =
            q.correctAnswer !== undefined
              ? `Correct answer: ${q.correctAnswer}`
              : ""
          const resultText = q.isCorrect ? "✓ Correct" : "✗ Incorrect"
          return `${questionText}${optionsText}\n  ${userAnswerText}\n  ${correctAnswerText}\n  Result: ${resultText}`
        })
        .join("\n\n")

      return `The student just completed a ${context.quizType} quiz:
- Course: "${context.courseTitle}"
- Quiz Type: ${context.quizType}${context.moduleIndex !== null && context.moduleIndex !== undefined ? ` (Module ${context.moduleIndex + 1})` : ""}${context.lessonIndex !== null && context.lessonIndex !== undefined ? ` (Lesson ${context.lessonIndex + 1})` : ""}
- Score: ${context.score.correct}/${context.score.total} (${context.score.percentage}%)

Quiz Questions and Answers:
${questionsText}

The student can ask for explanations of questions, understand why their answers were wrong, get clarification on concepts, or review the material.`

    case "course":
      const modulesList = context.modules
        .map((m, idx) => {
          const lessonsList = m.lessons
            .map((lesson, lessonIdx) => `  ${lessonIdx + 1}. "${lesson.title}" (${lesson.duration})`)
            .join("\n")
          return `Module ${idx + 1}: "${m.title}" - ${m.description} (${m.duration}, ${m.lessonsCount} lessons)
Lessons:
${lessonsList}`
        })
        .join("\n\n")
      const progressText = context.progress
        ? `\n- Progress: ${context.progress.percentage}% complete (${context.progress.completedLessons.length} lessons completed)`
        : ""
      
      return `The student is currently viewing the course overview page:
- Course: "${context.courseTitle}"
- Description: ${context.courseDescription}
- Duration: ${context.estimatedDuration}
- Difficulty: ${context.difficulty}
- Total Modules: ${context.modules.length}${progressText}

Course Modules and Lessons:
${modulesList}

The student can ask questions about the course content, modules, lessons, what to expect, how to approach learning the material, or get recommendations on which modules/lessons to focus on.`

    case "generic":
      return context.pageName
        ? `The user is on the "${context.pageName}" page.${context.description ? ` ${context.description}` : ""} Provide helpful assistance.`
        : "The user is on a general page. Provide helpful assistance."

    default:
      return "The user is on a general page. Provide helpful assistance."
  }
}
