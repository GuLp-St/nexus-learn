"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { startActivityTracking, stopActivityTracking, ActivityPageType } from "@/lib/activity-tracker"

interface UseActivityTrackingOptions {
  userId: string | null
  pageType: ActivityPageType
  courseId?: string
  moduleIndex?: number
  lessonIndex?: number
  enabled?: boolean // Allow disabling tracking if needed
}

/**
 * React hook to track user activity on learning pages
 * Automatically starts tracking when page is visible and focused
 * Stops tracking when page loses focus or component unmounts
 */
export function useActivityTracking({
  userId,
  pageType,
  courseId,
  moduleIndex,
  lessonIndex,
  enabled = true,
}: UseActivityTrackingOptions) {
  const pathname = usePathname()
  const isTrackingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !userId) {
      return
    }

    // Only track on learning pages
    const isLearningPage =
      pathname.startsWith("/courses/") || pathname.startsWith("/quizzes/")

    if (!isLearningPage) {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        if (!isTrackingRef.current) {
          startActivityTracking(userId, pageType, courseId, moduleIndex, lessonIndex)
          isTrackingRef.current = true
        }
      } else {
        if (isTrackingRef.current) {
          stopActivityTracking()
          isTrackingRef.current = false
        }
      }
    }

    const handleFocus = () => {
      if (!isTrackingRef.current) {
        startActivityTracking(userId, pageType, courseId, moduleIndex, lessonIndex)
        isTrackingRef.current = true
      }
    }

    const handleBlur = () => {
      if (isTrackingRef.current) {
        stopActivityTracking()
        isTrackingRef.current = false
      }
    }

    // Start tracking if page is visible and focused
    if (document.visibilityState === "visible" && document.hasFocus()) {
      startActivityTracking(userId, pageType, courseId, moduleIndex, lessonIndex)
      isTrackingRef.current = true
    }

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("blur", handleBlur)

    // Cleanup on unmount or dependency change
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("blur", handleBlur)

      if (isTrackingRef.current) {
        stopActivityTracking()
        isTrackingRef.current = false
      }
    }
  }, [userId, pageType, courseId, moduleIndex, lessonIndex, enabled, pathname])
}

