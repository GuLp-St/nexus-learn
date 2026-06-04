"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ChallengeTabAwayModalProps {
  open: boolean
  secondsLeft: number
}

export function ChallengeTabAwayModal({ open, secondsLeft }: ChallengeTabAwayModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Come back to your quiz!</DialogTitle>
          <DialogDescription>
            You left the challenge tab. Return within{" "}
            <span className="font-bold text-foreground tabular-nums">{secondsLeft}</span>{" "}
            second{secondsLeft === 1 ? "" : "s"} or your answers will be submitted automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-primary/10">
            <span className="text-3xl font-black tabular-nums text-primary">{secondsLeft}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
