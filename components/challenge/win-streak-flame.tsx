"use client"

import { Flame } from "lucide-react"
import { cn } from "@/lib/utils"

export type WinStreakTier = "none" | "small" | "medium" | "big" | "legend"

export function getWinStreakTier(streak: number): WinStreakTier {
  if (streak <= 0) return "none"
  if (streak < 5) return "small"
  if (streak < 10) return "medium"
  if (streak < 20) return "big"
  return "legend"
}

const tierStyles: Record<Exclude<WinStreakTier, "none">, { icon: string; glow: string; animate: string }> = {
  small: {
    icon: "h-4 w-4",
    glow: "text-orange-400 drop-shadow-[0_0_6px_rgba(251,146,60,0.8)]",
    animate: "animate-pulse",
  },
  medium: {
    icon: "h-5 w-5",
    glow: "text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.9)]",
    animate: "animate-bounce",
  },
  big: {
    icon: "h-6 w-6",
    glow: "text-red-500 drop-shadow-[0_0_14px_rgba(239,68,68,0.95)]",
    animate: "animate-pulse",
  },
  legend: {
    icon: "h-8 w-8",
    glow: "text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,1)]",
    animate: "animate-bounce",
  },
}

interface WinStreakFlameProps {
  streak: number
  showZero?: boolean
  className?: string
}

export function WinStreakFlame({ streak, showZero = false, className }: WinStreakFlameProps) {
  const tier = getWinStreakTier(streak)
  if (tier === "none" && !showZero) {
    return <span className={cn("text-sm text-muted-foreground", className)}>—</span>
  }
  if (tier === "none") {
    return <span className={cn("text-sm font-medium text-muted-foreground", className)}>0</span>
  }

  const style = tierStyles[tier]
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold", className)}>
      <Flame className={cn(style.icon, style.glow, style.animate)} />
      <span className={tier === "legend" ? "text-lg" : tier === "big" ? "text-base" : "text-sm"}>
        {streak}
      </span>
    </span>
  )
}
