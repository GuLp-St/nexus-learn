"use client"

import { COMBO_TIMEOUT_MS } from "@/lib/challenge-scoring"
import type { ComboVisualFx } from "@/hooks/use-challenge-quiz-fx"
import { Shield } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChallengeComboBarProps {
  comboStreak: number
  comboMultiplier: number
  peakComboMultiplier: number
  comboTimeLeft: number
  comboVisualFx?: ComboVisualFx
  shieldActive?: boolean
}

export function ChallengeComboBar({
  comboStreak,
  comboMultiplier,
  peakComboMultiplier,
  comboTimeLeft,
  comboVisualFx = "none",
  shieldActive = false,
}: ChallengeComboBarProps) {
  const comboPct =
    comboTimeLeft > 0 ? Math.min(100, (comboTimeLeft / COMBO_TIMEOUT_MS) * 100) : 0
  const hasActiveCombo = comboStreak > 0

  return (
    <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 relative">
      {shieldActive && comboVisualFx !== "shield-shatter" && (
        <div className="absolute -inset-1 rounded-lg border-2 border-sky-400/70 bg-sky-500/10 challenge-shield-glow pointer-events-none z-10" />
      )}

      <div
        className={cn(
          "relative rounded-md px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-sm border w-full max-w-[9rem] sm:max-w-[10rem] transition-all",
          hasActiveCombo
            ? "bg-primary/90 text-primary-foreground border-primary"
            : "bg-muted/60 text-muted-foreground border-border",
          comboVisualFx === "opponent-break" && "challenge-combo-shatter",
          comboVisualFx === "self-reset" && "challenge-combo-reset",
          comboVisualFx === "shield-shatter" && "challenge-shield-shatter"
        )}
      >
        {shieldActive && (
          <div
            className={cn(
              "absolute -top-1.5 -right-1.5 rounded-full bg-sky-500 text-white p-0.5 shadow-md z-20",
              comboVisualFx === "shield-shatter" && "challenge-shield-icon-shatter"
            )}
          >
            <Shield className="h-3 w-3" />
          </div>
        )}

        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-[8px] sm:text-[9px] uppercase tracking-wider opacity-80">Combo</span>
          <span className="text-sm sm:text-base font-black tabular-nums leading-none">
            ×{comboMultiplier.toFixed(1)}
          </span>
          <span className="text-[8px] sm:text-[9px] font-semibold opacity-90">{comboStreak} streak</span>
        </div>
        {peakComboMultiplier > comboMultiplier && (
          <p className="text-[8px] text-center opacity-75 leading-none mt-0.5">
            Peak ×{peakComboMultiplier.toFixed(1)}
          </p>
        )}
        <div className="mt-0.5 h-1 w-full rounded-full bg-black/15 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-75",
              hasActiveCombo ? "bg-orange-400" : "bg-muted-foreground/30"
            )}
            style={{ width: `${comboPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
