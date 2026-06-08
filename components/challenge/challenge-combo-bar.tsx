"use client"

import { COMBO_TIMEOUT_MS } from "@/lib/challenge-scoring"

interface ChallengeComboBarProps {
  comboStreak: number
  comboMultiplier: number
  peakComboMultiplier: number
  comboTimeLeft: number
}

export function ChallengeComboBar({
  comboStreak,
  comboMultiplier,
  peakComboMultiplier,
  comboTimeLeft,
}: ChallengeComboBarProps) {
  const comboPct =
    comboTimeLeft > 0 ? Math.min(100, (comboTimeLeft / COMBO_TIMEOUT_MS) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1">
      <div className="rounded-md bg-primary/90 text-primary-foreground px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-sm border border-primary w-full max-w-[9rem] sm:max-w-[10rem]">
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
        <div className="mt-0.5 h-1 w-full rounded-full bg-primary-foreground/20 overflow-hidden">
          <div
            className="h-full bg-orange-400 transition-all duration-75"
            style={{ width: `${comboPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
