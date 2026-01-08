"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChatSimInteraction } from "@/lib/gemini"
import { CheckCircle2, XCircle } from "lucide-react"

interface ChatSimInteractionProps {
  interaction: ChatSimInteraction
  onComplete: (correct: boolean, data?: any) => void
}

export function ChatSimInteractionComponent({ interaction, onComplete }: ChatSimInteractionProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentMessageIndex, showResult])

  useEffect(() => {
    // Auto-advance: if current message is bot and next message has options, advance to show options
    const currentMsg = interaction.messages[currentMessageIndex]
    const nextMsg = interaction.messages[currentMessageIndex + 1]
    
    if (currentMsg?.sender === "bot" && nextMsg?.sender === "user_options" && nextMsg?.options && !showResult) {
      // Auto-advance to show options after a short delay
      const timer = setTimeout(() => {
        setCurrentMessageIndex(currentMessageIndex + 1)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentMessageIndex, interaction.messages, showResult])

  const currentMessage = interaction.messages[currentMessageIndex]
  const isLastMessage = currentMessageIndex === interaction.messages.length - 1

  const handleOptionSelect = (optionIndex: number, isCorrect: boolean) => {
    if (showResult) return
    
    // Make sure we're on the message with options
    const msgWithOptions = currentMessage?.sender === "user_options" && currentMessage?.options 
      ? currentMessage 
      : interaction.messages[currentMessageIndex + 1]?.sender === "user_options" && interaction.messages[currentMessageIndex + 1]?.options
        ? interaction.messages[currentMessageIndex + 1]
        : null
    
    if (!msgWithOptions || !msgWithOptions.options) return
    
    // Advance to the message with options if we're not there yet
    if (currentMessage?.sender !== "user_options") {
      setCurrentMessageIndex(currentMessageIndex + 1)
    }
    
    setSelectedOption(optionIndex)
    setShowResult(true)
    
    // Only call onComplete if correct - if wrong, let user try again
    if (isCorrect) {
      onComplete(true, { 
        userSelectedText: msgWithOptions.options[optionIndex].text,
        scenario: interaction.scenario
      })
    }
  }
  
  const handleTryAgain = () => {
    setSelectedOption(null)
    setShowResult(false)
  }

  return (
    <Card className="my-6 border-2">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-medium text-muted-foreground mb-2">Scenario:</p>
            <p className="text-sm">{interaction.scenario}</p>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {interaction.messages.slice(0, currentMessageIndex + 1).map((message, index) => (
              <div key={index} className="space-y-2">
                {/* Bot messages */}
                {message.sender === "bot" && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-3 rounded-lg bg-muted">
                      {message.text && <p className="text-sm">{message.text}</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Options displayed as separate chat bubbles - show when available */}
            {(() => {
              // Check if current message has options, or if next message has options (for bot messages)
              const msgWithOptions = currentMessage?.sender === "user_options" && currentMessage?.options 
                ? currentMessage 
                : interaction.messages[currentMessageIndex + 1]?.sender === "user_options" && interaction.messages[currentMessageIndex + 1]?.options
                  ? interaction.messages[currentMessageIndex + 1]
                  : null
              
              return msgWithOptions && msgWithOptions.options && !showResult ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground px-2">Choose your response:</p>
                  {msgWithOptions.options.map((option, optIndex) => (
                    <button
                      key={optIndex}
                      onClick={() => handleOptionSelect(optIndex, option.isCorrect)}
                      className="flex justify-end w-full"
                    >
                      <div className="max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer border-2 border-transparent hover:border-primary/50 shadow-md hover:shadow-lg">
                        <p className="text-sm text-left font-medium">{option.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null
            })()}
            
            {/* Show selected option as user message */}
            {showResult && currentMessage?.options && selectedOption !== null && (
              <div className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground">
                  <p className="text-sm">{currentMessage.options[selectedOption].text}</p>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          

          {showResult && currentMessage?.options && selectedOption !== null && (
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-center gap-2">
                {currentMessage.options[selectedOption]?.isCorrect ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <span className="text-green-600 font-semibold">Good choice!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-500" />
                    <span className="text-red-600 font-semibold">Not quite right</span>
                  </>
                )}
              </div>
              {currentMessage.options[selectedOption]?.feedback && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm">{currentMessage.options[selectedOption]?.feedback}</p>
                </div>
              )}
              {currentMessage.options[selectedOption]?.isCorrect ? (
                // Correct answer - show continue button if not last message
                !isLastMessage && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setCurrentMessageIndex(currentMessageIndex + 1)
                      setSelectedOption(null)
                      setShowResult(false)
                    }}
                  >
                    Continue Conversation
                  </Button>
                )
              ) : (
                // Wrong answer - show try again button
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleTryAgain}
                >
                  Try Again
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

