"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Sparkles, Gem } from "lucide-react"
import { Cosmetic, getAllCosmetics } from "@/lib/cosmetics-utils"
import { CosmeticWheelPreview } from "@/components/cosmetic-wheel-preview"
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
import { playSpinSound, playRevealSound } from "@/lib/loot-sounds"

interface NexusCacheModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
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

const WHEEL_SIZE = 280
const RIM_RADIUS = 108

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildWheelPool(all: Cosmetic[], winner: Cosmetic, count = 10): Cosmetic[] {
  const paid = all.filter((c) => c.price > 0)
  const others = shuffleArray(paid.filter((c) => c.id !== winner.id)).slice(0, count - 1)
  return shuffleArray([winner, ...others])
}

function calcTargetRotation(winnerIndex: number, segmentCount: number, extraSpins = 5): number {
  const segmentAngle = 360 / segmentCount
  return extraSpins * 360 + (360 - winnerIndex * segmentAngle - segmentAngle / 2)
}

export function NexusCacheModal({
  open,
  onOpenChange,
  userId,
  onRewardClaimed,
}: NexusCacheModalProps) {
  const [styleShards, setStyleShards] = useState(0)
  const [freeCaches, setFreeCaches] = useState(0)
  const [phase, setPhase] = useState<"idle" | "spinning" | "revealed">("idle")
  const [wheelPool, setWheelPool] = useState<Cosmetic[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [reward, setReward] = useState<NexusCacheReward | null>(null)
  const [opening, setOpening] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)

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
      setWheelPool([])
      setWheelRotation(0)
      setIsAnimating(false)
    }
  }, [open, loadShards])

  const handleTransitionEnd = () => {
    if (phase === "spinning" && isAnimating) {
      setIsAnimating(false)
      setPhase("revealed")
      if (reward) {
        playRevealSound(reward.rarity)
      }
      onRewardClaimed?.()
      loadShards()
    }
  }

  const runOpen = async () => {
    if (opening || phase === "spinning") return
    if (freeCaches <= 0 && styleShards < STYLE_SHARDS_PER_NEXUS_CACHE) {
      toast.error(`Need ${STYLE_SHARDS_PER_NEXUS_CACHE} Style Shards to open a Nexus Cache`)
      return
    }

    setOpening(true)
    try {
      const allCosmetics = await getAllCosmetics()
      if (allCosmetics.filter((c) => c.price > 0).length === 0) {
        throw new Error("No cosmetics available")
      }

      const result =
        freeCaches > 0
          ? await (async () => {
              await consumeFreeNexusCache(userId)
              return rollNexusCache(userId)
            })()
          : await openNexusCacheWithShards(userId)

      const pool = buildWheelPool(allCosmetics, result.cosmetic)
      playSpinSound(4200)
      startSpin(pool, result)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to open Nexus Cache"
      toast.error(message)
    } finally {
      setOpening(false)
    }
  }

  const handleOpen = () => {
    void runOpen()
  }

  const handleSpinAgain = () => {
    setPhase("idle")
    setReward(null)
    setWheelPool([])
    setWheelRotation(0)
    setIsAnimating(false)
    void runOpen()
  }

  const startSpin = (pool: Cosmetic[], finalReward: NexusCacheReward) => {
    const winnerIndex = pool.findIndex((c) => c.id === finalReward.cosmetic.id)
    const idx = winnerIndex >= 0 ? winnerIndex : 0
    const target = calcTargetRotation(idx, pool.length, 5 + Math.floor(Math.random() * 3))

    setWheelPool(pool)
    setReward(finalReward)
    setPhase("spinning")
    setWheelRotation(0)
    setIsAnimating(true)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWheelRotation(target)
      })
    })
  }

  const segmentAngle = wheelPool.length > 0 ? 360 / wheelPool.length : 0
  const canSpinAgain =
    freeCaches > 0 || styleShards >= STYLE_SHARDS_PER_NEXUS_CACHE

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
              : `Spend ${STYLE_SHARDS_PER_NEXUS_CACHE} Style Shards to spin for a random cosmetic.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {freeCaches === 0 && phase === "idle" && (
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
              <Gem className="h-5 w-5 text-violet-500" />
              <span className="text-lg font-bold">{styleShards}</span>
              <span className="text-sm text-muted-foreground">Style Shards</span>
            </div>
          )}

          {/* Wheel + pointer */}
          <div
            className="relative mx-auto"
            style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
          >
            {/* Arrow pointer at top */}
            <div className="absolute top-0 left-1/2 z-30 -translate-x-1/2 -translate-y-1">
              <div
                className="h-0 w-0 border-x-[10px] border-x-transparent border-t-[16px] border-t-primary drop-shadow-md"
                aria-hidden
              />
              <div className="mx-auto mt-0.5 h-1 w-6 rounded-full bg-primary/80" />
            </div>

            {/* Outer ring */}
            <div className="absolute inset-2 rounded-full border-4 border-primary/25 bg-muted/30 shadow-inner" />

            {/* Spinning wheel */}
            <div
              ref={wheelRef}
              className="absolute inset-5 rounded-full"
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transition: isAnimating
                  ? "transform 4.2s cubic-bezier(0.12, 0.8, 0.2, 1)"
                  : "none",
              }}
              onTransitionEnd={handleTransitionEnd}
            >
              {/* Segment slices */}
              {wheelPool.map((_, i) => (
                <div
                  key={`seg-${i}`}
                  className="absolute top-1/2 left-1/2 origin-bottom"
                  style={{
                    width: 2,
                    height: RIM_RADIUS,
                    marginLeft: -1,
                    marginTop: -RIM_RADIUS,
                    transform: `rotate(${i * segmentAngle + segmentAngle / 2}deg)`,
                    background: i % 2 === 0 ? "rgba(var(--primary-rgb, 20 184 166), 0.15)" : "transparent",
                  }}
                />
              ))}

              {/* Cosmetic items on rim */}
              {wheelPool.map((item, i) => {
                const angle = i * segmentAngle
                const isWinner =
                  phase === "revealed" && reward?.cosmetic.id === item.id
                return (
                  <div
                    key={item.id}
                    className="absolute top-1/2 left-1/2"
                    style={{
                      width: 44,
                      height: 44,
                      marginLeft: -22,
                      marginTop: -22,
                      transform: `rotate(${angle}deg) translateY(-${RIM_RADIUS}px) rotate(${-angle}deg)`,
                    }}
                  >
                    <div
                      className={`flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-background p-0.5 shadow-sm transition-all ${
                        isWinner
                          ? "border-primary scale-110 ring-2 ring-primary/50"
                          : "border-border/60"
                      }`}
                    >
                      <CosmeticWheelPreview cosmetic={item} size={34} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Center hub */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="z-20 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/40 bg-background shadow-lg">
                {phase === "spinning" ? (
                  <Spinner className="h-6 w-6 text-primary" />
                ) : phase === "revealed" && reward ? (
                  <CosmeticWheelPreview cosmetic={reward.cosmetic} size={40} />
                ) : (
                  <Gem className="h-6 w-6 text-violet-500" />
                )}
              </div>
            </div>
          </div>

          {phase === "idle" && (
            <Button className="w-full" onClick={handleOpen} disabled={opening}>
              {opening ? (
                <Spinner className="h-4 w-4" />
              ) : freeCaches > 0 ? (
                `Spin Free Cache (${freeCaches})`
              ) : (
                <>
                  Spin for {STYLE_SHARDS_PER_NEXUS_CACHE}{" "}
                  <Gem className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {phase === "spinning" && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">
              Spinning…
            </p>
          )}

          {phase === "revealed" && reward && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl border border-border/60 bg-background shadow-sm">
                <CosmeticWheelPreview cosmetic={reward.cosmetic} size={52} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                You won
              </p>
              <p className="font-semibold text-foreground">{reward.cosmetic.name}</p>
              <Badge
                variant="outline"
                className={`mt-2 ${RARITY_COLORS[reward.rarity] || ""}`}
              >
                {reward.rarity} · {reward.cosmetic.category}
              </Badge>
              <div className="mt-3 flex flex-col gap-2">
                {canSpinAgain && (
                  <Button className="w-full" onClick={handleSpinAgain} disabled={opening}>
                    {opening ? (
                      <Spinner className="h-4 w-4" />
                    ) : freeCaches > 0 ? (
                      `Spin Again (${freeCaches} free)`
                    ) : (
                      <>
                        Spin Again · {STYLE_SHARDS_PER_NEXUS_CACHE}{" "}
                        <Gem className="ml-1.5 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                  Awesome!
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
