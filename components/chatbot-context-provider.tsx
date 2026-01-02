"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"
import { PageContext } from "@/lib/chatbot-context"

interface ChatbotContextType {
  pageContext: PageContext | null
  setPageContext: (context: PageContext | null) => void
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined)

export function ChatbotContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null)

  return (
    <ChatbotContext.Provider value={{ pageContext, setPageContext }}>
      {children}
    </ChatbotContext.Provider>
  )
}

/**
 * Hook for pages to set the current page context
 * Use this in page components to provide context to the chatbot
 */
export function useChatbotContext() {
  const context = useContext(ChatbotContext)
  if (context === undefined) {
    throw new Error("useChatbotContext must be used within a ChatbotContextProvider")
  }
  return context
}

/**
 * Hook for chatbot component to read the current page context
 */
export function useChatbotPageContext() {
  const context = useContext(ChatbotContext)
  if (context === undefined) {
    throw new Error("useChatbotPageContext must be used within a ChatbotContextProvider")
  }
  return context.pageContext
}
