"use client"

import React, { useState, useEffect } from "react"

const MESSAGES = [
  "Connecting to Nexus...",
  "Synthesizing Knowledge...",
  "Calibrating AI...",
  "Preparing your Journey..."
]

export function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative flex flex-col items-center">
        {/* Logo Container */}
        <div className="relative mb-8">
          <img
            src="/logo.png"
            alt="Nexus Logo"
            className="h-24 w-24 animate-float-pulse object-contain"
            onError={(e) => {
              // Fallback if logo.png doesn't exist
              e.currentTarget.src = "/icon.svg"
            }}
          />
          {/* Shadow element */}
          <div className="mx-auto mt-4 h-2 w-16 animate-shadow-pulse rounded-[100%] bg-primary/20" />
        </div>

        {/* Loading Text */}
        <p className="min-h-[1.5rem] text-sm font-medium text-muted-foreground transition-all duration-300">
          {MESSAGES[messageIndex]}
        </p>
      </div>
    </div>
  )
}
