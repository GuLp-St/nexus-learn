"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface QuizRetakeModalProps {
  open: boolean
  onClose: () => void
  onRetakeSame: () => void
  onNewQuestions: () => void
  quizTitle: string
  onReviewPast?: () => void
}

export function QuizRetakeModal({
  open,
  onClose,
  onRetakeSame,
  onNewQuestions,
  quizTitle,
  onReviewPast,
}: QuizRetakeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Retake Quiz</DialogTitle>
          <DialogDescription>
            You've already completed "{quizTitle}". How would you like to proceed?
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button onClick={onRetakeSame} className="w-full">
            Retake Same Questions
          </Button>
          <Button onClick={onNewQuestions} variant="outline" className="w-full">
            New Question Set
          </Button>
          {onReviewPast && (
            <Button 
              onClick={onReviewPast} 
              variant="ghost" 
              className="w-full"
            >
              <FileQuestion className="mr-2 h-4 w-4" />
              Review Past Quiz
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
