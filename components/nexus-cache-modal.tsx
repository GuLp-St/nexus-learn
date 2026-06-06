"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Sparkles, Gem } from "lucide-react"
import { Cosmetic, getAllCosmetics, getCosmeticPreviewUrl } from "@/lib/cosmetics-utils"
import {
  getStyleShards,
  openNexusCacheWithShards,
  rollNexusCache,
  consumeFreeNexusCache,
  getFreeNexusCaches,
  STYLE_SHARDS_PER_NEXUS_CACHE,
  type NexusCacheReward,
} from "@/lib/style-shard-utils"
import { toast } from "sonner"

interface NexusCacheModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** When true, opens a free cache (e.g. from final quiz 100%) */
  freeOpen?: boolean
  onRewardClaimed?: () => void
}

const RARITY_COLORS: Record<string, string> = {
  uncommon: "bg-green-500/15 text-green-600 border-green-500/30",
  rare: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  epic: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  legendary: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  unique: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

export function NexusCacheModal({
  open,
  onOpenChange,
  userId,
  freeOpen = false,
  onRewardClaimed,
}: NexusCacheModalProps) {
  const [styleShards, setStyleShards] = useState(0)
  const [freeCaches, setFreeCaches] = useState(0)
  const [phase, setPhase] = useState<"idle" | "shuffling" | "revealed">("idle")
  const [displayItems, setDisplayItems] = useState<Cosmetic[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [reward, setReward] = useState<NexusCacheReward | null>(null)
  const [opening, setOpening] = useState(false)
  const shuffleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadShards = useCallback(async () => {
    const [shards, free] = await Promise.all([getStyleShards(userId), getFreeNexusCaches(userId)])
    setStyleShards(shards)
    setFreeCaches(free)
  }, [userId])

  useEffect(() => {
    if (open) {
      loadShards()
      setPhase("idle")
      setReward(null)
      setDisplayItems([])
    }
    return () => {
      if (shuffleTimerRef.current) clearTimeout(shuffleTimerRef.current)
    }
  }, [open, loadShards])

  const runShuffleAnimation = (pool: Cosmetic[], finalReward: NexusCacheReward) => {
    setPhase("shuffling")
    const start = performance.now()
    const duration = 3200
    let lastTick = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOutCubic(progress)
      const interval = 40 + eased * 280

      if (now - lastTick >= interval) {
        lastTick = now
        const randomIndex = Math.floor(Math.random() * pool.length)
        setHighlightIndex(randomIndex)
        setDisplayItems((prev) => {
          const item = pool[randomIndex]
          const next = [...prev, item].slice(-5)
          return next
        })
      }

      if (progress < 1) {
        shuffleTimerRef.current = setTimeout(() => tick(performance.now()), 16) as unknown as ReturnType<typeof setTimeout>
        requestAnimationFrame(() => tick(performance.now()))
      } else {
        const finalIndex = pool.findIndex((c) => c.id === finalReward.cosmetic.id)
        setHighlightIndex(finalIndex >= 0 ? finalIndex : 0)
        setPhase("revealed")
        setReward(finalReward)
        onRewardClaimed?.()
        loadShards()
      }
    }

    requestAnimationFrame(tick)
  }

  const handleOpen = async () => {
    if (opening || phase === "shuffling") return
    if (!freeOpen && freeCaches <= 0 && styleShards < STYLE_SHARDS_PER_NEXUS_CACHE) {
      toast.error(`Need ${STYLE_SHARDS_PER_NEXUS_CACHE} Style Shards to open a Nexus Cache`)
      return
    }

    setOpening(true)
    try {
      const allCosmetics = await getAllCosmetics()
      const pool = allCosmetics.filter((c) => c.price > 0).slice(0, 24)
      if (pool.length === 0) throw new Error("No cosmetics available")

      const result = freeCaches > 0
        ? await (async () => {
            await consumeFreeNexusCache(userId)
            return rollNexusCache(userId)
          })()
        : await openNexusCacheWithShards(userId)

      runShuffleAnimation(pool, result)
      toast.success(`You unlocked ${result.cosmetic.name}!`)
    } catch (error: any) {
      toast.error(error.message || "Failed to open Nexus Cache")
    } finally {
      setOpening(false)
    }
  }

  const previewItem = reward?.cosmetic ?? displayItems[displayItems.length - 1]
  const previewUrl = previewItem ? getCosmeticPreviewUrl(previewItem) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nexus Cache
          </DialogTitle>
          <DialogDescription>
            {freeCaches > 0
              ? `You have ${freeCaches} free Nexus Cache${freeCaches > 1 ? "s" : ""} to open!`
              : `Spend ${STYLE_SHARDS_PER_NEXUS_CACHE} Style Shards to unlock a random cosmetic.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!freeOpen && freeCaches === 0 && (
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
              <Gem className="h-5 w-5 text-violet-500" />
              <span className="text-lg font-bold">{styleShards}</span>
              <span className="text-sm text-muted-foreground">Style Shards</span>
            </div>
          )}

          <div className="relative mx-auto flex h-44 w-44 items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 shadow-lg">
            {phase === "shuffling" && (
              <div className="absolute inset-0 animate-pulse bg-primary/5" />
            )}
            {previewItem ? (
              <div className={`flex flex-col items-center gap-2 p-4 transition-all ${phase === "shuffling" ? "scale-95 opacity-80" : "scale-100"}`}>
                {previewUrl ? (
                  <img src={previewUrl} alt={previewItem.name} className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-2xl">
                    ✨
                  </div>
                )}
                <p className="text-center text-sm font-semibold line-clamp-2">{previewItem.name}</p>
                <Badge variant="outline" className={RARITY_COLORS[previewItem.rarity] || ""}>
                  {previewItem.rarity}
                </Badge>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Sparkles className="h-10 w-10 text-primary/50" />
                <p className="text-sm">Ready to open</p>
              </div>
            )}
          </div>

          {phase === "idle" && (
            <Button className="w-full" onClick={handleOpen} disabled={opening}>
              {opening ? (
                <Spinner className="h-4 w-4" />
              ) : freeCaches > 0 ? (
                `Open Free Cache (${freeCaches})`
              ) : (
                <>
                  Open for {STYLE_SHARDS_PER_NEXUS_CACHE}{" "}
                  <Gem className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {phase === "shuffling" && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">
              Shuffling rewards…
            </p>
          )}

          {phase === "revealed" && reward && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="font-semibold text-foreground">{reward.cosmetic.name}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{reward.cosmetic.category} · {reward.rarity}</p>
              <Button variant="outline" className="mt-3 w-full" onClick={() => onOpenChange(false)}>
                Awesome!
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
