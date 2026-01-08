"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MatchingInteraction } from "@/lib/gemini"
import { CheckCircle2 } from "lucide-react"

interface MatchingInteractionProps {
  interaction: MatchingInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function MatchingInteractionComponent({ interaction, onComplete }: MatchingInteractionProps) {
  const [leftSelected, setLeftSelected] = useState<string | null>(null)
  const [rightSelectedIndex, setRightSelectedIndex] = useState<number | null>(null)
  const [matchedPairIndices, setMatchedPairIndices] = useState<Set<number>>(new Set())
  const [completed, setCompleted] = useState(false)

  // Create indexed versions of items to track which specific pair each item belongs to
  const leftItemsWithIndex = interaction.pairs.map((p, idx) => ({ left: p.left, pairIndex: idx }))
  const rightItemsWithIndex = interaction.pairs
    .map((p, idx) => ({ right: p.right, pairIndex: idx }))
    .sort(() => Math.random() - 0.5)

  const handleLeftClick = (left: string, pairIndex: number) => {
    if (completed || matchedPairIndices.has(pairIndex)) return
    setLeftSelected(left)
    setRightSelectedIndex(null)
  }

  const handleRightClick = (right: string, rightIndex: number, pairIndex: number) => {
    if (completed || !leftSelected) return
    
    // Find the pair index for the selected left
    const leftPairIndex = leftItemsWithIndex.find(item => item.left === leftSelected && !matchedPairIndices.has(item.pairIndex))?.pairIndex
    
    // Check if this specific pair matches
    if (leftPairIndex !== undefined && leftPairIndex === pairIndex) {
      setMatchedPairIndices(new Set([...matchedPairIndices, pairIndex]))
      setLeftSelected(null)
      setRightSelectedIndex(null)
      
      if (matchedPairIndices.size + 1 === interaction.pairs.length) {
        setCompleted(true)
        onComplete(true)
      }
    } else {
      setRightSelectedIndex(rightIndex)
      setTimeout(() => {
        setRightSelectedIndex(null)
        setLeftSelected(null)
      }, 500)
    }
  }

  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Match the pairs:</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Terms</h4>
              {leftItemsWithIndex.map((item, index) => {
                const isMatched = matchedPairIndices.has(item.pairIndex)
                const isSelected = leftSelected === item.left && !isMatched
                return (
                  <Button
                    key={`left-${item.pairIndex}-${item.left}`}
                    variant={isMatched ? "default" : isSelected ? "default" : "outline"}
                    className="w-full justify-start whitespace-normal break-words text-left h-auto py-2"
                    disabled={isMatched || completed}
                    onClick={() => handleLeftClick(item.left, item.pairIndex)}
                  >
                    {isMatched && <CheckCircle2 className="h-4 w-4 mr-2 flex-shrink-0" />}
                    <span className="break-words">{item.left}</span>
                  </Button>
                )
              })}
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Definitions</h4>
              {rightItemsWithIndex.map((item, rightIndex) => {
                const isMatched = matchedPairIndices.has(item.pairIndex)
                const isSelected = rightSelectedIndex === rightIndex
                return (
                  <Button
                    key={`right-${rightIndex}-${item.pairIndex}-${item.right}`}
                    variant={isMatched ? "default" : isSelected ? "destructive" : "outline"}
                    className="w-full justify-start whitespace-normal break-words text-left h-auto py-2"
                    disabled={isMatched || completed}
                    onClick={() => handleRightClick(item.right, rightIndex, item.pairIndex)}
                  >
                    {isMatched && <CheckCircle2 className="h-4 w-4 mr-2 flex-shrink-0" />}
                    <span className="break-words">{item.right}</span>
                  </Button>
                )
              })}
            </div>
          </div>

          {completed && (
            <div className="flex items-center justify-center gap-2 text-green-600 font-semibold">
              <CheckCircle2 className="h-6 w-6" />
              All pairs matched correctly!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

