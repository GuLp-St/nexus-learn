"use client"

import { useEffect } from "react"
import { initializeQuestEventListeners } from "@/lib/daily-quest-utils"

/**
 * Component to initialize quest event listeners on app load
 * Should be included in the root layout or a top-level component
 */
export function QuestInitializer() {
  useEffect(() => {
    // Initialize quest event listeners once on mount
    initializeQuestEventListeners()
  }, [])

  return null
}

