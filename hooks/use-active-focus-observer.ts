"use client"

import { useEffect, useState, useRef, type RefObject } from "react"
import type { ActiveFocus } from "@/lib/page-context-types"

function parseFocusElement(el: Element): ActiveFocus | null {
  const id = el.getAttribute("data-nexus-focus-id")
  const type = el.getAttribute("data-nexus-focus-type") as ActiveFocus["type"] | null
  const content = el.getAttribute("data-nexus-focus-content")
  if (!id || !type || !content) return null
  return { id, type, content }
}

function focusKey(f: ActiveFocus | null): string {
  return f ? `${f.id}:${f.type}` : ""
}

/**
 * Tracks the most visible `[data-nexus-focus-*]` element inside a scroll root.
 */
export function useActiveFocusObserver(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean = true,
  /** Re-run observation when block count / layout changes (e.g. lesson block index). */
  layoutKey: string = ""
): ActiveFocus | null {
  const [activeFocus, setActiveFocus] = useState<ActiveFocus | null>(null)
  const lastKeyRef = useRef<string>("")

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      lastKeyRef.current = ""
      setActiveFocus(null)
      return
    }

    const root = scrollRootRef.current

    const commitFocus = (parsed: ActiveFocus | null) => {
      const key = focusKey(parsed)
      if (key === lastKeyRef.current) return
      lastKeyRef.current = key
      setActiveFocus(parsed)
    }

    const pickBest = (entries: IntersectionObserverEntry[]) => {
      const visible = entries.filter((e) => e.isIntersecting && e.intersectionRatio > 0.1)
      if (visible.length === 0) return
      const best = visible.reduce((a, b) =>
        a.intersectionRatio >= b.intersectionRatio ? a : b
      )
      const parsed = parseFocusElement(best.target)
      if (parsed) commitFocus(parsed)
    }

    const observer = new IntersectionObserver(pickBest, {
      root: root ?? null,
      threshold: [0.25, 0.5, 0.75],
      rootMargin: "-12% 0px -35% 0px",
    })

    const observeAll = () => {
      const nodes = (root ?? document).querySelectorAll("[data-nexus-focus-id]")
      nodes.forEach((node) => observer.observe(node))
    }

    observeAll()
    const retryId = window.setTimeout(observeAll, 100)

    return () => {
      window.clearTimeout(retryId)
      observer.disconnect()
      lastKeyRef.current = ""
    }
  }, [scrollRootRef, enabled, layoutKey])

  return activeFocus
}
