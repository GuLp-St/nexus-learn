"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { useOnboarding } from "@/context/OnboardingContext"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { ONBOARDING_STEPS, type TourPlacement } from "@/lib/onboarding-tour"
import { cn } from "@/lib/utils"

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8
const VIEWPORT_MARGIN = 16
const GAP = 12
const ESTIMATED_TOOLTIP_H = 240

function isElementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const style = window.getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false
  }
  // Skip off-screen mobile header copy when desktop sidebar bell is showing
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false
  return true
}

function findVisibleTourTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(`[data-tour-id="${selector}"]`)
    for (const node of nodes) {
      const el = node as HTMLElement
      if (isElementVisible(el)) return el
    }
  }
  return null
}

function waitForTarget(selectors: string | string[], maxMs = 4000): Promise<HTMLElement | null> {
  const ids = Array.isArray(selectors) ? selectors : [selectors]
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      const el = findVisibleTourTarget(ids)
      if (el) {
        resolve(el)
        return
      }
      if (Date.now() - start > maxMs) {
        resolve(null)
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function computeTooltipStyle(
  rect: Rect | null,
  placement: TourPlacement,
  tooltipW: number,
  tooltipH: number
): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxW = Math.min(384, vw - VIEWPORT_MARGIN * 2)

  if (!rect) {
    return {
      position: "fixed",
      bottom: VIEWPORT_MARGIN,
      left: "50%",
      transform: "translateX(-50%)",
      width: maxW,
      maxWidth: maxW,
      maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2}px)`,
      zIndex: 10002,
    }
  }

  if (placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: maxW,
      maxWidth: maxW,
      maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2}px)`,
      zIndex: 10002,
    }
  }

  const spaceAbove = rect.top - VIEWPORT_MARGIN
  const spaceBelow = vh - (rect.top + rect.height) - VIEWPORT_MARGIN

  let effective: TourPlacement = placement
  if (placement === "top" && spaceAbove < tooltipH + GAP && spaceBelow >= spaceAbove) {
    effective = "bottom"
  } else if (placement === "bottom" && spaceBelow < tooltipH + GAP && spaceAbove >= spaceBelow) {
    effective = "top"
  }

  const style: CSSProperties = {
    position: "fixed",
    width: maxW,
    maxWidth: maxW,
    maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2}px)`,
    zIndex: 10002,
  }

  if (effective === "bottom") {
    const top = clamp(
      rect.top + rect.height + GAP,
      VIEWPORT_MARGIN,
      vh - tooltipH - VIEWPORT_MARGIN
    )
    style.top = top
    style.left = clamp(
      rect.left + rect.width / 2 - tooltipW / 2,
      VIEWPORT_MARGIN,
      vw - tooltipW - VIEWPORT_MARGIN
    )
  } else if (effective === "top") {
    const top = clamp(
      rect.top - GAP - tooltipH,
      VIEWPORT_MARGIN,
      vh - tooltipH - VIEWPORT_MARGIN
    )
    style.top = top
    style.left = clamp(
      rect.left + rect.width / 2 - tooltipW / 2,
      VIEWPORT_MARGIN,
      vw - tooltipW - VIEWPORT_MARGIN
    )
  } else if (effective === "right") {
    const left = clamp(
      rect.left + rect.width + GAP,
      VIEWPORT_MARGIN,
      vw - tooltipW - VIEWPORT_MARGIN
    )
    style.left = left
    style.top = clamp(rect.top, VIEWPORT_MARGIN, vh - tooltipH - VIEWPORT_MARGIN)
  } else if (effective === "left") {
    const left = clamp(
      rect.left - GAP - tooltipW,
      VIEWPORT_MARGIN,
      vw - tooltipW - VIEWPORT_MARGIN
    )
    style.left = left
    style.top = clamp(rect.top, VIEWPORT_MARGIN, vh - tooltipH - VIEWPORT_MARGIN)
  }

  return style
}

export function OnboardingTourOverlay() {
  const { tourActive, currentStep, stepIndex, nextStep, prevStep, skipTour } = useOnboarding()
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({})
  const tooltipRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(async () => {
    if (!tourActive || !currentStep) {
      setTargetRect(null)
      return
    }

    const hasTarget = currentStep.target || (currentStep.targets?.length ?? 0) > 0
    if (!hasTarget || currentStep.placement === "center") {
      setTargetRect(null)
      setTooltipStyle(
        computeTooltipStyle(null, "center", Math.min(384, window.innerWidth - 32), ESTIMATED_TOOLTIP_H)
      )
      return
    }

    if (currentStep.closeSidebar) {
      await new Promise((r) => setTimeout(r, 300))
    } else if (currentStep.openSidebar) {
      await new Promise((r) => setTimeout(r, 200))
    }

    const targetIds = currentStep.targets ?? (currentStep.target ? [currentStep.target] : [])
    const el = targetIds.length > 0 ? await waitForTarget(targetIds) : null
    if (!el) {
      setTargetRect(null)
      setTooltipStyle(
        computeTooltipStyle(null, "bottom", Math.min(384, window.innerWidth - 32), ESTIMATED_TOOLTIP_H)
      )
      return
    }

    el.scrollIntoView({ block: "center", behavior: "smooth" })

    const r = el.getBoundingClientRect()
    const rect: Rect = {
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    }
    setTargetRect(rect)

    const tooltipW = Math.min(384, window.innerWidth - VIEWPORT_MARGIN * 2)
    const tooltipH = tooltipRef.current?.offsetHeight ?? ESTIMATED_TOOLTIP_H
    const placement = currentStep.placement ?? "bottom"

    setTooltipStyle(computeTooltipStyle(rect, placement, tooltipW, tooltipH))
  }, [tourActive, currentStep])

  useEffect(() => {
    void measure()
    const onResize = () => void measure()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    const id = setInterval(() => void measure(), 400)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
      clearInterval(id)
    }
  }, [measure, stepIndex])

  // Re-clamp after paint when real tooltip height is known
  useLayoutEffect(() => {
    if (!tourActive || !currentStep || !tooltipRef.current) return
    const tooltipW = tooltipRef.current.offsetWidth
    const tooltipH = tooltipRef.current.offsetHeight
    const placement = currentStep.placement ?? "bottom"
    setTooltipStyle(computeTooltipStyle(targetRect, placement, tooltipW, tooltipH))
  }, [tourActive, currentStep, targetRect, stepIndex])

  if (!tourActive || !currentStep) return null

  const hasTarget = currentStep.target || (currentStep.targets?.length ?? 0) > 0
  const isCenter = !hasTarget || currentStep.placement === "center"
  const isLast = stepIndex >= ONBOARDING_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-auto" role="dialog" aria-modal="true">
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {targetRect && (
        <div
          className="absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: "0 0 0 4px rgba(20, 184, 166, 0.35)",
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className={cn(
          "rounded-2xl border border-primary/30 bg-background shadow-2xl pointer-events-auto overflow-y-auto overscroll-contain",
          isCenter ? "p-5 sm:p-6" : "p-4"
        )}
        style={tooltipStyle}
      >
        <div className="flex gap-3 min-w-0">
          <div className="shrink-0 hidden sm:block">
            <img src="/icon.svg" alt="Nexus" className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-start gap-2">
                <img
                  src="/icon.svg"
                  alt=""
                  className="h-8 w-8 object-contain shrink-0 sm:hidden"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
                  </p>
                  <h3 className="font-bold text-foreground leading-tight text-sm sm:text-base">
                    {currentStep.title}
                  </h3>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={skipTour}
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {currentStep.body}
            </p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-2 self-start"
                onClick={skipTour}
              >
                Skip tour
              </Button>
              <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevStep}
                  disabled={stepIndex === 0}
                  className="gap-1 h-9 min-w-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Back</span>
                </Button>
                <Button
                  size="sm"
                  onClick={nextStep}
                  className="gap-1 h-9 min-w-0 bg-teal-600 hover:bg-teal-700"
                >
                  <span className="truncate">{isLast ? "Finish" : "Next"}</span>
                  {!isLast && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
