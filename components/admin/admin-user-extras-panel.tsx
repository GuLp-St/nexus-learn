"use client"

import { useCallback, useEffect, useState } from "react"
import { Award, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { adminJson } from "@/lib/admin-api-client"
import { toast } from "sonner"

type BadgeState = Record<string, { unlocked: boolean }>

type ExtrasData = {
  badgeIds: string[]
  badges: BadgeState
  cosmetics: {
    ownedCosmetics: Record<string, string[]>
    equipped: Record<string, string | null>
  }
  catalog: { id: string; category: string; name: string; price: number; rarity: string }[]
}

const BADGE_LABELS: Record<string, string> = {
  "first-steps": "First Steps",
  "quiz-master": "Quiz Master",
  "marathon-runner": "Marathon Runner",
  "early-bird": "Early Bird",
  "knowledge-seeker": "Knowledge Seeker",
  perfectionist: "Perfectionist",
}

export function AdminUserExtrasPanel({
  userId,
  onUpdated,
}: {
  userId: string
  onUpdated?: () => void
}) {
  const [data, setData] = useState<ExtrasData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cosmeticFilter, setCosmeticFilter] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminJson<ExtrasData>(`/api/admin/users/${userId}/extras`)
      setData(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load badges/cosmetics")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await adminJson(`/api/admin/users/${userId}/extras`, {
        method: "PATCH",
        body,
      })
      await load()
      onUpdated?.()
      toast.success("Updated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading badges & cosmetics…</p>
  }

  if (!data) return null

  const owned = data.cosmetics.ownedCosmetics
  const isOwned = (id: string, category: string) => {
    const key = `${category}s` as keyof typeof owned
    return owned[key]?.includes(id) ?? false
  }

  const filteredCatalog =
    cosmeticFilter === "all"
      ? data.catalog
      : data.catalog.filter((c) => c.category === cosmeticFilter)

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <Award className="h-4 w-4" />
          Badges
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.badgeIds.map((id) => {
            const unlocked = data.badges[id]?.unlocked ?? false
            return (
              <Button
                key={id}
                size="sm"
                variant={unlocked ? "secondary" : "outline"}
                className="h-8 text-xs"
                disabled={busy}
                onClick={() =>
                  patch({ action: "set_badge", badgeId: id, unlocked: !unlocked })
                }
              >
                {BADGE_LABELS[id] ?? id}
                {unlocked ? " ✓" : ""}
              </Button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4" />
          Cosmetics
        </h3>
        <div className="flex flex-wrap gap-1 mb-2">
          {["all", "avatar", "frame", "wallpaper", "nameColor", "theme"].map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={cosmeticFilter === cat ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setCosmeticFilter(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border p-2">
          {filteredCatalog.map((c) => {
            const ownedItem = isOwned(c.id, c.category)
            const equipped = Object.values(data.cosmetics.equipped).includes(c.id)
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 text-xs py-1"
              >
                <span className="truncate min-w-0">
                  {c.name}
                  <span className="text-muted-foreground ml-1">({c.rarity})</span>
                </span>
                <div className="flex gap-1 shrink-0">
                  {equipped && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      equipped
                    </Badge>
                  )}
                  {ownedItem ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        disabled={busy}
                        onClick={() =>
                          patch({
                            action: "equip_cosmetic",
                            cosmeticId: c.id,
                            category: c.category,
                          })
                        }
                      >
                        Equip
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-destructive"
                        disabled={busy}
                        onClick={() =>
                          patch({
                            action: "revoke_cosmetic",
                            cosmeticId: c.id,
                            category: c.category,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          action: "grant_cosmetic",
                          cosmeticId: c.id,
                          category: c.category,
                        })
                      }
                    >
                      Grant
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
