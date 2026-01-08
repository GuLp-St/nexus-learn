"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FillBlankInteraction } from "@/lib/gemini"
import { CheckCircle2, XCircle } from "lucide-react"

interface FillBlankInteractionProps {
  interaction: FillBlankInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function FillBlankInteractionComponent({ interaction, onComplete }: FillBlankInteractionProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleSelect = (option: string) => {
    if (showResult) return
    setSelected(option)
    const isCorrect = option === interaction.correctAnswer
    setShowResult(true)
    onComplete(isCorrect)
  }

  const contentWithBlank = interaction.content.replace(/\[\s*BLANK\s*\]/gi, "_____")

  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="text-lg break-words whitespace-pre-wrap">
            {contentWithBlank.split("_____").map((part, index, array) => (
              <span key={index}>
                {part}
                {index < array.length - 1 && (
                  <span className="inline-block mx-2 px-3 py-1 bg-muted border-2 border-dashed rounded min-w-[80px] text-center">
                    {selected || "?"}
                  </span>
                )}
              </span>
            ))}
          </div>

          {!showResult ? (
            <div className="flex flex-wrap gap-2">
              {interaction.options.map((option) => (
                <Button
                  key={option}
                  variant="outline"
                  onClick={() => handleSelect(option)}
                  className="min-w-[100px] whitespace-normal break-words h-auto py-2"
                >
                  <span className="break-words">{option}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                {selected === interaction.correctAnswer ? (
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
                <p className="text-sm break-words">
                  Correct answer: <strong className="break-words">{interaction.correctAnswer}</strong>
                </p>
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

