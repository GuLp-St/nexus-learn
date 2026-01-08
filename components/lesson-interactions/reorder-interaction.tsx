"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ReorderInteraction } from "@/lib/gemini"
import { CheckCircle2, XCircle, GripVertical } from "lucide-react"

interface ReorderInteractionProps {
  interaction: ReorderInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function ReorderInteractionComponent({ interaction, onComplete }: ReorderInteractionProps) {
  const [items, setItems] = useState([...interaction.items].sort(() => Math.random() - 0.5))
  const [showResult, setShowResult] = useState(false)
  const [failureCount, setFailureCount] = useState(0)

  // Each 3 failures, we reveal one more correct position as a text hint
  const positionsToReveal = Math.floor(failureCount / 3)
  const maxReveals = Math.min(positionsToReveal, interaction.correctOrder.length)

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (showResult) return
    const newItems = [...items]
    const [removed] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, removed)
    setItems(newItems)
  }

  const handleCheck = () => {
    const currentOrder = items.map(item => item.id)
    const isCorrect = JSON.stringify(currentOrder) === JSON.stringify(interaction.correctOrder)
    setShowResult(true)
    
    if (!isCorrect) {
      setFailureCount(prev => prev + 1)
    } else {
      setFailureCount(0)
    }
    
    onComplete(isCorrect)
  }
  
  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{interaction.question}</h3>
          
          <div className="space-y-2">
            {items.map((item, index) => {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-3 rounded-lg transition-colors bg-muted hover:bg-muted/80"
                  draggable={!showResult}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", index.toString())
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"))
                    moveItem(fromIndex, index)
                  }}
                >
                  <GripVertical className="h-5 w-5 flex-shrink-0 text-muted-foreground cursor-move" />
                  <span className="flex-1 break-words whitespace-normal">{item.text}</span>
                  <span className="text-sm text-muted-foreground flex-shrink-0">#{index + 1}</span>
                </div>
              )
            })}
          </div>

          {maxReveals > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Hint:{" "}
                {Array.from({ length: maxReveals })
                  .map((_, idx) => {
                    const correctItemId = interaction.correctOrder[idx]
                    const correctItem = interaction.items.find(i => i.id === correctItemId)
                    const label = correctItem ? correctItem.text : `Step ${idx + 1}`
                    return `#${idx + 1} is ${label}`
                  })
                  .join(" · ")}
              </p>
            </div>
          )}
          
          {!showResult ? (
            <Button onClick={handleCheck} className="w-full">
              Check Order
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                {JSON.stringify(items.map(i => i.id)) === JSON.stringify(interaction.correctOrder) ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <span className="text-green-600 font-semibold">Correct Order!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-500" />
                    <span className="text-red-600 font-semibold">Incorrect Order</span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setItems([...interaction.items].sort(() => Math.random() - 0.5))
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

