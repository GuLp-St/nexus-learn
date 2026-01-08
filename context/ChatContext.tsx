"use client"

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react"
import { usePathname } from "next/navigation"

interface PageContext {
  title: string
  description: string
  data?: any
}

interface ChatContextType {
  pageContext: PageContext | null
  setPageContext: (context: PageContext | null) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null)
  const pathname = usePathname()
  const pathnameRef = useRef<string>(pathname)

  // Auto-reset context when pathname changes (but allow new page to set it immediately)
  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      console.log('[ChatContext] Pathname changed, resetting context:', pathnameRef.current, '->', pathname)
      pathnameRef.current = pathname
      // Reset context - the new page's usePageContext will set it immediately
      setPageContext(null)
    }
  }, [pathname])

  return (
    <ChatContext.Provider value={{ pageContext, setPageContext }}>
      {children}
    </ChatContext.Provider>
  )
}

/**
 * Hook to access the chat context
 * Use this in components that need to read or set page context
 */
export function useChatContext() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatContextProvider")
  }
  return context
}

