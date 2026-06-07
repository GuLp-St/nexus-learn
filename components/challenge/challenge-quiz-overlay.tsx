"use client"

import { cn } from "@/lib/utils"
import type { AnswerFx } from "@/hooks/use-challenge-quiz-fx"
import type { ActionFxType } from "@/hooks/use-challenge-action-fx"
import { COMBO_TIMEOUT_MS } from "@/lib/challenge-scoring"

interface ChallengeQuizOverlayProps {
  answerFx: AnswerFx
  actionFx?: ActionFxType
  comboStreak: number
  comboMultiplier: number
  peakComboMultiplier: number
  comboTimeLeft: number
  showCombo?: boolean
  showFlash?: boolean
  sabotageActive?: boolean
}

function actionFxClass(actionFx: ActionFxType): string {
  switch (actionFx) {
    case "distort_screen":
    case "incoming_sabotage":
      return "challenge-action-fx-distort"
    case "swap_harder":
    case "incoming_harder":
      return "challenge-action-fx-harder"
    case "add_more_answers":
    case "incoming_false_answers":
      return "challenge-action-fx-false-answers"
    case "remove_wrong":
    case "incoming_halve":
      return "challenge-action-fx-halve"
    case "combo_breaker":
      return "challenge-action-fx-break"
    case "combo_shield":
      return "challenge-action-fx-shield"
    default:
      return ""
  }
}

export function ChallengeQuizOverlay({
  answerFx,
  actionFx,
  comboStreak,
  comboMultiplier,
  peakComboMultiplier,
  comboTimeLeft,
  showCombo = true,
  showFlash = true,
  sabotageActive,
}: ChallengeQuizOverlayProps) {
  const comboPct =
    comboTimeLeft > 0 ? Math.min(100, (comboTimeLeft / COMBO_TIMEOUT_MS) * 100) : 0

  return (
    <>
      {sabotageActive && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-[70] bg-black/10 challenge-sabotage-blur"
            aria-hidden
          />
          <div
            className="pointer-events-none fixed inset-0 z-[71] opacity-50 mix-blend-screen challenge-sabotage-swirl"
            aria-hidden
          />
          <div
            className="pointer-events-none fixed inset-0 z-[72] challenge-sabotage-double-vision"
            aria-hidden
          />
        </>
      )}

      {actionFx && (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 z-[65] challenge-action-fx",
            actionFxClass(actionFx)
          )}
          aria-hidden
        />
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

    </>
  )
}
