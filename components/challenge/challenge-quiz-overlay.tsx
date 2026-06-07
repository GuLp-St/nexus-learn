"use client"

import { cn } from "@/lib/utils"
import type { AnswerFx } from "@/hooks/use-challenge-quiz-fx"
import { COMBO_TIMEOUT_MS } from "@/lib/challenge-scoring"
import { Users, Eye } from "lucide-react"

interface ChallengeQuizOverlayProps {
  answerFx: AnswerFx
  comboStreak: number
  comboMultiplier: number
  peakComboMultiplier: number
  comboTimeLeft: number
  timerPulse: boolean
  elapsedTime: number
  showTimer?: boolean
  showCombo?: boolean
  showFlash?: boolean
  opponentNickname?: string
  opponentQuestion?: number | null
  opponentTotal?: number
  sabotageActive?: boolean
}

export function ChallengeQuizOverlay({
  answerFx,
  comboStreak,
  comboMultiplier,
  peakComboMultiplier,
  comboTimeLeft,
  timerPulse,
  elapsedTime,
  showTimer = true,
  showCombo = true,
  showFlash = true,
  opponentNickname,
  opponentQuestion,
  opponentTotal,
  sabotageActive,
}: ChallengeQuizOverlayProps) {
  const comboPct =
    comboTimeLeft > 0 ? Math.min(100, (comboTimeLeft / COMBO_TIMEOUT_MS) * 100) : 0

  return (
    <>
      {sabotageActive && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-[70] backdrop-blur-md bg-black/30 challenge-sabotage-blur"
            aria-hidden
          />
          <div
            className="pointer-events-none fixed inset-0 z-[71] opacity-40 mix-blend-screen challenge-sabotage-swirl"
            aria-hidden
          />
        </>
      )}

      {showFlash && answerFx === "correct" && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] challenge-screen-flash-correct"
          aria-hidden
        />
      )}
      {showFlash && answerFx === "wrong" && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] challenge-screen-flash-wrong"
          aria-hidden
        />
      )}

      {opponentNickname != null && opponentTotal != null && opponentTotal > 0 && (
        <div className="fixed top-20 left-4 z-50 max-w-[200px] rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {opponentNickname}
          </p>
          <p className="text-sm font-semibold tabular-nums">
            Q{(opponentQuestion ?? 0) + 1} / {opponentTotal}
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{
                width: `${Math.min(100, (((opponentQuestion ?? 0) + 1) / opponentTotal) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {showCombo && (comboStreak > 0 || peakComboMultiplier > 1) && (
        <div className="fixed top-20 right-4 z-50 flex flex-col items-end gap-1 animate-in slide-in-from-right-4">
          <div className="rounded-lg bg-primary/90 text-primary-foreground px-3 py-2 shadow-lg border border-primary">
            <p className="text-[10px] uppercase tracking-widest opacity-80">Combo</p>
            <p className="text-2xl font-black tabular-nums">×{comboMultiplier.toFixed(1)}</p>
            <p className="text-xs font-semibold">{comboStreak} streak</p>
            {peakComboMultiplier > comboMultiplier && (
              <p className="text-[10px] opacity-80">Peak ×{peakComboMultiplier.toFixed(1)}</p>
            )}
          </div>
          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-75"
              style={{ width: `${comboPct}%` }}
            />
          </div>
        </div>
      )}

      {showTimer && (
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
      )}

      {opponentNickname && opponentTotal != null && (
        <div className="fixed bottom-6 right-4 z-50 hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/80 border rounded-full px-3 py-1.5 backdrop-blur">
          <Users className="h-3 w-3" />
          Live vs {opponentNickname}
        </div>
      )}
    </>
  )
}
