"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { XPAwardResult } from "@/lib/xp-utils"
import { getLevelProgress } from "@/lib/level-utils"
import { Sparkles } from "lucide-react"

interface XPToastContentProps {
  result: XPAwardResult
}

function XPToastContent({ result }: XPToastContentProps) {
  const { amount, oldXP, newXP, newLevel, source } = result
  const oldProgress = getLevelProgress(oldXP)
  const newProgress = getLevelProgress(newXP)
  const [currentProgress, setCurrentProgress] = useState(oldProgress.progressPercentage)

  useEffect(() => {
    const startTime = Date.now()
    const duration = 800
    const startProgress = oldProgress.progressPercentage
    const endProgress = newProgress.progressPercentage
    const progressDiff = endProgress - startProgress

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / duration)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setCurrentProgress(startProgress + progressDiff * easeOut)
      if (progress < 1) requestAnimationFrame(animate)
    }

    const timeout = setTimeout(() => requestAnimationFrame(animate), 50)
    return () => clearTimeout(timeout)
  }, [oldProgress.progressPercentage, newProgress.progressPercentage])

  return (
    <div className="w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-primary/20 bg-background shadow-lg">
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-bold tabular-nums text-primary">+{amount} XP</p>
            <p className="shrink-0 text-xs font-semibold text-muted-foreground">
              Lv {newLevel}
            </p>
          </div>
          <p className="truncate text-xs text-muted-foreground">{source || "XP earned"}</p>
        </div>
      </div>
      <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Progress</span>
          <span>{newProgress.xpProgressToNext} XP to next</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function showXPToast(result: XPAwardResult) {
  toast.custom(() => <XPToastContent result={result} />, {
    duration: 3500,
    className: "!p-0 !bg-transparent !border-0 !shadow-none",
    style: { padding: 0, background: "transparent", border: "none", boxShadow: "none" },
  })
}
