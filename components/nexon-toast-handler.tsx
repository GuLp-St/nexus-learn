"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { NexonIcon } from "./ui/nexon-icon"
import { eventBus } from "@/lib/event-bus"
import { getUserNexon } from "@/lib/nexon-utils"
import { useAuth } from "./auth-provider"
import { ArrowRight } from "lucide-react"

/**
 * Animated number component for Nexon balance change
 */
function AnimatedNumber({ startValue, endValue }: { startValue: number, endValue: number }) {
  const [displayValue, setDisplayValue] = useState(startValue)

  useEffect(() => {
    // 1 second delay before starting shuffle
    const delayTimer = setTimeout(() => {
      const duration = 2000 // 2 seconds shuffling
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Smooth exponential easing for the shuffle
        const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
        
        const current = Math.round(startValue + (endValue - startValue) * easeOutExpo)
        setDisplayValue(current)

        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }

      requestAnimationFrame(animate)
    }, 1000)

    return () => clearTimeout(delayTimer)
  }, [startValue, endValue])

  return <span>{displayValue.toLocaleString()}</span>
}

export function NexonToastHandler() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    // Subscribe to Nexon award events
    const unsubscribe = eventBus.subscribe("nexon_awarded", async (event: any) => {
      if (event.userId !== user.uid) return

      const data = event.metadata
      const amount = Number(data.amount) || 0
      
      // Fetch latest balance from DB
      const latestBalance = await getUserNexon(user.uid)
      const prevBalance = latestBalance - amount

      // Show toast
      toast.custom((t) => (
        <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-full bg-primary/10 p-2">
              <NexonIcon className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 space-y-1">
              {/* Line 1: +Amount and Icon */}
              <div className="flex items-center gap-1.5 font-bold text-lg text-foreground">
                <span>+{amount}</span>
                <NexonIcon className="h-5 w-5 text-primary" />
              </div>
              
              {/* Line 2: Shuffle Animation */}
              <div className="font-mono text-xl font-black text-primary py-0.5">
                <AnimatedNumber startValue={prevBalance} endValue={latestBalance} />
              </div>

              {/* Line 3: Source Name */}
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {data.source || "Nexon Award"}
              </div>

              {data.description && (
                <p className="text-[10px] text-muted-foreground italic leading-tight mt-1">
                  {data.description}
                </p>
              )}
            </div>
          </div>
        </div>
      ), {
        duration: 5000,
      })
    })

    return () => unsubscribe()
  }, [user])

  return null
}
