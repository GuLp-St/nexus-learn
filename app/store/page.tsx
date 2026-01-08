"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ShoppingBag, Eye, Check, Sparkles, Image, Palette, Frame } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { getUserNexon } from "@/lib/nexon-utils"
import { getAllCosmetics, getCosmeticsByCategory, purchaseCosmetic, equipCosmetic, getUserCosmetics, Cosmetic, CosmeticCategory, getCosmeticPreviewUrl } from "@/lib/cosmetics-utils"
import { Spinner } from "@/components/ui/spinner"
import { trackQuestProgress } from "@/lib/daily-quest-utils"
import { toast } from "sonner"
import Link from "next/link"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { NexonHistoryModal } from "@/components/nexon-history-modal"
import { WallpaperRenderer } from "@/components/wallpapers/wallpaper-renderer"

export default function StorePage() {
  const { user, nickname, loading: authLoading } = useAuth()
  const { setPageContext } = useChatContext()
  const router = useRouter()
  const [nexon, setNexon] = useState<number>(0)
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([])
  const [userCosmetics, setUserCosmetics] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory>("avatar")
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [equipping, setEquipping] = useState<string | null>(null)
  const [previewCosmetic, setPreviewCosmetic] = useState<Cosmetic | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const tabsListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tabsListRef.current) {
      const activeTab = tabsListRef.current.querySelector('[data-state="active"]')
      if (activeTab) {
        activeTab.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        })
      }
    }
  }, [selectedCategory])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    trackQuestProgress(user.uid, "visit_shop")
    loadData()
  }, [user, authLoading, router])

  // Set chatbot context with real-time store data
  useEffect(() => {
    if (!authLoading && user) {
      setPageContext({
        title: "Store",
        description: "Browse and purchase cosmetics including avatars, frames, wallpapers, and name colors using Nexon currency.",
        data: {
          nexon,
          selectedCategory,
          cosmetics: cosmetics.filter(c => c.category === selectedCategory).map((cosmetic) => ({
            id: cosmetic.id,
            name: cosmetic.name,
            description: cosmetic.description,
            price: cosmetic.price,
            category: cosmetic.category,
            isOwned: userCosmetics?.[cosmetic.category]?.includes(cosmetic.id) || false,
          })),
          userCosmetics,
        },
      })
    }
  }, [user, authLoading, nexon, selectedCategory, cosmetics, userCosmetics, setPageContext])

  const loadData = async () => {
    if (!user) return
    try {
      setLoading(true)
      const [nexonBalance, allCosmetics, userCosmeticData] = await Promise.all([
        getUserNexon(user.uid),
        getAllCosmetics(),
        getUserCosmetics(user.uid),
      ])
      setNexon(nexonBalance)
      setCosmetics(allCosmetics)
      setUserCosmetics(userCosmeticData)
    } catch (error) {
      console.error("Error loading store data:", error)
      toast.error("Failed to load store")
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async (cosmeticId: string) => {
    if (!user || purchasing) return
    try {
      setPurchasing(cosmeticId)
      await purchaseCosmetic(user.uid, cosmeticId)
      toast.success("Cosmetic purchased!")
      await loadData()
    } catch (error: any) {
      console.error("Error purchasing cosmetic:", error)
      toast.error(error.message || "Failed to purchase cosmetic")
    } finally {
      setPurchasing(null)
    }
  }

  const handleEquip = async (cosmeticId: string, category: CosmeticCategory) => {
    if (!user || equipping) return
    try {
      setEquipping(cosmeticId)
      await equipCosmetic(user.uid, cosmeticId, category)
      toast.success("Cosmetic equipped!")
      await loadData()
    } catch (error: any) {
      console.error("Error equipping cosmetic:", error)
      toast.error(error.message || "Failed to equip cosmetic")
    } finally {
      setEquipping(null)
    }
  }

  const handlePreview = (cosmetic: Cosmetic) => {
    setPreviewCosmetic(cosmetic)
    setPreviewOpen(true)
  }

  const getFrameXPClasses = (frameId: string | null | undefined) => {
    if (!frameId) return "text-primary"
    
    // Glow frames
    if (frameId === "frame-neon-blue") return "xp-glow-neon-blue"
    if (frameId === "frame-radioactive") return "xp-glow-radioactive"
    if (frameId === "frame-void") return "xp-glow-void"
    
    // Motion frames
    if (frameId === "frame-rgb-gamer") return "xp-frame-rgb-gamer"
    if (frameId === "frame-golden-lustre") return "xp-frame-golden-lustre"
    if (frameId === "frame-nexus-glitch") return "xp-frame-nexus-glitch"

    // Legendary Series (Structure) - Still provide a color for the XP bar
    if (frameId === "frame-laurels") return "text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
    if (frameId === "frame-devil-horns") return "text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
    if (frameId === "frame-crown") return "text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]"
    
    return "text-primary"
  }

  const renderStructuralXPFrame = (frameId: string | null | undefined) => {
    if (!frameId) return null

    // Structure frames
    if (frameId === "frame-laurels") {
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <div className="text-emerald-400 text-5xl">🌿</div>
        </div>
      )
    }
    if (frameId === "frame-devil-horns") {
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none z-50">
          <div className="text-red-500 text-5xl">👹</div>
        </div>
      )
    }
    if (frameId === "frame-crown") {
      return (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <div className="text-yellow-500 text-6xl">👑</div>
        </div>
      )
    }

    return null
  }

  const getFrameClass = (frameId: string | undefined): string => {
    if (!frameId) return "border-primary"

    // Glow frames
    if (frameId === "frame-neon-blue") return "border-cyan-500 shadow-[0_0_15px_#06b6d4]"
    if (frameId === "frame-radioactive") return "border-green-500 shadow-[0_0_15px_#22c55e] animate-pulse"
    if (frameId === "frame-void") return "border-purple-500 shadow-[0_0_15px_#8b5cf6]"

    // Motion frames (handled by CSS)
    if (frameId === "frame-rgb-gamer") return "cosmetic-frame-rgb-gamer border-transparent"
    if (frameId === "frame-golden-lustre") return "cosmetic-frame-golden-lustre border-transparent"
    if (frameId === "frame-nexus-glitch") return "cosmetic-frame-nexus-glitch border-transparent"

    // Legendary Series (Structure)
    if (frameId === "frame-laurels") return "border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
    if (frameId === "frame-devil-horns") return "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
    if (frameId === "frame-crown") return "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]"

    return "border-primary"
  }

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "common": return "bg-gray-500"
      case "uncommon": return "bg-green-500"
      case "rare": return "bg-blue-500"
      case "epic": return "bg-purple-500"
      case "legendary": return "bg-yellow-500"
      case "unique": return "bg-orange-600"
      default: return "bg-gray-500"
    }
  }

  const getWallpaperPreviewClass = (wallpaperId: string): string => {
    // Strip "wallpaper-" prefix if present to match CSS class names
    return `cosmetic-wallpaper-${wallpaperId.replace("wallpaper-", "")}`
  }

  const getNameColorPreviewClass = (nameColorId: string): string => {
    // Common - Solid colors
    if (nameColorId === "name-crimson") return "text-rose-600 dark:text-rose-400"
    if (nameColorId === "name-azure") return "text-cyan-600 dark:text-cyan-400"
    if (nameColorId === "name-lime") return "text-lime-600 dark:text-lime-400"

    // Rare - Gradients
    if (nameColorId === "name-golden-god") return "cosmetic-name-golden-god"
    if (nameColorId === "name-cyberpunk") return "cosmetic-name-cyberpunk"
    if (nameColorId === "name-ice-cold") return "cosmetic-name-ice-cold"

    // Legendary - Animated
    if (nameColorId === "name-rgb-gamer") return "cosmetic-name-rgb-gamer"
    if (nameColorId === "name-neon") return "cosmetic-name-neon"
    if (nameColorId === "name-glitch") return "cosmetic-name-glitch"

    return ""
  }

  const renderFramePreview = (frameId: string): React.ReactNode => {
    if (frameId === "frame-laurels") {
      return (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-emerald-400 text-2xl z-50">🌿</div>
      )
    }
    if (frameId === "frame-devil-horns") {
      return (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-red-500 text-2xl z-50">👹</div>
      )
    }
    if (frameId === "frame-crown") {
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-500 text-2xl z-50">👑</div>
      )
    }
    return null
  }

  const categoryCosmetics = cosmetics.filter(c => {
    // Hide common avatars from the store as they are unlocked by default
    if (selectedCategory === "avatar" && c.rarity === "common") return false
    return c.category === selectedCategory
  })
  const isOwned = (cosmeticId: string) => {
    const ownedKey = `${selectedCategory}s` as keyof typeof userCosmetics.ownedCosmetics
    return userCosmetics?.ownedCosmetics[ownedKey]?.includes(cosmeticId) || false
  }
  const isEquipped = (cosmeticId: string) => {
    if (selectedCategory === "avatar") return userCosmetics?.avatarStyle === cosmeticId
    if (selectedCategory === "frame") return userCosmetics?.avatarFrame === cosmeticId
    if (selectedCategory === "wallpaper") return userCosmetics?.wallpaper === cosmeticId
    if (selectedCategory === "nameColor") return userCosmetics?.nameColor === cosmeticId
    return false
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav currentPath="/store" />
        <main className="flex-1 flex items-center justify-center">
          <Spinner />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/store" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Header with Nexon Balance */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Store</h1>
                <p className="text-muted-foreground mt-1">Purchase cosmetics to customize your profile</p>
              </div>
              <Card 
                className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50 group"
                onClick={() => setHistoryOpen(true)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <NexonIcon className="h-6 w-6 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-2xl font-bold">{nexon.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
                </CardContent>
              </Card>
            </div>

            {/* Category Tabs */}
            <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as CosmeticCategory)}>
              <TabsList ref={tabsListRef} className="flex h-auto w-full items-center justify-start overflow-x-auto overflow-y-hidden bg-muted p-1 text-muted-foreground md:grid md:grid-cols-4 no-scrollbar">
                <TabsTrigger value="avatar" className="flex items-center gap-2 px-4 py-2 flex-shrink-0 md:flex-shrink">
                  <Sparkles className="h-4 w-4" />
                  Avatars
                </TabsTrigger>
                <TabsTrigger value="frame" className="flex items-center gap-2 px-4 py-2 flex-shrink-0 md:flex-shrink">
                  <Frame className="h-4 w-4" />
                  Frames
                </TabsTrigger>
                <TabsTrigger value="wallpaper" className="flex items-center gap-2 px-4 py-2 flex-shrink-0 md:flex-shrink">
                  <Image className="h-4 w-4" />
                  Wallpapers
                </TabsTrigger>
                <TabsTrigger value="nameColor" className="flex items-center gap-2 px-4 py-2 flex-shrink-0 md:flex-shrink">
                  <Palette className="h-4 w-4" />
                  Name Colors
                </TabsTrigger>
              </TabsList>

              <TabsContent value={selectedCategory} className="mt-6">
                {categoryCosmetics.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No cosmetics available in this category.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {categoryCosmetics.map((cosmetic) => {
                    const owned = isOwned(cosmetic.id)
                    const equipped = isEquipped(cosmetic.id)
                    const canAfford = nexon >= cosmetic.price

                    return (
                      <Card key={cosmetic.id} className="overflow-hidden flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-lg truncate">{cosmetic.name}</CardTitle>
                              <CardDescription className="mt-1 line-clamp-1">{cosmetic.description}</CardDescription>
                            </div>
                            <Badge className={`${getRarityColor(cosmetic.rarity)} shrink-0`}>
                              {cosmetic.rarity}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Preview area - different for each category */}
                          <div className="h-32 rounded-lg bg-muted flex items-center justify-center">
                            {cosmetic.category === "avatar" && (
                              <img
                                src={getCosmeticPreviewUrl(cosmetic, user?.uid || "preview") || ""}
                                alt={cosmetic.name}
                                className="h-24 w-24 rounded-full"
                              />
                            )}
                            {cosmetic.category === "frame" && (
                              <div className={`relative h-24 w-24 rounded-full bg-primary/20 border-4 flex items-center justify-center ${getFrameClass(cosmetic.id)}`}>
                                <div className="h-16 w-16 rounded-full bg-primary/40" />
                                <Frame className="absolute h-8 w-8 text-primary/50" />
                                {renderFramePreview(cosmetic.id)}
                              </div>
                            )}
                            {cosmetic.category === "wallpaper" && (
                              <div className="h-full w-full rounded-lg relative overflow-hidden">
                                {cosmetic.config?.type === "animated" ? (
                                  <WallpaperRenderer wallpaper={cosmetic.id} className="rounded-lg" />
                                ) : (
                                  <div className={`h-full w-full rounded-lg cosmetic-wallpaper-${cosmetic.id.replace("wallpaper-", "")}`} />
                                )}
                              </div>
                            )}
                            {cosmetic.category === "nameColor" && (
                              <div className={`text-2xl font-bold ${getNameColorPreviewClass(cosmetic.id)}`}>
                                Sample Text
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <NexonIcon className="h-5 w-5 text-primary" />
                              <span className="text-lg font-semibold">{cosmetic.price}</span>
                            </div>
                            {equipped && (
                              <Badge variant="default" className="bg-primary">
                                <Check className="h-3 w-3 mr-1" />
                                Equipped
                              </Badge>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {!owned ? (
                              <Button
                                className="flex-1"
                                onClick={() => handlePurchase(cosmetic.id)}
                                disabled={!canAfford || purchasing === cosmetic.id}
                              >
                                {purchasing === cosmetic.id ? (
                                  <>
                                    <Spinner className="h-4 w-4 mr-2" />
                                    Purchasing...
                                  </>
                                ) : (
                                  <>
                                    <NexonIcon className="h-4 w-4 mr-2" />
                                    Purchase
                                  </>
                                )}
                              </Button>
                            ) : cosmetic.category === "avatar" ? (
                              <Button
                                className="flex-1"
                                variant="secondary"
                                disabled
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Purchased
                              </Button>
                            ) : !equipped ? (
                              <Button
                                className="flex-1"
                                onClick={() => handleEquip(cosmetic.id, cosmetic.category)}
                                disabled={equipping === cosmetic.id}
                              >
                                {equipping === cosmetic.id ? (
                                  <>
                                    <Spinner className="h-4 w-4 mr-2" />
                                    Equipping...
                                  </>
                                ) : (
                                  "Equip"
                                )}
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              onClick={() => handlePreview(cosmetic)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent">
          {previewCosmetic && (
            <div className={`relative min-h-[500px] w-full flex flex-col items-center justify-center p-8 rounded-xl overflow-hidden shadow-2xl ${
              (() => {
                const isPreviewingWallpaper = previewCosmetic.category === "wallpaper"
                const wallpaperId = isPreviewingWallpaper ? previewCosmetic.id : userCosmetics?.wallpaper
                const wallpaper = wallpaperId ? cosmetics.find(c => c.id === wallpaperId) : null
                const isUnique = wallpaper?.rarity === "unique"
                const wallpaperClass = wallpaperId ? getWallpaperPreviewClass(wallpaperId) : ""
                
                if (isPreviewingWallpaper) {
                  if (previewCosmetic.config?.type === "animated") {
                    return isUnique ? `bg-background profile-glass-theme ${wallpaperClass}` : "bg-background"
                  }
                  return isUnique ? `profile-glass-theme ${wallpaperClass}` : wallpaperClass
                } else {
                  return wallpaperId 
                    ? (isUnique ? `profile-glass-theme ${wallpaperClass}` : wallpaperClass)
                    : "bg-background"
                }
              })()
            }`}>
              {/* Render animated wallpaper if previewing one */}
              {previewCosmetic.category === "wallpaper" && previewCosmetic.config?.type === "animated" && (
                <WallpaperRenderer wallpaper={previewCosmetic.id} className="absolute inset-0 rounded-xl" />
              )}
              {/* Render background wallpaper for non-wallpaper cosmetics */}
              {previewCosmetic.category !== "wallpaper" && userCosmetics?.wallpaper && (
                (() => {
                  const bgWallpaper = cosmetics.find(c => c.id === userCosmetics.wallpaper)
                  return bgWallpaper?.config?.type === "animated" ? (
                    <WallpaperRenderer wallpaper={userCosmetics.wallpaper} className="absolute inset-0 rounded-xl" />
                  ) : null
                })()
              )}
              <div className="z-10 w-full max-w-2xl bg-background/40 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl space-y-8">
                <div className="text-center space-y-2">
                  <Badge className={`${getRarityColor(previewCosmetic.rarity)} mb-2`}>
                    {previewCosmetic.rarity.toUpperCase()}
                  </Badge>
                  <DialogTitle className="text-3xl font-bold text-foreground">
                    Preview: {previewCosmetic.name}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground italic">
                    {previewCosmetic.description}
                  </DialogDescription>
                </div>

                {/* Profile Header Preview */}
                <div className="flex flex-col items-center space-y-6 text-center py-4">
                  {/* Avatar with Level Progress */}
                  <div className="relative h-40 w-40 flex items-center justify-center">
                    {/* Use CSS-based glitch ring when previewing glitch frame */}
                    {(previewCosmetic.category === "frame" ? previewCosmetic.id : userCosmetics?.avatarFrame) === "frame-nexus-glitch" ? (
                      <div 
                        className="glitch-xp-ring" 
                        style={{ "--progress": 75 } as React.CSSProperties}
                      />
                    ) : (
                      <svg className="absolute inset-0 h-40 w-40 -rotate-90 transform" viewBox="0 0 160 160">
                        <circle
                          cx="80"
                          cy="80"
                          r="76"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                          className="text-accent/20"
                        />
                        <circle
                          cx="80"
                          cy="80"
                          r="76"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 76}`}
                          strokeDashoffset={`${2 * Math.PI * 76 * 0.25}`} // Fixed 75% for preview
                          className={`${getFrameXPClasses(
                            previewCosmetic.category === "frame" ? previewCosmetic.id : userCosmetics?.avatarFrame
                          )} transition-all duration-1000`}
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    <AvatarWithCosmetics
                      userId={user?.uid || "preview"}
                      nickname={nickname || "User"}
                      avatarUrl={null}
                      size="xl"
                      hideFrame={true}
                      overrideStyle={previewCosmetic.category === "avatar" ? previewCosmetic.id : userCosmetics?.avatarStyle}
                      overrideFrame={previewCosmetic.category === "frame" ? previewCosmetic.id : userCosmetics?.avatarFrame}
                    />
                    {renderStructuralXPFrame(
                      previewCosmetic.category === "frame" ? previewCosmetic.id : userCosmetics?.avatarFrame
                    )}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-bold text-primary-foreground shadow-md z-10">
                      Level 10
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h2 
                      className="text-3xl font-bold text-foreground"
                      data-has-name-color={(previewCosmetic.category === "nameColor" ? previewCosmetic.id : userCosmetics?.nameColor) ? "true" : "false"}
                    >
                      <NameWithColor
                        userId={user?.uid || "preview"}
                        name={nickname || "Learner Name"}
                        overrideColor={previewCosmetic.category === "nameColor" ? previewCosmetic.id : userCosmetics?.nameColor}
                      />
                    </h2>
                    <p className="text-muted-foreground">
                      Aspiring Nexus Scholar
                    </p>
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    className="w-full h-12 text-lg font-semibold shadow-lg hover:scale-[1.02] transition-transform" 
                    onClick={() => setPreviewOpen(false)}
                    variant="secondary"
                  >
                    Return to Store
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NexonHistoryModal 
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        userId={user?.uid || ""}
      />
    </div>
  )
}

