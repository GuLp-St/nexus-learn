"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  POWERUP_ACTIONS,
  SABOTAGE_ACTIONS,
  type PowerActionType,
} from "@/lib/challenge-powered-actions"
import { CHALLENGE_ACTIONS_PER_PLAYER } from "@/lib/challenge-utils"
import { Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChallengeActionsPanelProps {
  actionsLeft: number
  disabled?: boolean
  onAction: (action: PowerActionType) => Promise<void>
}

type ActionItem = {
  id: PowerActionType
  short: string
  description: string
  tone: "sabotage" | "powerup"
}

function ActionRow({
  actions,
  selected,
  busy,
  onSelect,
}: {
  actions: ActionItem[]
  selected: PowerActionType | null
  busy: boolean
  onSelect: (id: PowerActionType) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-0.5 sm:gap-1">
      {actions.map((a) => (
        <Button
          key={a.id}
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          title={a.description}
          onClick={() => onSelect(a.id)}
          className={cn(
            "h-7 sm:h-8 px-0.5 sm:px-1 text-[9px] sm:text-[11px] font-bold truncate",
            a.tone === "sabotage"
              ? "border-orange-500/25 hover:bg-orange-500/10 text-orange-700 dark:text-orange-300"
              : "border-primary/25 hover:bg-primary/5 text-primary",
            selected === a.id &&
              (a.tone === "sabotage"
                ? "bg-orange-500/15 border-orange-500/50 ring-1 ring-orange-500/30"
                : "bg-primary/10 border-primary/50 ring-1 ring-primary/30")
          )}
        >
          {a.short}
        </Button>
      ))}
    </div>
  )
}

export function ChallengeActionsPanel({
  actionsLeft,
  disabled,
  onAction,
}: ChallengeActionsPanelProps) {
  const [selected, setSelected] = useState<PowerActionType | null>(null)
  const [using, setUsing] = useState(false)
  const busy = disabled || actionsLeft <= 0 || using

  const powerups: ActionItem[] = POWERUP_ACTIONS.map((a) => ({
    id: a.id,
    short: a.short,
    description: a.description,
    tone: "powerup",
  }))

  const sabotages: ActionItem[] = SABOTAGE_ACTIONS.map((a) => ({
    id: a.id,
    short: a.short,
    description: a.description,
    tone: "sabotage",
  }))

  const allActions = [...powerups, ...sabotages]
  const selectedAction = allActions.find((a) => a.id === selected) ?? null

  const handleUse = async () => {
    if (!selected || busy) return
    setUsing(true)
    try {
      await onAction(selected)
      setSelected(null)
    } finally {
      setUsing(false)
    }
  }

  return (
    <div className="w-full rounded-lg border bg-muted/15 px-1.5 py-1 sm:px-2 sm:py-1.5 space-y-1">
      <div className="flex items-stretch gap-1.5 min-w-0">
        <div className="shrink-0 flex flex-col justify-center rounded-md border bg-background/60 px-1.5 py-0.5 min-w-[3.75rem]">
          <div className="flex items-center gap-0.5 text-[10px] font-semibold">
            <Zap className="h-2.5 w-2.5 text-orange-500 shrink-0" />
            <span className="tabular-nums whitespace-nowrap">
              {actionsLeft}/{CHALLENGE_ACTIONS_PER_PLAYER}
            </span>
          </div>
          <span className="text-[8px] text-muted-foreground leading-none">Actions</span>
        </div>

        <div
          className={cn(
            "flex-1 min-w-0 rounded-md border px-1.5 py-0.5 flex items-center",
            selectedAction ? "bg-background/60" : "bg-muted/30 border-dashed"
          )}
        >
          {selectedAction ? (
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[10px] font-semibold truncate leading-tight",
                  selectedAction.tone === "sabotage"
                    ? "text-orange-700 dark:text-orange-300"
                    : "text-primary"
                )}
              >
                {selectedAction.short}
              </p>
              <p className="text-[8px] sm:text-[9px] text-muted-foreground line-clamp-1 leading-tight">
                {selectedAction.description}
              </p>
            </div>
          ) : (
            <p className="text-[8px] sm:text-[9px] text-muted-foreground leading-tight">
              Pick a boost or sabotage
            </p>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          disabled={!selected || busy}
          onClick={() => void handleUse()}
          className="shrink-0 h-7 sm:h-8 px-2.5 text-[10px] sm:text-xs"
        >
          Use
        </Button>
      </div>

      <ActionRow
        actions={powerups}
        selected={selected}
        busy={busy}
        onSelect={setSelected}
      />

      <ActionRow
        actions={sabotages}
        selected={selected}
        busy={busy}
        onSelect={setSelected}
      />
    </div>
  )
}
