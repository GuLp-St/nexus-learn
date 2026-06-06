"use client"

import { useCallback, useRef, useState } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const HOLD_MS = 3000

type HoldToLogoutButtonProps = {
  disabled?: boolean
  onConfirm: () => void
  className?: string
}

export function HoldToLogoutButton({ disabled, onConfirm, className }: HoldToLogoutButtonProps) {
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

  const secondsLeft = Math.ceil((HOLD_MS - (progress / 100) * HOLD_MS) / 1000)

  return (
    <Button
      variant="outline"
      disabled={disabled}
      className={cn(
        "relative w-full justify-start gap-3 overflow-hidden select-none touch-none",
        "bg-transparent text-destructive border-dashed border-destructive/30",
        "hover:bg-destructive/10 hover:text-destructive",
        holding && "border-destructive/50",
        className
      )}
      onPointerDown={(e) => {
        e.preventDefault()
        startHold()
      }}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Hold for 3 seconds to log out"
    >
      <span
        className="absolute inset-y-0 left-0 bg-destructive/30 origin-left transition-none"
        style={{ width: `${progress}%` }}
        aria-hidden
      />
      <LogOut className="relative z-10 h-5 w-5 shrink-0" />
      <span className="relative z-10">
        {disabled ? "Logging out…" : holding ? `Hold… ${secondsLeft}s` : "Log Out"}
      </span>
    </Button>
  )
}
