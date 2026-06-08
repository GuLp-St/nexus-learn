"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface QuizLeaveWarningDialogProps {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function QuizLeaveWarningDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: QuizLeaveWarningDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave quiz?</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Stay
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Leave & submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
