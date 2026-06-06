"use client"

import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const HOLD_MS = 3000

type HoldToLogoutButtonProps = {
  disabled?: boolean
  onConfirm: () => void
}

export function HoldToLogoutButton({ disabled, onConfirm }: HoldToLogoutButtonProps) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef(0)

  const clearHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setHolding(false)
    setProgress(0)
  }, [])

  const startHold = useCallback(() => {
    if (disabled) return
    setHolding(true)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.min(100, (elapsed / HOLD_MS) * 100)
      setProgress(pct)
      if (elapsed >= HOLD_MS) {
        clearHold()
        onConfirm()
      }
    }, 50)
  }, [clearHold, disabled, onConfirm])

  return (
    <Button
      variant="destructive"
      disabled={disabled}
      className="relative w-full overflow-hidden select-none touch-none"
      onPointerDown={(e) => {
        e.preventDefault()
        startHold()
      }}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className="absolute inset-0 bg-destructive-foreground/20 origin-left transition-none"
        style={{ transform: `scaleX(${progress / 100})` }}
        aria-hidden
      />
      <span className="relative z-10">
        {holding
          ? `Hold… ${Math.ceil((HOLD_MS - (progress / 100) * HOLD_MS) / 1000)}s`
          : "Hold 3s to log out"}
      </span>
    </Button>
  )
}
