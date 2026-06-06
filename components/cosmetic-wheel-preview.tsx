"use client"

import type { CSSProperties } from "react"
import { Frame, Sparkles } from "lucide-react"
import { Cosmetic, getCosmeticPreviewUrl } from "@/lib/cosmetics-utils"
import { getNameColorClass, getNameColorStyle } from "@/lib/name-color-classes"
import { useTheme } from "@/components/theme-provider"
import { WallpaperRenderer } from "@/components/wallpapers/wallpaper-renderer"

function getFrameClass(frameId: string): string {
  if (frameId === "frame-neon-blue") return "border-cyan-500 shadow-[0_0_8px_#06b6d4]"
  if (frameId === "frame-radioactive") return "border-green-500 shadow-[0_0_8px_#22c55e]"
  if (frameId === "frame-void") return "border-purple-500 shadow-[0_0_8px_#8b5cf6]"
  if (frameId === "frame-rgb-gamer") return "cosmetic-frame-rgb-gamer border-transparent"
  if (frameId === "frame-golden-lustre") return "cosmetic-frame-golden-lustre border-transparent"
  if (frameId === "frame-nexus-glitch") return "cosmetic-frame-nexus-glitch border-transparent"
  if (frameId === "frame-laurels") return "border-emerald-500"
  if (frameId === "frame-devil-horns") return "border-red-500"
  if (frameId === "frame-crown") return "border-yellow-400"
  return "border-primary"
}

function getFrameOverlay(frameId: string): string | null {
  if (frameId === "frame-laurels") return "🌿"
  if (frameId === "frame-devil-horns") return "👹"
  if (frameId === "frame-crown") return "👑"
  return null
}

function getWallpaperClass(wallpaperId: string): string {
  return `cosmetic-wallpaper-${wallpaperId.replace("wallpaper-", "")}`
}

function getThemeSwatchStyle(cosmetic: Cosmetic): CSSProperties {
  if (cosmetic.id === "theme-rgb") {
    return { background: "linear-gradient(90deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)" }
  }
  if (cosmetic.id === "theme-noir") {
    return { backgroundColor: "var(--foreground)" }
  }
  return { backgroundColor: cosmetic.config?.primary || "var(--primary)" }
}

interface CosmeticWheelPreviewProps {
  cosmetic: Cosmetic
  size?: number
  className?: string
}

export function CosmeticWheelPreview({
  cosmetic,
  size = 32,
  className = "",
}: CosmeticWheelPreviewProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  if (cosmetic.category === "avatar") {
    const previewUrl = getCosmeticPreviewUrl(cosmetic, cosmetic.id)
    if (previewUrl) {
      return (
        <img
          src={previewUrl}
          alt=""
          className={`rounded-full object-cover shrink-0 ${className}`}
          style={{ width: size, height: size }}
        />
      )
    }
  }

  if (cosmetic.category === "frame") {
    const overlay = getFrameOverlay(cosmetic.id)
    const inner = Math.round(size * 0.55)
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full border-2 bg-primary/15 ${getFrameClass(cosmetic.id)} ${className}`}
        style={{ width: size, height: size }}
      >
        <div
          className="rounded-full bg-primary/35"
          style={{ width: inner, height: inner }}
        />
        {overlay ? (
          <span
            className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] leading-none"
            aria-hidden
          >
            {overlay}
          </span>
        ) : (
          <Frame className="absolute h-3 w-3 text-primary/50" />
        )}
      </div>
    )
  }

  if (cosmetic.category === "wallpaper") {
    if (cosmetic.config?.type === "animated") {
      return (
        <div
          className={`relative shrink-0 overflow-hidden rounded-md border border-border/40 ${className}`}
          style={{ width: size, height: size }}
        >
          <WallpaperRenderer
            wallpaper={cosmetic.id}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      )
    }
    return (
      <div
        className={`shrink-0 rounded-md border border-border/40 ${getWallpaperClass(cosmetic.id)} ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  if (cosmetic.category === "nameColor") {
    return (
      <span
        className={`shrink-0 text-sm font-bold leading-none ${getNameColorClass(cosmetic.id)} ${className}`}
        style={getNameColorStyle(cosmetic.id, isDark)}
        data-name-color="true"
      >
        Aa
      </span>
    )
  }

  if (cosmetic.category === "theme") {
    return (
      <div
        className={`shrink-0 rounded-full border border-border/60 shadow-sm ${className}`}
        style={{ width: size, height: size, ...getThemeSwatchStyle(cosmetic) }}
      />
    )
  }

  return <Sparkles className={`h-4 w-4 shrink-0 text-primary/60 ${className}`} />
}
