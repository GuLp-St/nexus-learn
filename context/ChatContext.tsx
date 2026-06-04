"use client"

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react"
import { usePathname } from "next/navigation"
import type { PageContext } from "@/lib/page-context-types"
import { normalizePageContext } from "@/lib/page-context-types"
import { buildPageContext } from "@/lib/chat-page-context"

export type { PageContext } from "@/lib/page-context-types"

type PageContextInput =
  | PageContext
  | (Omit<PageContext, "route"> & { route?: string })
  | { title: string; description: string; data?: unknown }

interface ChatContextType {
  pageContext: PageContext | null
  setPageContext: (context: PageContextInput | null) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext | null>(null)
  const pathname = usePathname()
  const pathnameRef = useRef<string>(pathname)

  const setPageContext = useCallback(
    (context: PageContextInput | null) => {
      if (!context) {
        setPageContextState(null)
        return
      }
      const normalized = normalizePageContext(context, pathname)
      if (!normalized) return
      setPageContextState(buildPageContext(pathname, normalized))
    },
    [pathname]
  )

  // Auto-reset context when pathname changes (but allow new page to set it immediately)
  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname
      setPageContextState(null)
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

