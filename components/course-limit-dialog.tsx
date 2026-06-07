"use client"

import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trophy } from "lucide-react"

export type CourseLimitType = "generated" | "added"

interface CourseLimitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: CourseLimitType
  limit: number
  current: number
  level: number
}

export function CourseLimitDialog({
  open,
  onOpenChange,
  type,
  limit,
  current,
  level,
}: CourseLimitDialogProps) {
  const router = useRouter()
  const slotLabel = type === "generated" ? "generated" : "added"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Course limit reached
          </DialogTitle>
          <DialogDescription>
            You&apos;ve used all {current}/{limit} {slotLabel} course slots at Level {level}.
            Level up to unlock more slots!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => { onOpenChange(false); router.push("/journey") }}>
            View journey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
