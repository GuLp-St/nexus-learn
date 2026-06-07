"use client"

import { Button } from "@/components/ui/button"
import {
  POWERUP_ACTIONS,
  SABOTAGE_ACTIONS,
  type PowerActionType,
} from "@/lib/challenge-powered-actions"
import { CHALLENGE_ACTIONS_PER_PLAYER } from "@/lib/challenge-utils"
import { Zap, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChallengeActionsPanelProps {
  actionsLeft: number
  disabled?: boolean
  onAction: (action: PowerActionType) => Promise<void>
}

const ALL_ACTIONS = [
  ...SABOTAGE_ACTIONS.map((a) => ({ ...a, tone: "sabotage" as const })),
  ...POWERUP_ACTIONS.map((a) => ({ ...a, tone: "powerup" as const })),
]

export function ChallengeActionsPanel({
  actionsLeft,
  disabled,
  onAction,
}: ChallengeActionsPanelProps) {
  const busy = disabled || actionsLeft <= 0

  return (
    <div className="w-full rounded-lg border bg-muted/15 px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold">
          <Zap className="h-3.5 w-3.5 text-orange-500" />
          <span>
            Actions {actionsLeft}/{CHALLENGE_ACTIONS_PER_PLAYER}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Zap className="h-2.5 w-2.5 text-orange-500" />
            Sabotage
          </span>
          <span className="flex items-center gap-0.5">
            <Shield className="h-2.5 w-2.5" />
            Boost
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {ALL_ACTIONS.map((a) => (
          <Button
            key={a.id}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            title={a.description}
            onClick={() => void onAction(a.id)}
            className={cn(
              "h-7 px-1 text-[10px] sm:text-[11px] font-bold truncate",
              a.tone === "sabotage"
                ? "border-orange-500/25 hover:bg-orange-500/10 text-orange-700 dark:text-orange-300"
                : "border-primary/25 hover:bg-primary/5 text-primary"
            )}
          >
            {a.short}
          </Button>
        ))}
      </div>
    </div>
  )
}
