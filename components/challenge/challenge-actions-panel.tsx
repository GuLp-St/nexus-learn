"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  POWERUP_ACTIONS,
  SABOTAGE_ACTIONS,
  type PowerActionType,
} from "@/lib/challenge-powered-actions"
import { Zap, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChallengeActionsPanelProps {
  actionsLeft: number
  disabled?: boolean
  onAction: (action: PowerActionType) => Promise<void>
}

export function ChallengeActionsPanel({
  actionsLeft,
  disabled,
  onAction,
}: ChallengeActionsPanelProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<PowerActionType | null>(null)

  const run = async (action: PowerActionType) => {
    setBusy(action)
    try {
      await onAction(action)
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 h-8 text-xs"
        disabled={disabled || actionsLeft <= 0}
        onClick={() => setOpen((o) => !o)}
      >
        <Zap className="h-3.5 w-3.5 text-orange-500" />
        Actions ({actionsLeft})
      </Button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-1 w-56 rounded-lg border bg-popover p-2 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1">
            Sabotage
          </p>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {SABOTAGE_ACTIONS.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-[10px] justify-start px-2 text-orange-700 dark:text-orange-300",
                  busy === a.id && "opacity-50"
                )}
                disabled={!!busy}
                onClick={() => void run(a.id)}
              >
                {a.short}
              </Button>
            ))}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1 flex items-center gap-1">
            <Shield className="h-3 w-3" /> Power-ups
          </p>
          <div className="grid grid-cols-2 gap-1">
            {POWERUP_ACTIONS.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-[10px] justify-start px-2 text-primary",
                  busy === a.id && "opacity-50"
                )}
                disabled={!!busy}
                onClick={() => void run(a.id)}
              >
                {a.short}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
