"use client"

import { Badge } from "@/components/ui/badge"
import {
  getChallengeActionsPerPlayer,
  isPoweredChallenge,
  normalizeChallengeSettings,
  type ChallengeSettings,
} from "@/lib/challenge-utils"
import { Zap, Clock, Sparkles, Music, Timer } from "lucide-react"

interface ChallengeSettingsSummaryProps {
  settings?: Partial<ChallengeSettings> | null
  className?: string
  compact?: boolean
}

export function ChallengeSettingsSummary({
  settings: raw,
  className = "",
  compact = false,
}: ChallengeSettingsSummaryProps) {
  const settings = normalizeChallengeSettings(raw ?? undefined)
  const powered = isPoweredChallenge(settings)
  const actions = getChallengeActionsPerPlayer(settings)

  const items = [
    {
      show: true,
      label: settings.gameMode === "powered" ? "Powered live" : "Classic",
      icon: <Zap className="h-3 w-3" />,
      variant: "secondary" as const,
    },
    {
      show: settings.timer,
      label: "Timer",
      icon: <Timer className="h-3 w-3" />,
      variant: "outline" as const,
    },
    {
      show: settings.combo,
      label: "Combo",
      icon: <Sparkles className="h-3 w-3" />,
      variant: "outline" as const,
    },
    {
      show: settings.immediateFeedback,
      label: "Instant feedback",
      icon: <Sparkles className="h-3 w-3" />,
      variant: "outline" as const,
    },
    {
      show: settings.bpm,
      label: "BPM meter",
      icon: <Music className="h-3 w-3" />,
      variant: "outline" as const,
    },
    {
      show: powered,
      label: `${actions} actions each`,
      icon: <Zap className="h-3 w-3 text-orange-500" />,
      variant: "outline" as const,
    },
  ]

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {items
          .filter((i) => i.show)
          .map((item) => (
            <Badge key={item.label} variant={item.variant} className="text-[9px] gap-0.5 px-1.5 py-0">
              {item.icon}
              {item.label}
            </Badge>
          ))}
      </div>
    )
  }

  return (
    <div className={`rounded-md border bg-muted/30 px-2.5 py-2 space-y-1.5 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Challenge rules
      </p>
      <div className="flex flex-wrap gap-1">
        {items
          .filter((i) => i.show)
          .map((item) => (
            <Badge key={item.label} variant={item.variant} className="text-[10px] gap-1">
              {item.icon}
              {item.label}
            </Badge>
          ))}
        {items.filter((i) => !i.show && i.label !== `${actions} actions each`).length > 0 && (
          <>
            {!settings.timer && (
              <Badge variant="outline" className="text-[10px] opacity-60 line-through">
                No timer
              </Badge>
            )}
            {!settings.immediateFeedback && (
              <Badge variant="outline" className="text-[10px] opacity-60 line-through">
                No flash feedback
              </Badge>
            )}
            {!settings.bpm && (
              <Badge variant="outline" className="text-[10px] opacity-60 line-through">
                No BPM
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  )
}
