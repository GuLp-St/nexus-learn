import { GoogleGenerativeAI } from "@google/generative-ai"
import { QuizQuestion } from "./quiz-utils"
import { CourseData, CourseModule } from "./gemini"
import { v4 as uuidv4 } from "uuid"

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

if (!apiKey) {
  console.warn("NEXT_PUBLIC_GEMINI_API_KEY is not set")
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

/**
 * Generate quiz questions for a lesson
 */
export async function generateLessonQuizQuestions(
  courseTitle: string,
  moduleTitle: string,
  lessonTitle: string,
  lessonDescription: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  count: number = 3
): Promise<QuizQuestion[]> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  // Lesson quizzes: no subjective questions
  const objectiveCount = count
  const subjectiveCount = 0

  const prompt = `Generate ${count} quiz questions for the lesson "${lessonTitle}" in the module "${moduleTitle}" of the course "${courseTitle}".

Lesson Description: ${lessonDescription}

Requirements:
- Generate ${objectiveCount} objective questions (mix of multiple-choice and true/false)
- Generate ${subjectiveCount} subjective questions (open-ended text questions)
- Questions should test understanding of the lesson content
- For objective questions: provide 4 options for multiple-choice, or true/false
- For subjective questions: provide a suggested answer that demonstrates good understanding

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "questions": [
    {
      "type": "objective",
      "objectiveType": "multiple-choice" | "true-false",
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"] (for multiple-choice) or ["True", "False"] (for true-false),
      "correctAnswer": "Option 1" or 0 (for first option) or true/false (for true-false)
    },
    {
      "type": "subjective",
      "question": "Question text here",
      "suggestedAnswer": "A comprehensive answer that demonstrates good understanding of the concept"
    }
  ]
}

Make sure the questions are educational, clear, and test actual understanding. Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const data = JSON.parse(jsonText) as { questions: any[] }
    
    const questions: QuizQuestion[] = data.questions.map((q) => {
      const questionId = uuidv4()
      
      if (q.type === "objective") {
        // Normalize correct answer
        let correctAnswer: string | number | boolean = q.correctAnswer
        
        // If it's a number index, convert to number
        if (typeof correctAnswer === "string" && /^\d+$/.test(correctAnswer)) {
          correctAnswer = parseInt(correctAnswer)
        }
        
        // If correctAnswer is an option string, find its index
        if (q.objectiveType === "multiple-choice" && typeof correctAnswer === "string" && q.options) {
          const index = q.options.findIndex((opt: string) => opt === correctAnswer)
          if (index !== -1) {
            correctAnswer = index
          }
        }
        
        return {
          questionId,
          courseId,
          moduleIndex,
          lessonIndex,
          quizType: "lesson",
          type: "objective",
          objectiveType: q.objectiveType || "multiple-choice",
          question: q.question,
          options: q.options || [],
          correctAnswer,
        }
      } else {
        return {
          questionId,
          courseId,
          moduleIndex,
          lessonIndex,
          quizType: "lesson",
          type: "subjective",
          question: q.question,
          suggestedAnswer: q.suggestedAnswer || "",
        }
      }
    })

    return questions
  } catch (error) {
    console.error("Error generating lesson quiz questions:", error)
    throw new Error("Failed to generate quiz questions. Please try again.")
  }
}

/**
 * Generate a single subjective question
 */
async function generateSubjectiveQuestion(
  courseTitle: string,
  moduleTitle: string,
  lessonTitle: string,
  lessonDescription: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number
): Promise<QuizQuestion> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
  const prompt = `Generate 1 subjective (open-ended) quiz question for the lesson "${lessonTitle}" in the module "${moduleTitle}" of the course "${courseTitle}".

Lesson Description: ${lessonDescription}

Requirements:
- Generate 1 subjective question (open-ended text question)
- Question should test deep understanding of the lesson content
- Provide a suggested answer that demonstrates good understanding

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "question": "Question text here",
  "suggestedAnswer": "A comprehensive answer that demonstrates good understanding of the concept"
}

Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const data = JSON.parse(jsonText) as { question: string; suggestedAnswer: string }
    const questionId = uuidv4()

    return {
      questionId,
      courseId,
      moduleIndex,
      lessonIndex,
      quizType: "module",
      type: "subjective",
      question: data.question,
      suggestedAnswer: data.suggestedAnswer || "",
    }
  } catch (error) {
    console.error("Error generating subjective question:", error)
    throw new Error("Failed to generate subjective question")
  }
}

/**
 * Generate quiz questions for a module (aggregates from all lessons)
 */
export async function generateModuleQuizQuestions(
  courseData: CourseData,
  moduleIndex: number,
  courseId: string,
  count: number = 8
): Promise<QuizQuestion[]> {
  const module = courseData.modules[moduleIndex]
  if (!module) {
    throw new Error("Module not found")
  }

  // Generate questions from each lesson in the module (objective only)
  const objectiveCount = count - 1 // Reserve 1 for subjective
  const questionsPerLesson = Math.ceil(objectiveCount / module.lessons.length)
  const allQuestions: QuizQuestion[] = []

  for (let i = 0; i < module.lessons.length; i++) {
    const lesson = module.lessons[i]
    try {
      const lessonQuestions = await generateLessonQuizQuestions(
        courseData.title,
        module.title,
        lesson.title,
        lesson.content,
        courseId,
        moduleIndex,
        i,
        questionsPerLesson
      )
      allQuestions.push(...lessonQuestions)
    } catch (error) {
      console.error(`Error generating questions for lesson ${i}:`, error)
    }
  }

  // Add 1 subjective question from a random lesson in the module
  try {
    const randomLessonIndex = Math.floor(Math.random() * module.lessons.length)
    const randomLesson = module.lessons[randomLessonIndex]
    const subjectiveQuestion = await generateSubjectiveQuestion(
      courseData.title,
      module.title,
      randomLesson.title,
      randomLesson.content,
      courseId,
      moduleIndex,
      randomLessonIndex
    )
    subjectiveQuestion.quizType = "module"
    allQuestions.push(subjectiveQuestion)
  } catch (error) {
    console.error("Error generating subjective question for module:", error)
  }

  // Randomly select the desired count
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * Generate quiz questions for an entire course
 */
export async function generateCourseQuizQuestions(
  courseData: CourseData,
  courseId: string,
  count: number = 18
): Promise<QuizQuestion[]> {
  // Generate questions from all modules (objective only)
  const objectiveCount = count - 2 // Reserve 2 for subjective
  const totalLessons = courseData.modules.reduce((sum, m) => sum + m.lessons.length, 0)
  const questionsPerLesson = Math.ceil(objectiveCount / totalLessons)
  const allQuestions: QuizQuestion[] = []

  for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex++) {
    const module = courseData.modules[moduleIndex]
    for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
      const lesson = module.lessons[lessonIndex]
      try {
        const lessonQuestions = await generateLessonQuizQuestions(
          courseData.title,
          module.title,
          lesson.title,
          lesson.content,
          courseId,
          moduleIndex,
          lessonIndex,
          questionsPerLesson
        )
        allQuestions.push(...lessonQuestions)
      } catch (error) {
        console.error(`Error generating questions for module ${moduleIndex}, lesson ${lessonIndex}:`, error)
      }
    }
  }

  // Add 2 subjective questions from random lessons
  const allLessons: Array<{ moduleIndex: number; lessonIndex: number; lesson: any }> = []
  for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex++) {
    const module = courseData.modules[moduleIndex]
    for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
      allLessons.push({ moduleIndex, lessonIndex, lesson: module.lessons[lessonIndex] })
    }
  }

  // Shuffle and pick 2 random lessons for subjective questions
  const shuffledLessons = [...allLessons].sort(() => Math.random() - 0.5)
  const selectedLessons = shuffledLessons.slice(0, 2)

  for (const { moduleIndex, lessonIndex, lesson } of selectedLessons) {
    try {
      const subjectiveQuestion = await generateSubjectiveQuestion(
        courseData.title,
        courseData.modules[moduleIndex].title,
        lesson.title,
        lesson.content,
        courseId,
        moduleIndex,
        lessonIndex
      )
      subjectiveQuestion.quizType = "course"
      allQuestions.push(subjectiveQuestion)
    } catch (error) {
      console.error(`Error generating subjective question for module ${moduleIndex}, lesson ${lessonIndex}:`, error)
    }
  }

  // Randomly select the desired count
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * Evaluate a subjective answer using AI
 */
export async function evaluateSubjectiveAnswer(
  question: string,
  userAnswer: string,
  suggestedAnswer: string
): Promise<{ correct: boolean; feedback: string; score: number }> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Evaluate the student's answer to this question:

Question: ${question}

Suggested Answer (reference): ${suggestedAnswer}

Student's Answer: ${userAnswer}

Evaluate whether the student's answer demonstrates understanding of the concept. Consider:
- Does it show comprehension of key concepts?
- Is it factually correct?
- Does it address the question adequately?
- It doesn't need to match the suggested answer exactly, but should demonstrate understanding

Return ONLY valid JSON without markdown formatting:
{
  "correct": true/false,
  "feedback": "Brief feedback explaining what was good or what was missing",
  "score": 0-1 (1 for correct/good answer, 0.5-0.9 for partially correct, 0-0.4 for incorrect)
}

Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const evaluation = JSON.parse(jsonText) as { correct: boolean; feedback: string; score: number }
    
    // Calculate marks based on score: 2-4 marks for subjective questions
    // Score 0.9-1.0 = 4 marks, 0.7-0.89 = 3 marks, 0.5-0.69 = 2 marks, <0.5 = 0 marks
    let marks = 0
    if (evaluation.score >= 0.9) {
      marks = 4
    } else if (evaluation.score >= 0.7) {
      marks = 3
    } else if (evaluation.score >= 0.5) {
      marks = 2
    }
    
    return {
      correct: evaluation.score >= 0.5, // Threshold for "correct" (at least partial credit)
      feedback: evaluation.feedback,
      score: marks, // Return marks instead of raw score
    }
  } catch (error) {
    console.error("Error evaluating subjective answer:", error)
    // Default to incorrect if evaluation fails
    return {
      correct: false,
      feedback: "Unable to evaluate answer. Please try again.",
      score: 0,
    }
  }
}

/**
 * Check if user's objective answer is correct
 */
export function checkObjectiveAnswer(question: QuizQuestion, userAnswer: string | number | boolean | undefined): boolean {
  // Note: correctAnswer can validly be `0` (first option) or `false` (False). Don't treat falsy as missing.
  if (question.correctAnswer === undefined || question.correctAnswer === null || userAnswer === undefined || userAnswer === null || userAnswer === "") {
    return false
  }

  // First, try simple case-insensitive string comparison (handles most cases)
  if (typeof question.correctAnswer === "string" && typeof userAnswer === "string") {
    if (question.correctAnswer.trim().toLowerCase() === userAnswer.trim().toLowerCase()) {
      return true
    }
  }

  // Handle different answer types
  if (question.objectiveType === "multiple-choice") {
    // Normalize both answers to numbers for comparison
    let correctNum: number
    if (typeof question.correctAnswer === "number") {
      correctNum = question.correctAnswer
    } else if (typeof question.correctAnswer === "string") {
      // Try parsing as number first
      const parsed = parseInt(question.correctAnswer)
      if (!isNaN(parsed)) {
        correctNum = parsed
      } else {
        // If it's a string like "Option 1", try to find the index in options
        const index = question.options?.findIndex(opt => opt === question.correctAnswer)
        correctNum = index !== undefined && index !== -1 ? index : -1
      }
    } else {
      return false
    }
    
    let userNum: number
    if (typeof userAnswer === "number") {
      userNum = userAnswer
    } else if (typeof userAnswer === "string") {
      // Try parsing as number first
      const parsed = parseInt(userAnswer)
      if (!isNaN(parsed)) {
        userNum = parsed
      } else {
        // If it's a string like "Option 1", try to find the index in options
        const index = question.options?.findIndex(opt => opt === userAnswer)
        userNum = index !== undefined && index !== -1 ? index : -1
      }
    } else {
      return false
    }
    
    // Compare as numbers
    if (correctNum === userNum && correctNum !== -1) {
      return true
    }
    
    // Fallback: if both are strings, compare directly (case-insensitive)
    if (typeof question.correctAnswer === "string" && typeof userAnswer === "string") {
      const correctStr = question.correctAnswer.trim().toLowerCase()
      const userStr = userAnswer.trim().toLowerCase()
      if (correctStr === userStr) return true
      
      // Also try to match by option text if options exist
      if (question.options) {
        const correctIndex = question.options.findIndex(opt => opt.trim().toLowerCase() === correctStr)
        const userIndex = question.options.findIndex(opt => opt.trim().toLowerCase() === userStr)
        if (correctIndex !== -1 && userIndex !== -1 && correctIndex === userIndex) {
          return true
        }
      }
    }
    
    // Additional fallback: compare option texts directly if user answer is text
    if (question.options && typeof userAnswer === "string") {
      const correctOption = typeof question.correctAnswer === "number" 
        ? question.options[question.correctAnswer]
        : question.correctAnswer
      if (correctOption && typeof correctOption === "string") {
        if (correctOption.trim().toLowerCase() === userAnswer.trim().toLowerCase()) {
          return true
        }
      }
    }
    
    return false
  } else if (question.objectiveType === "true-false") {
    // Simple case-insensitive string comparison first
    if (typeof question.correctAnswer === "string" && typeof userAnswer === "string") {
      if (question.correctAnswer.trim().toLowerCase() === userAnswer.trim().toLowerCase()) {
        return true
      }
    }
    
    // Normalize boolean values - handle all variations (case-insensitive)
    const normalizeToBool = (value: any): boolean | null => {
      // Handle boolean directly
      if (value === true || value === 1) return true
      if (value === false || value === 0) return false
      
      // Handle string values (case-insensitive)
      if (typeof value === "string") {
        const lower = value.toLowerCase().trim()
        if (lower === "true" || lower === "1" || lower === "yes") return true
        if (lower === "false" || lower === "0" || lower === "no") return false
      }
      
      return null
    }
    
    const correctBool = normalizeToBool(question.correctAnswer)
    const userBool = normalizeToBool(userAnswer)
    
    // If either normalization failed, try direct comparison
    if (correctBool === null || userBool === null) {
      // Try direct comparison (handles boolean-to-boolean, string-to-string)
      if (question.correctAnswer === userAnswer) return true
      
      // Try case-insensitive string comparison (already done above, but keep as fallback)
      if (typeof question.correctAnswer === "string" && typeof userAnswer === "string") {
        return question.correctAnswer.toLowerCase().trim() === userAnswer.toLowerCase().trim()
      }
      
      // Try converting both to strings and comparing
      const correctStr = String(question.correctAnswer).toLowerCase().trim()
      const userStr = String(userAnswer).toLowerCase().trim()
      if (correctStr === "true" && userStr === "true") return true
      if (correctStr === "false" && userStr === "false") return true
      
      return false
    }
    
    return correctBool === userBool
  }

  return false
}
