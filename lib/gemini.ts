import { GoogleGenerativeAI } from "@google/generative-ai"
import { PageContext, formatContextForAI } from "./chatbot-context"

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
    content: string
    duration: string
  }[]
}

export interface CourseData {
  title: string
  description: string
  modules: CourseModule[]
  estimatedDuration: string
  difficulty: string
  tags?: string[]
}

export interface LessonSlide {
  title: string
  content: string | any
  type: "text" | "heading" | "bullet" | "code" | "example"
}

export interface LessonContent {
  slides: LessonSlide[]
}

export async function generateCourseContent(topic: string): Promise<CourseData> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const prompt = `Generate a comprehensive course structure for "${topic}" in JSON format. The course should have 3-5 modules, each with 2-4 lessons. Return ONLY valid JSON without markdown formatting, following this exact structure:

{
  "title": "Course Title",
  "description": "Brief course description",
  "estimatedDuration": "X hours",
  "difficulty": "Beginner/Intermediate/Advanced",
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
    return courseData
  } catch (error) {
    console.error("Error generating course content:", error)
    throw new Error("Failed to generate course content. Please try again.")
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
    if (jsonText.startsWith("```json")) {
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
  conversationHistory?: ChatMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  // Format the context information
  const contextText = formatContextForAI(pageContext)

  // Build system prompt
  const systemPrompt = `You are Nexus AI Tutor, a helpful and friendly AI assistant for a learning platform. You help students understand course content, answer questions, explain concepts, and provide educational support.

${contextText}

Instructions:
- Be clear, concise, and educational
- Use a friendly and encouraging tone
- Break down complex concepts into simpler terms
- Provide examples when helpful
- If the student asks about quiz questions they got wrong, explain why the correct answer is correct and help them understand the concept
- If the student asks to summarize content, provide a clear and structured summary
- Stay focused on the current context when relevant
- If the context doesn't provide enough information to answer, let the student know and provide general help

Respond naturally and conversationally.`

  // Build the full prompt with conversation history
  let fullPrompt = systemPrompt

  // Add conversation history if provided (for context in the conversation)
  if (conversationHistory && conversationHistory.length > 0) {
    const historyText = conversationHistory
      .slice(-10) // Keep last 10 messages for context (to avoid token limits)
      .map((msg) => `${msg.role === "user" ? "Student" : "AI"}: ${msg.content}`)
      .join("\n\n")
    fullPrompt += `\n\nPrevious conversation:\n${historyText}\n\n`
  }

  // Add the current user message
  fullPrompt += `\nStudent: ${userMessage}\n\nAI:`

  try {
    const result = await model.generateContent(fullPrompt)
    const response = await result.response
    const text = response.text()

    return text.trim()
  } catch (error) {
    console.error("Error generating chat response:", error)
    throw new Error("Failed to generate response. Please try again.")
  }
}

/**
 * Generate course name suggestions based on user's library courses
 * Returns an array of suggested course names/topics
 */
export async function generateCourseSuggestions(courseTitles: string[]): Promise<string[]> {
  if (!genAI) {
    throw new Error("Gemini API key is not configured")
  }

  if (courseTitles.length === 0) {
    return []
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

  const coursesList = courseTitles.slice(0, 5).join(", ")

  const prompt = `Based on these courses the user has in their library: ${coursesList}

Generate 3-5 related course name suggestions that would be good next steps for learning. 
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
    if (jsonText.startsWith("```json")) {
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

