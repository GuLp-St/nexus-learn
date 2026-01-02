"use client"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, Send, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useChatbotPageContext } from "@/components/chatbot-context-provider"
import { generateChatResponse, ChatMessage } from "@/lib/gemini"

const CHATBOT_POSITION_KEY = "nexus-chatbot-position"

export function ChatbotOverlay() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hasMoved, setHasMoved] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pageContext = useChatbotPageContext()
  const animationFrameRef = useRef<number | null>(null)
  const tempPositionRef = useRef<{ x: number; y: number } | null>(null)

  // Load saved position from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(CHATBOT_POSITION_KEY)
      if (saved) {
        try {
          const { x, y } = JSON.parse(saved)
          setPosition({ x, y })
        } catch (e) {
          // Invalid saved data, use default
        }
      }
    }
  }, [])

  // Save position to localStorage
  const savePosition = (x: number, y: number) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CHATBOT_POSITION_KEY, JSON.stringify({ x, y }))
    }
  }

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    setDragOffset({
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
    setIsDragging(true)
    setHasMoved(false)
  }

  // Handle drag with requestAnimationFrame for smooth performance
  useEffect(() => {
    if (!isDragging) {
      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const handleMove = (e: MouseEvent | TouchEvent) => {
      // Cancel previous frame if exists
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const newX = clientX - dragOffset.x
      const newY = clientY - dragOffset.y

      // Constrain to viewport
      const buttonWidth = buttonRef.current?.offsetWidth || 56
      const buttonHeight = buttonRef.current?.offsetHeight || 56
      const maxX = window.innerWidth - buttonWidth
      const maxY = window.innerHeight - buttonHeight
      const constrainedX = Math.max(0, Math.min(newX, maxX))
      const constrainedY = Math.max(0, Math.min(newY, maxY))

      // Store in ref for smooth updates
      tempPositionRef.current = { x: constrainedX, y: constrainedY }

      // If moved more than a tiny bit, consider it a drag to prevent opening chat
      const currentPos = position || { x: 0, y: 0 }
      if (Math.abs(constrainedX - currentPos.x) > 2 || Math.abs(constrainedY - currentPos.y) > 2) {
        setHasMoved(true)
      }

      // Use requestAnimationFrame for smooth updates
      animationFrameRef.current = requestAnimationFrame(() => {
        if (tempPositionRef.current) {
          setPosition(tempPositionRef.current)
        }
      })
    }

    const handleEnd = () => {
      setIsDragging(false)
      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      // Save final position to localStorage
      if (tempPositionRef.current) {
        savePosition(tempPositionRef.current.x, tempPositionRef.current.y)
        setPosition(tempPositionRef.current)
      } else if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        savePosition(rect.left, rect.top)
      }
      tempPositionRef.current = null
    }

    window.addEventListener("mousemove", handleMove, { passive: true })
    window.addEventListener("mouseup", handleEnd)
    window.addEventListener("touchmove", handleMove, { passive: false })
    window.addEventListener("touchend", handleEnd)

    return () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleEnd)
      window.removeEventListener("touchmove", handleMove)
      window.removeEventListener("touchend", handleEnd)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isDragging, dragOffset, position])

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return

    const userMessageText = message.trim()
    setMessage("")
    setError(null)

    // Add user message to chat
    const userMessage: ChatMessage = { role: "user", content: userMessageText }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    try {
      // Get AI response
      const response = await generateChatResponse(userMessageText, pageContext, messages)
      
      // Add AI response to chat
      const aiMessage: ChatMessage = { role: "assistant", content: response }
      setMessages((prev) => [...prev, aiMessage])
    } catch (err: any) {
      console.error("Error sending message:", err)
      setError(err.message || "Failed to send message. Please try again.")
      // Add error message to chat
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again in a moment.",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Calculate button position (default to middle-right if no saved position)
  const buttonStyle = position === null
    ? { top: "50%", transform: "translateY(-50%)", right: "1.5rem" }
    : { left: `${position.x}px`, top: `${position.y}px`, bottom: "auto", right: "auto" }

  return (
    <>
      {/* Floating Chat Button - Always visible and draggable */}
      <Button
        ref={buttonRef}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onClick={() => {
          // Only open if we didn't just finish a drag
          if (!hasMoved) {
            setIsOpen(true)
          }
        }}
        className={`fixed h-14 w-14 rounded-full shadow-lg bg-teal-600 hover:bg-teal-700 z-40 ${
          isOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        } ${isDragging ? "cursor-grabbing transition-none" : "cursor-grab transition-all"}`}
        style={buttonStyle}
        aria-label="Open AI Chatbot"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>

      {/* Chat Overlay - Slides up from bottom */}
      <div
        className={`fixed inset-x-0 bottom-0 bg-background shadow-2xl rounded-t-3xl z-50 transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "calc(100vh - 60px)", maxHeight: "600px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-teal-50 to-background dark:from-teal-950/20 dark:to-background">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-teal-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-foreground">Nexus AI Tutor</h2>
              <p className="text-xs text-muted-foreground">Always here to help</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ height: "calc(100% - 140px)" }}>
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground text-sm">Start a conversation with Nexus AI Tutor</p>
                <p className="text-muted-foreground text-xs">
                  {pageContext
                    ? pageContext.type === "lesson"
                      ? "Ask questions about the current slide or request a summary"
                      : pageContext.type === "quiz-result"
                      ? "Ask about quiz questions or get explanations for wrong answers"
                      : "I'm here to help!"
                    : "I'm here to help!"}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex items-start gap-2 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "user" ? (
                  <>
                    <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">You</AvatarFallback>
                    </Avatar>
                  </>
                ) : (
                  <>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-teal-600 text-white text-xs">AI</AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[80%]">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-teal-600 text-white text-xs">AI</AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-2 rounded-lg">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-background">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Ask Nexus anything..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1 rounded-full border-input focus:border-teal-600 focus:ring-teal-600"
            />
            <Button
              size="icon"
              className="h-10 w-10 rounded-full bg-teal-600 hover:bg-teal-700 shrink-0"
              disabled={!message.trim() || isLoading}
              onClick={sendMessage}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
