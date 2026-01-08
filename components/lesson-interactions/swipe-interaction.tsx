"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SwipeInteraction } from "@/lib/gemini"
import { CheckCircle2, XCircle } from "lucide-react"

interface SwipeInteractionProps {
  interaction: SwipeInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function SwipeInteractionComponent({ interaction, onComplete }: SwipeInteractionProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleSwipe = (label: string) => {
    if (showResult) return
    const option = interaction.options.find(opt => opt.label === label)
    if (option) {
      setSelected(label)
      setShowResult(true)
      onComplete(option.isCorrect)
    }
  }

  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold break-words">{interaction.question}</h3>
          
          {!showResult ? (
            <div className="flex flex-wrap gap-4 justify-center">
              {interaction.options.map((option) => (
                <Button
                  key={option.label}
                  variant={selected === option.label ? "default" : "outline"}
                  size="lg"
                  className="min-w-[120px] whitespace-normal break-words h-auto py-2"
                  onClick={() => handleSwipe(option.label)}
                >
                  <span className="break-words">{option.label}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                {interaction.options.find(opt => opt.label === selected)?.isCorrect ? (
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
                  setSelected(null)
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

