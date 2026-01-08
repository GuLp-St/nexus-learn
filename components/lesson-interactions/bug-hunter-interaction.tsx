"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BugHunterInteraction } from "@/lib/gemini"
import { CheckCircle2, XCircle } from "lucide-react"

interface BugHunterInteractionProps {
  interaction: BugHunterInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function BugHunterInteractionComponent({ interaction, onComplete }: BugHunterInteractionProps) {
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleLineClick = (lineId: number) => {
    if (showResult) return
    setSelectedLineId(lineId)
    const isCorrect = lineId === interaction.correctLineId
    setShowResult(true)
    onComplete(isCorrect)
  }

  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold break-words">{interaction.question}</h3>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
            {interaction.lines.map((line) => (
              <div
                key={line.id}
                className={`p-2 rounded cursor-pointer transition-colors break-words whitespace-pre-wrap ${
                  showResult && line.id === interaction.correctLineId
                    ? "bg-red-500/20 border-2 border-red-500"
                    : selectedLineId === line.id
                    ? "bg-primary/20 border-2 border-primary"
                    : "hover:bg-background"
                }`}
                onClick={() => handleLineClick(line.id)}
              >
                <span className="text-muted-foreground mr-2">{line.id}.</span>
                <span className="break-words">{line.text}</span>
              </div>
            ))}
          </div>

          {showResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                {selectedLineId === interaction.correctLineId ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <span className="text-green-600 font-semibold">Correct!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-500" />
                    <span className="text-red-600 font-semibold">Incorrect</span>
                  </>
                )}
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm break-words whitespace-pre-wrap">{interaction.explanation}</p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedLineId(null)
                  setShowResult(false)
                }}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

