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
    // Add timeout handling (60 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Generation timeout - checking Firestore...")), 60000)
    })

    const generationPromise = (async () => {
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
    })()
    
    // Race between generation and timeout
    return await Promise.race([generationPromise, timeoutPromise])
  } catch (error: any) {
    // If timeout occurred, the error message will indicate it
    // The UI layer will handle Firestore double-check
    console.error("Error generating lesson quiz questions:", error)
    throw error
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
 * Generate quiz questions for a module using accumulatedContext
 */
export async function generateModuleQuizQuestions(
  courseData: CourseData,
  moduleIndex: number,
  courseId: string,
  count: number = 10
): Promise<QuizQuestion[]> {
  const module = courseData.modules[moduleIndex]
  if (!module) {
    throw new Error("Module not found")
  }

  // Use accumulatedContext if available, otherwise fallback to old method
  const accumulatedContext = (module as any).accumulatedContext || []
  
  if (accumulatedContext.length === 0) {
    // Fallback: generate from lesson content (legacy support)
    const objectiveCount = count - 1
    const questionsPerLesson = Math.ceil(objectiveCount / module.lessons.length)
    const allQuestions: QuizQuestion[] = []

    for (let i = 0; i < module.lessons.length; i++) {
      const lesson = module.lessons[i]
      try {
        const lessonQuestions = await generateLessonQuizQuestions(
          courseData.title,
          module.title,
          lesson.title,
          lesson.content || "",
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

    // Add 1 subjective question
    try {
      const randomLessonIndex = Math.floor(Math.random() * module.lessons.length)
      const randomLesson = module.lessons[randomLessonIndex]
      const subjectiveQuestion = await generateSubjectiveQuestion(
        courseData.title,
        module.title,
        randomLesson.title,
        randomLesson.content || "",
        courseId,
        moduleIndex,
        randomLessonIndex
      )
      subjectiveQuestion.quizType = "module"
      allQuestions.push(subjectiveQuestion)
    } catch (error) {
      console.error("Error generating subjective question for module:", error)
    }

    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  // New method: Use accumulatedContext
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
  
  // Prepare facts text with IDs
  const factsText = accumulatedContext.map((fact: any) => 
    `[ID: ${fact.id}] ${fact.text}`
  ).join("\n")

  const prompt = `Generate ${count} quiz questions for a module quiz based on these facts:

${factsText}

Requirements:
- Generate ${count - 1} objective questions (mix of multiple-choice, true/false, and code spotting)
- Generate 1 subjective scenario question that combines multiple concepts
- For objective questions: provide 4 options for multiple-choice, or ["True", "False"] for true/false
- For the subjective question: provide a strict grading rubric with keywords
- Questions should test understanding of the facts provided
- Vary question types: definitions, code spotting, true/false, scenario-based
- IMPORTANT: For "sourceFactId" (objective) and "sourceFactIds" (subjective), use the exact fact IDs shown above in brackets (e.g., "fact_1", "fact_2"). These IDs must match exactly.

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "questions": [
    {
      "type": "objective",
      "objectiveType": "multiple-choice" | "true-false",
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"] or ["True", "False"],
      "correctAnswer": "Option 1" or 0 (for first option) or true/false,
      "sourceFactId": "fact_id_from_context" (must match one of the IDs shown above)
    },
    {
      "type": "subjective",
      "question": "Scenario question that combines concepts",
      "suggestedAnswer": "Comprehensive answer",
      "rubric": {
        "keywords": ["keyword1", "keyword2", "keyword3"],
        "maxMarks": 4
      },
      "sourceFactIds": ["fact_id_1", "fact_id_2"] (must match IDs shown above)
    }
  ]
}`

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

    const data = JSON.parse(jsonText)
    const questions: QuizQuestion[] = data.questions.map((q: any, index: number) => ({
      questionId: `${courseId}-module-${moduleIndex}-${Date.now()}-${index}`,
      courseId,
      moduleIndex,
      lessonIndex: null,
      quizType: "module",
      type: q.type,
      objectiveType: q.objectiveType,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      suggestedAnswer: q.suggestedAnswer,
      rubric: q.rubric,
      sourceFactId: q.sourceFactId,
      sourceFactIds: q.sourceFactIds,
    }))

    // Sort: objective first, subjective last (1 subjective question)
    const objectiveQuestions = questions.filter(q => q.type === "objective")
    const subjectiveQuestions = questions.filter(q => q.type === "subjective")
    
    return [...objectiveQuestions, ...subjectiveQuestions]
  } catch (error) {
    console.error("Error generating module quiz questions:", error)
    throw new Error("Failed to generate module quiz questions")
  }
}

/**
 * Generate quiz questions for an entire course using accumulatedContext from all modules
 */
export async function generateCourseQuizQuestions(
  courseData: CourseData,
  courseId: string,
  count: number = 20
): Promise<QuizQuestion[]> {
  // Collect all facts from all modules' accumulatedContext
  const allFacts: Array<{ id: string; text: string; moduleIndex: number }> = []
  for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex++) {
    const module = courseData.modules[moduleIndex]
    const accumulatedContext = (module as any).accumulatedContext || []
    accumulatedContext.forEach((fact: any) => {
      allFacts.push({
        id: fact.id,
        text: fact.text,
        moduleIndex,
      })
    })
  }

  // If no accumulatedContext, fallback to legacy method
  if (allFacts.length === 0) {
    const objectiveCount = count - 2
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
            lesson.content || "",
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

    // Add 2 subjective questions
    const allLessons: Array<{ moduleIndex: number; lessonIndex: number; lesson: any }> = []
    for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex++) {
      const module = courseData.modules[moduleIndex]
      for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
        allLessons.push({ moduleIndex, lessonIndex, lesson: module.lessons[lessonIndex] })
      }
    }

    const shuffledLessons = [...allLessons].sort(() => Math.random() - 0.5)
    const selectedLessons = shuffledLessons.slice(0, 2)

    for (const { moduleIndex, lessonIndex, lesson } of selectedLessons) {
      try {
        const subjectiveQuestion = await generateSubjectiveQuestion(
          courseData.title,
          courseData.modules[moduleIndex].title,
          lesson.title,
          lesson.content || "",
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

    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  // New method: Use accumulatedContext from all modules
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
  
  // Prepare facts text with IDs, grouped by module
  const factsByModule: { [moduleIndex: number]: Array<{ id: string; text: string }> } = {}
  allFacts.forEach(fact => {
    if (!factsByModule[fact.moduleIndex]) {
      factsByModule[fact.moduleIndex] = []
    }
    factsByModule[fact.moduleIndex].push({ id: fact.id, text: fact.text })
  })
  
  const factsText = Object.entries(factsByModule)
    .map(([moduleIdx, facts]) => {
      const module = courseData.modules[parseInt(moduleIdx)]
      const factsWithIds = facts.map(fact => `[ID: ${fact.id}] ${fact.text}`).join("\n")
      return `Module ${parseInt(moduleIdx) + 1}: ${module.title}\n${factsWithIds}`
    })
    .join("\n\n")

  const prompt = `Generate ${count} quiz questions for a final course quiz based on these facts from all modules:

${factsText}

Requirements:
- Generate ${count - 2} objective questions (mix of multiple-choice, true/false, and code spotting)
- Generate 2 subjective scenario questions that combine concepts from multiple modules
- Distribute objective questions evenly across all modules
- For objective questions: provide 4 options for multiple-choice, or ["True", "False"] for true/false
- For subjective questions: provide a strict grading rubric with keywords
- Subjective Scenario A: Create a problem requiring understanding from Module 1 AND Module 3 (or similar cross-module combination)
- Subjective Scenario B: Create a debugging/crisis scenario involving concepts from Module 2 AND Module 4 (and Module 5 if exists)
- Questions should test understanding of the facts provided
- Vary question types: definitions, code spotting, true/false, scenario-based
- IMPORTANT: For "sourceFactId" (objective) and "sourceFactIds" (subjective), use the exact fact IDs shown above in brackets (e.g., "fact_1", "fact_2"). These IDs must match exactly.

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "questions": [
    {
      "type": "objective",
      "objectiveType": "multiple-choice" | "true-false",
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"] or ["True", "False"],
      "correctAnswer": "Option 1" or 0 (for first option) or true/false,
      "sourceFactId": "fact_id_from_context" (must match one of the IDs shown above)
    },
    {
      "type": "subjective",
      "question": "Scenario question combining concepts from multiple modules",
      "suggestedAnswer": "Comprehensive answer",
      "rubric": {
        "keywords": ["keyword1", "keyword2", "keyword3"],
        "maxMarks": 4
      },
      "sourceFactIds": ["fact_id_1", "fact_id_2"] (must match IDs shown above)
    }
  ]
}`

  try {
    // Add timeout handling (60 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Generation timeout - checking Firestore...")), 60000)
    })

    const generationPromise = (async () => {
      const result = await model.generateContent(prompt)
      const response = await result.response
      const text = response.text()

      let jsonText = text.trim()
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
      }

      const data = JSON.parse(jsonText)
      const questions: QuizQuestion[] = data.questions.map((q: any, index: number) => ({
        questionId: `${courseId}-course-${Date.now()}-${index}`,
        courseId,
        moduleIndex: null,
        lessonIndex: null,
        quizType: "course",
        type: q.type,
        objectiveType: q.objectiveType,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        suggestedAnswer: q.suggestedAnswer,
        rubric: q.rubric,
        sourceFactId: q.sourceFactId,
        sourceFactIds: q.sourceFactIds,
      }))

      // Sort: objective first, subjective last (2 subjective questions)
      const objectiveQuestions = questions.filter(q => q.type === "objective")
      const subjectiveQuestions = questions.filter(q => q.type === "subjective")
      
      return [...objectiveQuestions, ...subjectiveQuestions]
    })()

    // Race between generation and timeout
    return await Promise.race([generationPromise, timeoutPromise])
  } catch (error: any) {
    // If timeout occurred, the error message will indicate it
    // The UI layer will handle Firestore double-check
    console.error("Error generating course quiz questions:", error)
    throw error
  }
}

/**
 * Evaluate a subjective answer using AI
 */
export async function evaluateSubjectiveAnswer(
  question: string,
  userAnswer: string,
  suggestedAnswer: string,
  rubric?: { keywords: string[]; maxMarks: number }
): Promise<{ correct: boolean; feedback: string; score: number }> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const rubricText = rubric 
    ? `Grading Rubric:
- Keywords that must be present: ${rubric.keywords.join(", ")}
- Maximum marks: ${rubric.maxMarks}
- Award marks based on keyword presence and answer quality`
    : "Evaluate based on understanding and completeness."

  const prompt = `Evaluate this subjective quiz answer.

Question: ${question}

User's Answer: ${userAnswer}

Suggested Answer: ${suggestedAnswer}

${rubricText}

Return ONLY valid JSON without markdown formatting:
{
  "correct": true/false (true only if answer is fully correct and complete),
  "feedback": "Detailed feedback explaining what's correct/incorrect",
  "score": 0-4 (marks awarded based on rubric, 4 = fully correct)
}`

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

    const evaluation = JSON.parse(jsonText)
    return {
      correct: evaluation.correct === true,
      feedback: evaluation.feedback || "",
      score: evaluation.score || 0,
    }
  } catch (error) {
    console.error("Error evaluating subjective answer:", error)
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

  // Handle boolean answers (true-false)
  if (question.objectiveType === "true-false") {
    const normalizeToBool = (value: any): boolean | null => {
      if (typeof value === "boolean") return value
      if (value === 1 || value === "1" || String(value).toLowerCase().trim() === "true") return true
      if (value === 0 || value === "0" || String(value).toLowerCase().trim() === "false") return false
      return null
    }
    
    const correctBool = normalizeToBool(question.correctAnswer)
    const userBool = normalizeToBool(userAnswer)
    
    if (correctBool !== null && userBool !== null) {
      return correctBool === userBool
    }
  }

  // Handle multiple-choice and general string/number comparison
  
  // 1. Direct comparison
  if (question.correctAnswer === userAnswer) return true

  // 2. Case-insensitive string comparison
  const correctStr = String(question.correctAnswer).trim().toLowerCase()
  const userStr = String(userAnswer).trim().toLowerCase()
  if (correctStr === userStr) return true

  // 3. Multiple-choice specific logic: handle index vs text
  if (question.objectiveType === "multiple-choice" && question.options) {
    // If user provided a number (index), check against both correct index and correct text
    if (typeof userAnswer === "number") {
      // Check if correct answer is this index
      if (String(question.correctAnswer) === String(userAnswer)) return true
      
      // Check if correct answer text matches the option at this index
      const selectedOptionText = question.options[userAnswer]?.trim().toLowerCase()
      if (selectedOptionText && selectedOptionText === correctStr) return true
    }
    
    // If correct answer is a number (index), check if user answer text matches that option
    if (typeof question.correctAnswer === "number") {
      const correctOptionText = question.options[question.correctAnswer]?.trim().toLowerCase()
      if (correctOptionText && correctOptionText === userStr) return true
    }

    // If both are strings but one might be a stringified index
    const userIdx = parseInt(userStr)
    const correctIdx = parseInt(correctStr)

    // Only use parseInt if the entire string is a number to avoid "3x3" -> 3 bug
    const isPureNumber = (s: string) => /^\d+$/.test(s)

    if (isPureNumber(userStr) && typeof question.correctAnswer === "number") {
      if (parseInt(userStr) === question.correctAnswer) return true
    }
    if (isPureNumber(correctStr) && typeof userAnswer === "number") {
      if (parseInt(correctStr) === userAnswer) return true
    }
  }

  return false
}
