"use client"

import { useEffect, useRef } from "react"
import { useChatContext } from "@/context/ChatContext"

import type { ActiveFocus } from "@/lib/page-context-types"

interface UsePageContextOptions {
  title: string
  description: string
  data?: unknown
  pageData?: Record<string, unknown>
  activeFocus?: ActiveFocus | null
  suggestedChips?: string[]
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
export function usePageContext({
  title,
  description,
  data,
  pageData,
  activeFocus,
  suggestedChips,
}: UsePageContextOptions) {
  const { setPageContext } = useChatContext()
  const prevRef = useRef<string | undefined>(undefined)
  const payload = pageData ?? data

  useEffect(() => {
    const snapshot = JSON.stringify({
      title,
      description,
      payload,
      activeFocus,
      suggestedChips,
    })

    if (prevRef.current !== snapshot) {
      setPageContext({
        title,
        description,
        pageData: payload as Record<string, unknown> | undefined,
        activeFocus,
        suggestedChips,
      })
      prevRef.current = snapshot
    }
  }, [title, description, payload, activeFocus, suggestedChips, setPageContext])
}

