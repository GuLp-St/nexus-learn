"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import { XPAwardResult } from "@/lib/xp-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { useAuth } from "@/components/auth-provider"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { eventBus } from "@/lib/event-bus"

interface LevelUpModalProps {
  open: boolean
  onClose: () => void
  result: XPAwardResult
}

export function LevelUpModal({ open, onClose, result }: LevelUpModalProps) {
  const [progress, setProgress] = useState(0)
  const [showContent, setShowContent] = useState(false)
  const [showParticles, setShowParticles] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const { newLevel, newXP } = result
  const { user, nickname, avatarUrl } = useAuth()

  const handleClaim = () => {
    if (claimed) return
    
    if (result.nexonAwarded && user) {
      eventBus.emit({
        type: "nexon_awarded",
        userId: user.uid,
        metadata: {
          amount: result.nexonAwarded,
          source: "Level Up",
          description: `Reached level ${newLevel}`,
        },
      })
    }
    setClaimed(true)
    onClose()
  }

  // Handle auto-claim when modal is closed via other means (clicking outside, Esc)
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleClaim()
    } else {
      setClaimed(false)
    }
  }

  useEffect(() => {
    if (open) {
      setShowContent(false)
      setShowParticles(false)
      setProgress(0)
      
      // Sequence the animations
      const timer1 = setTimeout(() => setShowContent(true), 100)
      const timer2 = setTimeout(() => setShowParticles(true), 400)
      
      const duration = 2000
        const startTime = Date.now()
        
        const animateProgress = () => {
          const elapsed = Date.now() - startTime
        const ratio = Math.min(elapsed / duration, 1)
        const easeOut = 1 - Math.pow(1 - ratio, 4)
        setProgress(easeOut * 100)
          
        if (ratio < 1) {
            requestAnimationFrame(animateProgress)
          }
        }
        
      const timer3 = setTimeout(() => {
        requestAnimationFrame(animateProgress)
      }, 600)
      
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }
  }, [open])

  // Particles for the burst effect
  const particles = Array.from({ length: 12 }, (_, i) => ({
    angle: (i * 360) / 12,
    delay: Math.random() * 0.2,
    size: 4 + Math.random() * 8,
  }))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-none bg-transparent p-0 overflow-visible shadow-none">
        <DialogTitle className="sr-only">Level Up!</DialogTitle>
          
        <div className="relative flex flex-col items-center justify-center min-h-[400px]">
          {/* Shockwave Effect */}
          {showContent && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-24 h-24 rounded-full border-4 border-primary/50 animate-shockwave" />
              <div className="w-24 h-24 rounded-full border-4 border-primary/30 animate-shockwave [animation-delay:0.2s]" />
            </div>
          )}

          {/* Background Glow */}
          <div className={`absolute inset-0 -z-10 transition-all duration-1000 ${
            showContent ? "opacity-100 scale-100" : "opacity-0 scale-50"
          }`}>
            <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full" />
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </div>

          {/* Content Card */}
          <div className={`relative w-full bg-background/80 backdrop-blur-xl border border-primary/20 rounded-2xl p-8 shadow-2xl transition-all duration-700 ${
            showContent ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-12 scale-90"
          }`}>
            
            {/* Particle Burst */}
            {showParticles && (
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                {particles.map((p, i) => (
                <div
                  key={i}
                    className="absolute bg-primary rounded-full animate-out fade-out zoom-out fill-mode-forwards"
                    style={{
                      width: p.size,
                      height: p.size,
                      transform: `rotate(${p.angle}deg) translateY(-80px)`,
                      transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}s`,
                      opacity: 0,
                      left: -p.size / 2,
                      top: -p.size / 2,
                    }}
                  />
              ))}
            </div>
          )}

            <div className="space-y-8 text-center">
              {/* Avatar with Ring */}
              <div className="relative mx-auto w-40 h-40 flex items-center justify-center">
                <div className={`absolute inset-0 rounded-full border-2 border-dashed border-primary/40 animate-spin-slow ${
                  showContent ? "opacity-100" : "opacity-0"
                }`} style={{ animationDuration: '10s' }} />
                
                <div className={`relative z-10 ${
                  showContent ? "scale-100" : "scale-0"
                } transition-transform duration-500 delay-200`}>
                  {user && (
                    <AvatarWithCosmetics 
                      userId={user.uid} 
                      nickname={nickname}
                      avatarUrl={avatarUrl}
                      size="xl"
                    />
                  )}
            </div>

                <div className={`absolute -bottom-2 right-0 z-20 bg-background border-2 border-primary rounded-full px-3 py-1 font-bold text-primary shadow-lg transition-all duration-500 delay-500 ${
                  showContent ? "scale-100 opacity-100" : "scale-0 opacity-0"
                }`}>
                  Lvl {newLevel}
                </div>
              </div>

              {/* Text Content */}
              <div className="space-y-2">
                <h2 className={`text-5xl font-black tracking-tighter transition-all duration-700 delay-300 ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}>
                  <span className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                    LEVEL
                  </span>
                  <span className="text-primary ml-2">UP!</span>
                </h2>
                <p className={`text-muted-foreground font-medium transition-all duration-700 delay-400 ${
                  showContent ? "opacity-100" : "opacity-0"
                }`}>
                  You've Levelled up. Claim your reward!
                </p>
            </div>

              {/* Progress Bar Container */}
              <div className={`space-y-3 transition-all duration-700 delay-500 ${
              showContent ? "opacity-100" : "opacity-0"
            }`}>
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                  <span>Current XP</span>
                  <span>{newXP.toLocaleString()} XP</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/50 p-0.5 border border-primary/10">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/80 via-primary to-primary/80 shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-none relative overflow-hidden"
                  style={{
                    width: `${progress}%`,
                  }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] animate-[shimmer_2s_infinite]" />
                  </div>
              </div>
            </div>

              {/* Reward popped in */}
            {result.nexonAwarded && (
                <div className={`flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 transition-all duration-700 delay-600 ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}>
                  <div className="bg-primary/20 p-2 rounded-lg">
                <NexonIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Bonus Reward</p>
                    <p className="text-xl font-black text-foreground">+{result.nexonAwarded} Nexon</p>
                  </div>
              </div>
            )}

              {/* Action Button */}
            <Button
                onClick={handleClaim}
              size="lg"
                className={`w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_10px_20px_-10px_rgba(var(--primary),0.5)] transition-all duration-700 delay-700 ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Claim Reward
            </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

