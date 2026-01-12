import { GoogleGenerativeAI, Tool, SchemaType } from "@google/generative-ai"

interface PageContext {
  title: string
  description: string
  data?: any
  type?: string
}

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

if (!apiKey) {
  console.warn("NEXT_PUBLIC_GEMINI_API_KEY is not set")
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export interface CourseModule {
  title: string
  description: string
  content: string
  duration: string
  lessons: {
    title: string
    content?: string
    duration: string
  }[]
  accumulatedContext?: Array<{
    id: string
    text: string
    sourceLessonId: string
    sourceLessonTitle: string
  }>
}

export interface CourseData {
  title: string
  description: string
  modules: CourseModule[]
  estimatedDuration: string
  difficulty: "beginner" | "intermediate" | "expert"
  xpMultiplier: number
  tags?: string[]
  imageUrl?: string
  imageKey?: string
}

export interface DifficultyOption {
  level: "beginner" | "intermediate" | "expert"
  title: string
  modules: number
  lessonsPerModule: number[]
  xpMultiplier: number
}

export interface TopicDifficultyAnalysis {
  hasVariableDifficulty: boolean
  options?: DifficultyOption[]
  title?: string
  difficulty?: "beginner" | "intermediate" | "expert"
  modules?: number
  lessonsPerModule?: number[]
  xpMultiplier?: number
  errorType?: "gibberish" | "too_broad" | "too_simple" | "invalid"
  errorMessage?: string
}

export interface LessonSlide {
  title: string
  content: string | any
  type: "text" | "heading" | "bullet" | "code" | "example"
}

export interface LessonContent {
  slides: LessonSlide[]
}

export interface TextBlock {
  type: "text"
  content: string
}

export interface SwipeInteraction {
  type: "swipe"
  question: string
  options: Array<{ label: string; isCorrect: boolean }>
  explanation: string
}

export interface ReorderInteraction {
  type: "reorder"
  question: string
  items: Array<{ id: string; text: string }>
  correctOrder: string[]
}

export interface FillBlankInteraction {
  type: "fill_blank"
  content: string
  options: string[]
  correctAnswer: string
}

export interface BugHunterInteraction {
  type: "bug_hunter"
  question: string
  lines: Array<{ id: number; text: string }>
  correctLineId: number
  explanation: string
}

export interface MatchingInteraction {
  type: "matching"
  pairs: Array<{ left: string; right: string }>
}

export interface ChatSimInteraction {
  type: "chat_sim"
  scenario: string
  messages: Array<{
    sender: "bot" | "user_options"
    text?: string
    options?: Array<{ text: string; isCorrect: boolean; feedback: string }>
  }>
}

export type InteractionBlock = SwipeInteraction | ReorderInteraction | FillBlankInteraction | BugHunterInteraction | MatchingInteraction | ChatSimInteraction

export type LessonStreamBlock = TextBlock | InteractionBlock

export interface LessonStream {
  blocks: LessonStreamBlock[]
  facts: Array<{ id: string; text: string }>
}

/**
 * Analyze if a topic has variable difficulty and suggest course options
 */
export async function analyzeTopicDifficulty(topic: string): Promise<TopicDifficultyAnalysis> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Analyze the topic "${topic}" and determine if it is a valid educational topic and how it can be structured.

1. If the input is gibberish, nonsense, or has extreme spelling errors (e.g., "guei", "asdf"), return:
{
  "hasVariableDifficulty": false,
  "errorType": "gibberish",
  "errorMessage": "This topic seems unclear. Please check your spelling or try a different term."
}

2. If the topic is way too broad to be a single course (e.g., "house", "life", "world", "thing"), return:
{
  "hasVariableDifficulty": false,
  "errorType": "too_broad",
  "errorMessage": "This topic is very broad. Could you please provide more detail or specify a sub-topic (e.g., 'Modern House Architecture' instead of 'house')?"
}

3. If the topic is complex enough to have variable difficulty (beginner, intermediate, expert), return:
{
  "hasVariableDifficulty": true,
  "options": [
    {
      "level": "beginner",
      "title": "Course title for beginner level",
      "modules": 3,
      "lessonsPerModule": [2, 3, 2],
      "xpMultiplier": 1.0
    },
    {
      "level": "intermediate",
      "title": "Course title for intermediate level",
      "modules": 4,
      "lessonsPerModule": [3, 4, 3, 4],
      "xpMultiplier": 1.5
    },
    {
      "level": "expert",
      "title": "Course title for expert level",
      "modules": 5,
      "lessonsPerModule": [4, 6, 5, 6, 5],
      "xpMultiplier": 2.0
    }
  ]
}

4. If the topic is valid but simple/specific (e.g., "how to bake a cake", "basic arithmetic"), return:
{
  "hasVariableDifficulty": false,
  "title": "Single course title",
  "difficulty": "beginner",
  "modules": 3,
  "lessonsPerModule": [2, 3, 2],
  "xpMultiplier": 1.0
}

Requirements:
- Beginner: 3 modules, 2-3 lessons per module, 1.0x multiplier
- Intermediate: 4 modules, 3-4 lessons per module, 1.5x multiplier
- Expert: 5 modules, 4-6 lessons per module, 2.0x multiplier
- If no variable difficulty, determine appropriate difficulty level and structure
- Return ONLY valid JSON without markdown formatting`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Clean the response
    let jsonText = text.trim()
    
    // Extract JSON between { and } or [ and ] for robustness
    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const analysis = JSON.parse(jsonText) as TopicDifficultyAnalysis
    return analysis
  } catch (error) {
    console.error("Error analyzing topic difficulty:", error)
    throw new Error("Failed to analyze topic difficulty. Please try again.")
  }
}

/**
 * Generate course skeleton (module and lesson titles only, no content)
 */
export async function generateCourseSkeleton(
  topic: string,
  difficulty: "beginner" | "intermediate" | "expert",
  moduleCount: number,
  lessonCounts: number[]
): Promise<CourseData> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const xpMultiplier = difficulty === "beginner" ? 1.0 : difficulty === "intermediate" ? 1.5 : 2.0

  const prompt = `Generate a course skeleton for "${topic}" at ${difficulty} level.

Course Structure:
- ${moduleCount} modules
- Lesson counts per module: ${lessonCounts.join(", ")}

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "title": "Course Title",
  "description": "Brief course description",
  "estimatedDuration": "X hours",
  "difficulty": "${difficulty}",
  "xpMultiplier": ${xpMultiplier},
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "modules": [
    {
      "title": "Module Title",
      "description": "Module description",
      "content": "Module overview content",
      "duration": "X hours",
      "lessons": [
        {
          "title": "Lesson Title",
          "duration": "X minutes"
        }
      ]
    }
  ]
}

Requirements:
- Generate ONLY module titles and lesson titles (NO lesson content)
- Generate 3-5 relevant tags
- Tags should be lowercase, single words or short phrases
- Make sure titles are educational and well-structured
- Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Clean the response
    let jsonText = text.trim()
    
    // Extract JSON between { and } or [ and ] for robustness
    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const courseData = JSON.parse(jsonText) as CourseData
    // Ensure xpMultiplier is set correctly
    courseData.xpMultiplier = xpMultiplier
    courseData.difficulty = difficulty
    // Ensure lessons don't have content (skeleton only)
    courseData.modules.forEach(module => {
      module.lessons.forEach(lesson => {
        delete (lesson as any).content
      })
    })
    return courseData
  } catch (error) {
    console.error("Error generating course skeleton:", error)
    throw new Error("Failed to generate course skeleton. Please try again.")
  }
}

export async function generateCourseContent(topic: string, difficulty?: "beginner" | "intermediate" | "expert", moduleCount?: number, lessonCounts?: number[]): Promise<CourseData> {
  // If difficulty and structure provided, use skeleton generation
  if (difficulty && moduleCount && lessonCounts) {
    return generateCourseSkeleton(topic, difficulty, moduleCount, lessonCounts)
  }

  // Legacy fallback for backward compatibility
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Generate a comprehensive course structure for "${topic}" in JSON format. The course should have 3-5 modules, each with 2-4 lessons. Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "title": "Course Title",
  "description": "Brief course description",
  "estimatedDuration": "X hours",
  "difficulty": "beginner",
  "xpMultiplier": 1.0,
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "modules": [
    {
      "title": "Module Title",
      "description": "Module description",
      "content": "Module overview content",
      "duration": "X hours",
      "lessons": [
        {
          "title": "Lesson Title",
          "content": "Brief lesson description (1-2 sentences)",
          "duration": "X minutes"
        }
      ]
    }
  ]
}

Requirements:
- Generate 3-5 relevant tags that describe the course topic, skills, or subject areas
- Tags should be single words or short phrases (1-2 words)
- Tags should be lowercase
- Make sure the content is educational, well-structured, and suitable for learning
- Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Clean the response - remove markdown code blocks if present
    let jsonText = text.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const courseData = JSON.parse(jsonText) as CourseData
    // Ensure required fields are set
    if (!courseData.xpMultiplier) {
      courseData.xpMultiplier = 1.0
    }
    if (!courseData.difficulty || !["beginner", "intermediate", "expert"].includes(courseData.difficulty)) {
      courseData.difficulty = "beginner"
    }
    return courseData
  } catch (error) {
    console.error("Error generating course content:", error)
    throw new Error("Failed to generate course content. Please try again.")
  }
}

/**
 * Generate lesson stream with interactive blocks and facts
 */
export async function generateLessonStream(
  lessonTitle: string,
  courseTitle: string,
  moduleTitle: string
): Promise<LessonStream> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Generate a lesson stream for "${lessonTitle}" as part of the course "${courseTitle}", module "${moduleTitle}".

Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "blocks": [
    {
      "type": "text",
      "content": "Explanatory text content (markdown supported)"
    },
    {
      "type": "swipe",
      "question": "True or False question",
      "options": [
        { "label": "True", "isCorrect": true },
        { "label": "False", "isCorrect": false }
      ],
      "explanation": "Explanation of the correct answer"
    },
    {
      "type": "reorder",
      "question": "Arrange the steps in correct order:",
      "items": [
        { "id": "1", "text": "Step 1" },
        { "id": "2", "text": "Step 2" }
      ],
      "correctOrder": ["1", "2"]
    },
    {
      "type": "fill_blank",
      "content": "To define a variable that CANNOT be reassigned, use [BLANK].",
      "options": ["var", "let", "const"],
      "correctAnswer": "const"
    },
    {
      "type": "bug_hunter",
      "question": "Which line causes an error?",
      "lines": [
        { "id": 1, "text": "line 1 code" },
        { "id": 2, "text": "line 2 code" }
      ],
      "correctLineId": 2,
      "explanation": "Explanation of the bug"
    },
    {
      "type": "matching",
      "pairs": [
        { "left": "Term A", "right": "Definition A" },
        { "left": "Term B", "right": "Definition B" }
      ]
    },
    {
      "type": "chat_sim",
      "scenario": "Scenario description",
      "messages": [
        { "sender": "bot", "text": "Bot message" },
        {
          "sender": "user_options",
          "options": [
            { "text": "Option 1", "isCorrect": true, "feedback": "Good!" },
            { "text": "Option 2", "isCorrect": false, "feedback": "Try again" }
          ]
        }
      ]
    }
  ],
  "facts": [
    { "id": "fact_1", "text": "Indisputable fact 1" },
    { "id": "fact_2", "text": "Indisputable fact 2" }
  ]
}

Requirements:
- Start with a substantial TextBlock that introduces the core concepts and provides the necessary context/answers for the first interaction block. Do NOT just provide a generic introduction; provide actual educational content.
- Follow with an InteractionBlock that tests the specific concept explained in the immediately preceding text block.
- Every TextBlock MUST provide the specific information needed to solve the interaction that follows it.
- Repeat this pattern 3-4 times (text → interaction → text → interaction...)
- IMPORTANT: Randomize the order of interaction types - do NOT follow the example order. Mix them up so different interaction types appear at different positions in each lesson.
- Generate exactly 7 indisputable facts in the "facts" array
- Use all 6 interaction types appropriately: swipe, reorder, fill_blank, bug_hunter, matching, chat_sim
- Each interaction MUST test the concept from the immediately preceding text block
- Make content educational, engaging, and suitable for learning
- Return only the JSON object.`

  try {
    // Add timeout handling (60 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Generation timeout - checking Firestore...")), 60000)
    })

    const generationPromise = (async () => {
      const result = await model.generateContent(prompt)
      const response = await result.response
      const text = response.text()

      // Clean the response
      let jsonText = text.trim()
      
      // Extract JSON between { and } or [ and ] for robustness
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      const firstBracket = jsonText.indexOf('[')
      const lastBracket = jsonText.lastIndexOf(']')

      if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      } else if (firstBracket !== -1 && lastBracket !== -1) {
        jsonText = jsonText.substring(firstBracket, lastBracket + 1)
      } else if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
      }

      const lessonStream = JSON.parse(jsonText) as LessonStream
      return lessonStream
    })()

    // Race between generation and timeout
    return await Promise.race([generationPromise, timeoutPromise])
  } catch (error: any) {
    // If timeout occurred, the error message will indicate it
    // The UI layer will handle Firestore double-check
    console.error("Error generating lesson stream:", error)
    throw error
  }
}

export async function generateLessonContent(
  courseTitle: string,
  moduleTitle: string,
  lessonTitle: string,
  lessonDescription: string
): Promise<LessonContent> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Generate a detailed lesson content for "${lessonTitle}" as part of the course "${courseTitle}", module "${moduleTitle}".

Lesson Description: ${lessonDescription}

Create educational slides in JSON format. Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "slides": [
    {
      "title": "Slide Title",
      "content": "Detailed educational content for this slide (3-5 paragraphs or bullet points)",
      "type": "text"
    }
  ]
}

Requirements:
- Generate 5-8 slides for this lesson
- Each slide should have a clear title and comprehensive content
- The "content" field MUST be a plain text string, NOT an object or array
- Mix slide types: "text", "heading", "bullet", "code", "example"
- Make it educational, well-structured, and engaging
- Content should be suitable for learning
- Format bullet points and lists as plain text with line breaks, not as JSON objects

Return only the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Clean the response - remove markdown code blocks if present
    let jsonText = text.trim()
    
    // Extract JSON between { and } or [ and ] for robustness
    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const lessonContent = JSON.parse(jsonText) as LessonContent
    
    // Normalize content to strings - handle cases where Gemini returns objects
    lessonContent.slides = lessonContent.slides.map((slide) => ({
      ...slide,
      title: typeof slide.title === "string" ? slide.title : String(slide.title),
      content:
        typeof slide.content === "string"
          ? slide.content
          : typeof slide.content === "object"
            ? JSON.stringify(slide.content, null, 2)
            : String(slide.content),
    }))
    
    return lessonContent
  } catch (error) {
    console.error("Error generating lesson content:", error)
    throw new Error("Failed to generate lesson content. Please try again.")
  }
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Generate a chat response from Gemini AI based on user message and page context
 */
export async function generateChatResponse(
  userMessage: string,
  pageContext: PageContext | null,
  conversationHistory: ChatMessage[] = [],
  currentUserId?: string
): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  // Use gemini-1.5-flash for faster responses and tool support
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite",
    tools: [
      {
        functionDeclarations: [
          {
            name: "getUserQuizHistory",
            description: "Get user's past quiz attempts and results",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                userId: { type: SchemaType.STRING, description: "The ID of the user" },
              },
              required: ["userId"],
            },
          },
          {
            name: "getUserJourneyProgress",
            description: "Get all courses in the user's journey with their progress",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                userId: { type: SchemaType.STRING, description: "The ID of the user" },
              },
              required: ["userId"],
            },
          },
          {
            name: "getDailyQuests",
            description: "Get the current daily quests for the user",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                userId: { type: SchemaType.STRING, description: "The ID of the user" },
              },
              required: ["userId"],
            },
          },
          {
            name: "getUserXPHistory",
            description: "Get the XP earning history for the user",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                userId: { type: SchemaType.STRING, description: "The ID of the user" },
              },
              required: ["userId"],
            },
          },
          {
            name: "getUserNexonHistory",
            description: "Get the Nexon transaction history for the user",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                userId: { type: SchemaType.STRING, description: "The ID of the user" },
              },
              required: ["userId"],
            },
          },
          {
            name: "searchCommunityCourses",
            description: "Search for public courses in the community library",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: { type: SchemaType.STRING, description: "Search query or keywords" },
              },
              required: ["query"],
            },
          },
          {
            name: "getQuizCorrectAnswer",
            description: "Get the correct answer for a quiz question to provide a hint (only during quiz)",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                questionId: { type: SchemaType.STRING, description: "The ID of the question" },
              },
              required: ["questionId"],
            },
          },
        ],
      },
    ],
  })

  // Build system context string
  const systemContextString = pageContext
    ? `[SYSTEM CONTEXT]
Current Page: ${pageContext.title}
Page Description: ${pageContext.description}${pageContext.data ? `\nPage Data: ${JSON.stringify(pageContext.data, null, 2)}` : ""}${currentUserId ? `\nCurrent User ID: ${currentUserId}` : ""}`
    : `[SYSTEM CONTEXT]
Current Page: Unknown (Context not set)
Page Description: The page context has not been set. Ask the user where they are or what they're looking at to provide better assistance.${currentUserId ? `\nCurrent User ID: ${currentUserId}` : ""}`

  // Build system prompt
  const systemPrompt = `You are Nexus, a helpful and friendly AI assistant for NexusLearn. You help students understand course content, answer questions, explain concepts, and provide educational support.

Instructions:
- Be clear, concise, and educational
- Use a friendly and encouraging tone
- Break down complex concepts into simpler terms
- Provide examples when helpful
- If the student asks about quiz questions they got wrong, explain why the correct answer is correct and help them understand the concept
- If the student asks to summarize content, provide a clear and structured summary
- Stay focused on the current context when relevant
- If the context doesn't provide enough information to answer, use the provided tools to fetch user data if applicable
- IMPORTANT: When a user asks for help/hint during a quiz, use getQuizCorrectAnswer to find the answer but DO NOT give it directly. Provide a HINT that guides them.
- You can access the user's data (quiz history, journey progress, quests, etc.) using your tools.
- Never show raw JSON data to the user. Format it nicely.

Respond naturally and conversationally.`

  // Start chat with history
  const chat = model.startChat({
    history: conversationHistory.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
  })

  // Build the first message with context and user message
  const initialPrompt = `${systemPrompt}\n\n${systemContextString}\n\n[USER QUESTION]\n${userMessage}`

  try {
    let result = await chat.sendMessage(initialPrompt)
    let response = result.response
    
    // Handle function calls if any
    const calls = response.functionCalls()
    if (calls && calls.length > 0) {
      const toolResults: any[] = []
      
      for (const call of calls) {
        const { name, args } = call
        console.log(`[Chatbot] Tool call: ${name}`, args)
        
        let toolData: any = null
        try {
const { 
            getUserQuizHistory, 
            getUserJourneyProgress, 
            getDailyQuests, 
            getUserXPHistory, 
            getUserNexonHistory, 
            searchCommunityCourses,
            getQuizCorrectAnswer 
          } = await import("./chatbot-tools")

          if (!currentUserId) throw new Error("User ID is required for tool calls")

          const typedArgs = args as any

          switch (name) {
            case "getUserQuizHistory":
              toolData = await getUserQuizHistory(typedArgs.userId as string, currentUserId)
              break
            case "getUserJourneyProgress":
              toolData = await getUserJourneyProgress(typedArgs.userId as string, currentUserId)
              break
            case "getDailyQuests":
              toolData = await getDailyQuests(typedArgs.userId as string, currentUserId)
              break
            case "getUserXPHistory":
              toolData = await getUserXPHistory(typedArgs.userId as string, currentUserId)
              break
            case "getUserNexonHistory":
              toolData = await getUserNexonHistory(typedArgs.userId as string, currentUserId)
              break
            case "searchCommunityCourses":
              toolData = await searchCommunityCourses(typedArgs.query as string)
              break
            case "getQuizCorrectAnswer":
              toolData = await getQuizCorrectAnswer(typedArgs.questionId as string)
              break
          }
        } catch (toolErr) {
          console.error(`Error executing tool ${name}:`, toolErr)
          toolData = { error: toolErr instanceof Error ? toolErr.message : "Tool execution failed" }
        }
        
        toolResults.push({
          functionResponse: {
            name,
            response: { content: toolData },
          },
        })
      }
      
      // Send tool results back to model
      result = await chat.sendMessage(toolResults)
      response = result.response
    }

    return response.text().trim()
  } catch (error) {
    console.error("Error generating chat response:", error)
    throw new Error("Failed to generate response. Please try again.")
  }
}

/**
 * Generate course name suggestions based on user's library courses
 * Returns an array of suggested course names/topics
 */
export async function generateCourseSuggestions(courseTitles: string[], count: number = 3): Promise<string[]> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  if (courseTitles.length === 0) {
    return []
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const coursesList = courseTitles.join(", ")

  const prompt = `Based on these courses the user has in their library: ${coursesList}

Generate exactly ${count} related course name suggestions that would be good next steps for learning. 
Return ONLY a JSON array of course names, like this:
["Course Name 1", "Course Name 2", "Course Name 3"]

Make the suggestions:
- Related to the topics in the user's library
- Logical next steps in learning progression
- Specific and actionable course titles
- Return only the JSON array, no markdown, no explanation`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Clean the response - remove markdown code blocks if present
    let jsonText = text.trim()
    
    // Extract JSON between { and } or [ and ] for robustness
    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    } else if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const suggestions = JSON.parse(jsonText) as string[]
    return Array.isArray(suggestions) ? suggestions : []
  } catch (error) {
    console.error("Error generating course suggestions:", error)
    return []
  }
}

