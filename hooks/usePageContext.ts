"use client"

import { useEffect, useRef } from "react"
import { useChatContext } from "@/context/ChatContext"

interface UsePageContextOptions {
  title: string
  description: string
  data?: any
}

/**
 * Magic hook that broadcasts page context to the chatbot
 * 
 * Usage:
 * ```tsx
 * usePageContext({
 *   title: "Studying: Introduction to React",
 *   description: "The user is currently reading a lesson.",
 *   data: { courseId: "123", lessonId: "456" }
 * })
 * ```
 */
export function usePageContext({ title, description, data }: UsePageContextOptions) {
  const { setPageContext } = useChatContext()
  const prevRef = useRef<{ title: string; description: string; dataString?: string } | undefined>(undefined)

  useEffect(() => {
    // Serialize data for comparison to avoid infinite loops from object recreation
    const dataString = data !== undefined ? JSON.stringify(data) : undefined
    
    // Only update if something actually changed
    const prev = prevRef.current
    if (
      !prev ||
      prev.title !== title ||
      prev.description !== description ||
      prev.dataString !== dataString
    ) {
      console.log('[usePageContext] Setting context:', { title, description, hasData: !!data })
      setPageContext({ title, description, data })
      prevRef.current = { title, description, dataString }
    }
    
    // Note: No cleanup needed - the pathname change in ChatContext handles resetting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, data, setPageContext])
}

