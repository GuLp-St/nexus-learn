"use client"

import { cn } from "@/lib/utils"
import type { AnswerFx } from "@/hooks/use-challenge-quiz-fx"
import type { ActionFxType } from "@/hooks/use-challenge-action-fx"

interface ChallengeQuizOverlayProps {
  answerFx: AnswerFx
  actionFx?: ActionFxType
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
  showFlash = true,
  sabotageActive,
}: ChallengeQuizOverlayProps) {
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

    </>
  )
}
