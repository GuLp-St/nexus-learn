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

function ActionButton({
  short,
  description,
  tone,
  disabled,
  onClick,
}: {
  short: string
  description: string
  tone: "sabotage" | "powerup"
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-auto w-full flex flex-col items-start gap-1 px-3 py-2.5 text-left whitespace-normal",
        tone === "sabotage"
          ? "border-orange-500/30 hover:bg-orange-500/10"
          : "border-primary/30 hover:bg-primary/5"
      )}
    >
      <span
        className={cn(
          "text-xs font-bold leading-none",
          tone === "sabotage" ? "text-orange-700 dark:text-orange-300" : "text-primary"
        )}
      >
        {short}
      </span>
      <span className="text-[10px] font-normal text-muted-foreground leading-snug">
        {description}
      </span>
    </Button>
  )
}

export function ChallengeActionsPanel({
  actionsLeft,
  disabled,
  onAction,
}: ChallengeActionsPanelProps) {
  const busy = disabled

  return (
    <div className="w-full space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold">
        <Zap className="h-4 w-4 text-orange-500" />
        <span>
          Actions {actionsLeft}/{CHALLENGE_ACTIONS_PER_PLAYER}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3 text-orange-500" />
          Sabotage
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SABOTAGE_ACTIONS.map((a) => (
            <ActionButton
              key={a.id}
              short={a.short}
              description={a.description}
              tone="sabotage"
              disabled={busy || actionsLeft <= 0}
              onClick={() => void onAction(a.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Power-ups
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {POWERUP_ACTIONS.map((a) => (
            <ActionButton
              key={a.id}
              short={a.short}
              description={a.description}
              tone="powerup"
              disabled={busy || actionsLeft <= 0}
              onClick={() => void onAction(a.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
