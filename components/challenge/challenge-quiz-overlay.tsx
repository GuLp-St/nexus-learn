"use client"

import { cn } from "@/lib/utils"
import type { AnswerFx } from "@/hooks/use-challenge-quiz-fx"

interface ChallengeQuizOverlayProps {
  answerFx: AnswerFx
  comboStreak: number
  comboMultiplier: number
  comboTimeLeft: number
  timerPulse: boolean
  elapsedTime: number
}

export function ChallengeQuizOverlay({
  answerFx,
  comboStreak,
  comboMultiplier,
  comboTimeLeft,
  timerPulse,
  elapsedTime,
}: ChallengeQuizOverlayProps) {
  const comboPct =
    comboTimeLeft > 0 ? Math.min(100, (comboTimeLeft / 4000) * 100) : 0

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-40 transition-transform duration-150",
          answerFx === "correct" && "challenge-shake-correct",
          answerFx === "wrong" && "challenge-shake-wrong"
        )}
        aria-hidden
      />

      {answerFx === "correct" && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="challenge-ring-correct h-32 w-32 rounded-full border-4 border-green-400/80" />
        </div>
      )}
      {answerFx === "wrong" && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="challenge-ring-wrong h-32 w-32 rounded-full border-4 border-red-500/80" />
        </div>
      )}

      {comboStreak > 0 && (
        <div className="fixed top-20 right-4 z-50 flex flex-col items-end gap-1 animate-in slide-in-from-right-4">
          <div className="rounded-lg bg-primary/90 text-primary-foreground px-3 py-2 shadow-lg border border-primary">
            <p className="text-[10px] uppercase tracking-widest opacity-80">Combo</p>
            <p className="text-2xl font-black tabular-nums">×{comboMultiplier.toFixed(1)}</p>
            <p className="text-xs font-semibold">{comboStreak} streak</p>
          </div>
          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-75"
              style={{ width: `${comboPct}%` }}
            />
          </div>
        </div>
      )}

      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-background/90 border shadow-lg backdrop-blur",
          timerPulse && "challenge-timer-flash"
        )}
      >
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Time</span>
        <span className="font-mono text-xl font-bold tabular-nums">
          {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, "0")}
        </span>
      </div>
    </>
  )
}
