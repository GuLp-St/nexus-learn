"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { XPAwardResult } from "@/lib/xp-utils"
import { getLevelProgress } from "@/lib/level-utils"
import { Trophy } from "lucide-react"

interface XPToastContentProps {
  result: XPAwardResult
}

function XPToastContent({ result }: XPToastContentProps) {
  const { amount, oldXP, newXP, newLevel, source } = result
  const oldProgress = getLevelProgress(oldXP)
  const newProgress = getLevelProgress(newXP)
  const [currentProgress, setCurrentProgress] = useState(oldProgress.progressPercentage)

  useEffect(() => {
    // Animate from old progress to new progress
    const startTime = Date.now()
    const duration = 800 // 800ms animation
    const startProgress = oldProgress.progressPercentage
    const endProgress = newProgress.progressPercentage
    const progressDiff = endProgress - startProgress

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / duration)
      
      // Ease-out animation
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startProgress + (progressDiff * easeOut)
      
      setCurrentProgress(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    // Start animation after a small delay to ensure toast is rendered
    const timeout = setTimeout(() => {
      requestAnimationFrame(animate)
    }, 50)

    return () => clearTimeout(timeout)
  }, [oldProgress.progressPercentage, newProgress.progressPercentage])

  return (
    <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-full bg-primary/10 p-2">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">+{amount} XP</p>
              <p className="text-sm font-medium text-foreground">
                {source || "XP Award"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">Level {newLevel}</p>
            </div>
          </div>

          {/* XP to next level */}
          <p className="text-xs text-muted-foreground">
            {newProgress.xpProgressToNext} XP to next level
          </p>

          {/* XP Progress Bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{
                width: `${currentProgress}%`,
                transition: "none", // Disable CSS transition, we animate with JS
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function showXPToast(result: XPAwardResult) {
  toast.custom(
    () => <XPToastContent result={result} />,
    {
      duration: 3000,
    }
  )
}

