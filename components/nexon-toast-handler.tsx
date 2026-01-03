"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { NexonIcon } from "./ui/nexon-icon"
import { eventBus } from "@/lib/event-bus"
import { getUserNexon } from "@/lib/nexon-utils"
import { useAuth } from "./auth-provider"

/**
 * Animated number component for Nexon balance change
 */
function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    let start = displayValue
    const end = value
    if (start === end) return

    const duration = 1000
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOutQuad = 1 - (1 - progress) * (1 - progress)
      
      const current = Math.floor(start + (end - start) * easeOutQuad)
      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [value])

  return <span>{displayValue.toLocaleString()}</span>
}

export function NexonToastHandler() {
  const { user } = useAuth()
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!user) {
      setCurrentBalance(null)
      return
    }

    // Initial balance fetch
    getUserNexon(user.uid).then(setCurrentBalance)

    // Subscribe to Nexon award events
    const unsubscribe = eventBus.subscribe("nexon_awarded", (event: any) => {
      if (event.userId !== user.uid) return

      const data = event.metadata
      const prevBalance = currentBalance || 0
      const newBalance = prevBalance + data.amount
      setCurrentBalance(newBalance)

      // Show toast
      toast.custom((t) => (
        <div className="flex flex-col gap-2 p-4 bg-card border rounded-lg shadow-lg w-full max-w-[300px] animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NexonIcon className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">+{data.amount} Nexon</span>
            </div>
            <span className="text-xs text-muted-foreground">{data.source}</span>
          </div>
          
          <div className="text-xs text-muted-foreground flex justify-between items-center border-t pt-2 mt-1">
            <span>Balance Update:</span>
            <div className="flex items-center gap-1 font-mono">
              <span>{prevBalance.toLocaleString()}</span>
              <span>→</span>
              <span className="text-primary font-bold">
                <AnimatedNumber value={newBalance} />
              </span>
            </div>
          </div>
          
          {data.description && (
            <p className="text-[10px] text-muted-foreground italic leading-tight mt-1 truncate">
              "{data.description}"
            </p>
          )}
        </div>
      ), {
        duration: 4000,
        position: "bottom-right",
      })
    })

    return () => unsubscribe()
  }, [user, currentBalance])

  return null
}

