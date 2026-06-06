"use client"

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react"
import { usePathname } from "next/navigation"
import type { PageContext } from "@/lib/page-context-types"
import { normalizePageContext } from "@/lib/page-context-types"
import { buildPageContext, defaultContextForRoute } from "@/lib/chat-page-context"

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
  const pageOverrideRef = useRef(false)

  const setPageContext = useCallback(
    (context: PageContextInput | null) => {
      if (!context) {
        pageOverrideRef.current = false
        setPageContextState(null)
        return
      }
      pageOverrideRef.current = true
      const normalized = normalizePageContext(context, pathname)
      if (!normalized) return
      setPageContextState(buildPageContext(pathname, normalized))
    },
    [pathname]
  )

  // Baseline context for routes without a custom setPageContext (deferred so pages win)
  useEffect(() => {
    pageOverrideRef.current = false
    const id = setTimeout(() => {
      if (!pageOverrideRef.current) {
        setPageContextState(defaultContextForRoute(pathname))
      }
    }, 0)
    return () => clearTimeout(id)
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

