"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trophy, Sparkles } from "lucide-react"
import { XPAwardResult } from "@/lib/xp-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"

interface LevelUpModalProps {
  open: boolean
  onClose: () => void
  result: XPAwardResult
}

export function LevelUpModal({ open, onClose, result }: LevelUpModalProps) {
  const [progress, setProgress] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const { newLevel, newXP } = result

  useEffect(() => {
    if (open) {
      setIsAnimating(true)
      setShowContent(false)
      setProgress(0)
      
      // Entrance animation - fade in and scale
      const entranceTimer = setTimeout(() => {
        setShowContent(true)
      }, 50)
      
      // Animate progress bar from 0 to 100% with smooth transition
      const progressTimer = setTimeout(() => {
        const startTime = Date.now()
        const duration = 1500 // 1.5 seconds
        const startProgress = 0
        const endProgress = 100
        
        const animateProgress = () => {
          const elapsed = Date.now() - startTime
          const progressRatio = Math.min(elapsed / duration, 1)
          
          // Ease-out cubic function for smooth animation
          const easeOut = 1 - Math.pow(1 - progressRatio, 3)
          const currentProgress = startProgress + (endProgress - startProgress) * easeOut
          
          setProgress(currentProgress)
          
          if (progressRatio < 1) {
            requestAnimationFrame(animateProgress)
          }
        }
        
        requestAnimationFrame(animateProgress)
      }, 300)
      
      return () => {
        clearTimeout(entranceTimer)
        clearTimeout(progressTimer)
      }
    } else {
      setIsAnimating(false)
      setShowContent(false)
      setProgress(0)
    }
  }, [open])

  // Generate random positions for sparkles (memoized per render)
  const sparklePositions = Array.from({ length: 20 }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 1 + Math.random() * 2,
  }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-none bg-gradient-to-br from-primary/20 via-background to-primary/10 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Level Up!</DialogTitle>
        <div className={`relative overflow-hidden rounded-lg p-8 transition-all duration-500 ${
          showContent ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}>
          {/* Background Effects */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 to-transparent opacity-50 animate-pulse" />
          
          {/* Animated Confetti/Sparkle Effects */}
          {showContent && (
            <div className="absolute inset-0 -z-10 pointer-events-none">
              {sparklePositions.map((pos, i) => (
                <div
                  key={i}
                  className="absolute animate-bounce"
                  style={{
                    left: `${pos.left}%`,
                    top: `${pos.top}%`,
                    animationDelay: `${pos.delay}s`,
                    animationDuration: `${pos.duration}s`,
                  }}
                >
                  <Sparkles
                    className="h-4 w-4 text-primary animate-spin"
                    style={{
                      animationDuration: `${0.5 + Math.random() * 0.5}s`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-6 text-center">
            {/* Level Icon with Animation */}
            <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/20 transition-all duration-700 ${
              showContent ? "scale-100 rotate-0" : "scale-0 rotate-180"
            }`}>
              <Trophy 
                className={`h-12 w-12 text-primary transition-all duration-500 ${
                  showContent ? "animate-bounce" : ""
                }`}
                style={{
                  animationIterationCount: 3,
                }}
              />
            </div>

            {/* Level Up Text with Fade-in */}
            <div className={`space-y-2 transition-all duration-700 delay-300 ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}>
              <h2 className="text-4xl font-bold text-foreground animate-pulse">Level Up!</h2>
              <p className="text-3xl font-bold text-primary">Level {newLevel}</p>
              <p className="text-muted-foreground">Congratulations on your progress!</p>
            </div>

            {/* XP Progress Bar (Full) */}
            <div className={`space-y-2 transition-all duration-700 delay-500 ${
              showContent ? "opacity-100" : "opacity-0"
            }`}>
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-none"
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {newXP.toLocaleString()} XP • Ready for the next level!
              </p>
            </div>

            {/* Nexon Reward Display */}
            {result.nexonAwarded && (
              <div className={`flex items-center justify-center gap-2 p-4 rounded-lg bg-primary/10 transition-all duration-700 delay-600 ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}>
                <span className="text-lg font-semibold text-foreground">
                  +{result.nexonAwarded}
                </span>
                <NexonIcon className="h-6 w-6 text-primary" />
              </div>
            )}

            {/* Claim Button with Fade-in */}
            <Button
              onClick={onClose}
              size="lg"
              className={`w-full bg-primary hover:bg-primary/90 transition-all duration-700 delay-700 ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Claim Reward
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

