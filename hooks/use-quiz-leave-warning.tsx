"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { QuizLeaveWarningDialog } from "@/components/quiz-leave-warning-dialog"

const DEFAULT_MESSAGE =
  "Leaving will auto-submit your quiz with your current answers. Continue?"

interface UseQuizLeaveWarningOptions {
  active: boolean
  message?: string
  /** Called on confirmed leave, tab close, or page hide (auto-submit). */
  onLeave?: () => void | Promise<void>
}

type PendingLeave = {
  href?: string
  resolve: (confirmed: boolean) => void
}

/**
 * Warn before navigating away from an in-progress quiz.
 * - browser beforeunload prompt
 * - pagehide auto-submit
 * - intercept in-app link clicks (capture phase)
 * - modal dialog for in-app navigation (reliable on desktop)
 */
export function useQuizLeaveWarning({
  active,
  message = DEFAULT_MESSAGE,
  onLeave,
}: UseQuizLeaveWarningOptions) {
  const onLeaveRef = useRef(onLeave)
  const activeRef = useRef(active)
  const leaveLockRef = useRef(false)
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null)

  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  const runLeave = useCallback(async () => {
    if (leaveLockRef.current) return
    leaveLockRef.current = true
    try {
      await onLeaveRef.current?.()
    } finally {
      leaveLockRef.current = false
    }
  }, [])

  const requestConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      setPendingLeave({ resolve })
    })
  }, [])

  const confirmAndLeave = useCallback(
    async (href?: string) => {
      if (!activeRef.current) {
        if (href) window.location.href = href
        return
      }
      const confirmed = await requestConfirm()
      if (!confirmed) return
      await runLeave()
      if (href) window.location.href = href
    },
    [requestConfirm, runLeave]
  )

  const handleDialogConfirm = useCallback(() => {
    pendingLeave?.resolve(true)
    setPendingLeave(null)
  }, [pendingLeave])

  const handleDialogCancel = useCallback(() => {
    pendingLeave?.resolve(false)
    setPendingLeave(null)
  }, [pendingLeave])

  useEffect(() => {
    if (!active) return

    history.pushState({ quizLeaveGuard: true }, "", window.location.href)

    const onPopState = () => {
      if (!activeRef.current) return
      history.pushState({ quizLeaveGuard: true }, "", window.location.href)
      void (async () => {
        const confirmed = await requestConfirm()
        if (confirmed) await runLeave()
      })()
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message
      return message
    }

    const onPageHide = () => {
      if (activeRef.current && !leaveLockRef.current) {
        void runLeave()
      }
    }

    window.addEventListener("popstate", onPopState)
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("pagehide", onPageHide)

    return () => {
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [active, message, runLeave, requestConfirm])

  useEffect(() => {
    if (!active) return

    const onCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return

      e.preventDefault()
      e.stopPropagation()
      void confirmAndLeave(href)
    }

    document.addEventListener("click", onCaptureClick, true)
    return () => document.removeEventListener("click", onCaptureClick, true)
  }, [active, confirmAndLeave])

  const LeaveWarningDialog = useCallback(
    () => (
      <QuizLeaveWarningDialog
        open={!!pendingLeave}
        message={message}
        onConfirm={() => void handleDialogConfirm()}
        onCancel={handleDialogCancel}
      />
    ),
    [pendingLeave, message, handleDialogConfirm, handleDialogCancel]
  )

  return { confirmAndLeave, runLeave, requestConfirm, LeaveWarningDialog }
}
