"use client"

import type { ReactNode } from "react"
import type { ActiveFocusType } from "@/lib/page-context-types"

interface NexusFocusRegionProps {
  id: string
  type: ActiveFocusType
  content: string
  children: ReactNode
  className?: string
}

/** Marks a region for IntersectionObserver-based chatbot focus tracking. */
export function NexusFocusRegion({ id, type, content, children, className }: NexusFocusRegionProps) {
  const safeContent = content.slice(0, 1200)
  return (
    <div
      className={className}
      data-nexus-focus-id={id}
      data-nexus-focus-type={type}
      data-nexus-focus-content={safeContent}
    >
      {children}
    </div>
  )
}
