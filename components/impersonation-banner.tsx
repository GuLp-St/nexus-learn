"use client"

import { useEffect, useState } from "react"
import { UserCog, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getImpersonationTargetLabel,
  isImpersonating,
} from "@/lib/impersonation-client"
import { stopImpersonation } from "@/lib/admin-impersonation-client"
import { toast } from "sonner"

export function ImpersonationBanner() {
  const [active, setActive] = useState(false)
  const [label, setLabel] = useState<string | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    setActive(isImpersonating())
    setLabel(getImpersonationTargetLabel())
  }, [])

  if (!active) return null

  const handleExit = async () => {
    setExiting(true)
    try {
      await stopImpersonation()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to exit impersonation")
      setExiting(false)
    }
  }

  return (
    <>
      <div className="h-10 shrink-0" aria-hidden />
      <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <UserCog className="h-4 w-4 shrink-0" />
          <span>
            Impersonating <strong>{label ?? "user"}</strong> — actions apply to their account
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 bg-amber-950/10 hover:bg-amber-950/20 text-amber-950 border-0"
          onClick={handleExit}
          disabled={exiting}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          {exiting ? "Exiting…" : "Exit impersonation"}
        </Button>
      </div>
    </div>
    </>
  )
}
