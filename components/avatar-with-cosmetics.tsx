"use client"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { getUserCosmetics, resolveAvatarStyle } from "@/lib/cosmetics-utils"
import { generateAvatarUrl, AvatarStyle, getDefaultAvatarStyle } from "@/lib/avatar-generator"
import { useEffect, useState } from "react"

interface AvatarWithCosmeticsProps {
  userId: string
  nickname: string | null
  avatarUrl?: string | null
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  hideFrame?: boolean
  refreshKey?: number
  avatarSeed?: string | null
  overrideStyle?: string
  overrideFrame?: string
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-32 w-32",
}

const frameSizeClasses = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-40 w-40",
}

export function AvatarWithCosmetics({
  userId,
  nickname,
  avatarUrl,
  size = "md",
  className = "",
  hideFrame = false,
  refreshKey = 0,
  avatarSeed: propAvatarSeed,
  overrideStyle,
  overrideFrame,
}: AvatarWithCosmeticsProps) {
  const [cosmetics, setCosmetics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadCosmetics = async () => {
      try {
        const userCosmetics = await getUserCosmetics(userId)
        setCosmetics(userCosmetics)
      } catch (error) {
        console.error("Error loading cosmetics:", error)
      } finally {
        setLoading(false)
      }
    }

    loadCosmetics()
  }, [userId, refreshKey])

  if (loading && !overrideStyle && !overrideFrame) {
    return (
      <Avatar className={`${sizeClasses[size]} ${className}`}>
        <AvatarFallback>{nickname?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
      </Avatar>
    )
  }

  // Get avatar style
  const avatarStyleId = overrideStyle || cosmetics?.avatarStyle
  const avatarStyle = resolveAvatarStyle(avatarStyleId)
  const seed = propAvatarSeed || cosmetics?.avatarSeed || nickname || userId || "default"
  
  // Generate avatar URL if using cosmetic style
  // Use prop avatarUrl as primary, fallback to cosmetics.avatarUrl if available
  let displayAvatarUrl = avatarUrl || cosmetics?.avatarUrl
  
  // Check if it's a custom image-based style
  const isCustomStyle = ["hf", "unsplash", "upload"].includes(avatarStyle)
  
  // Prefer the dynamic cosmetic style over the static avatarUrl if a non-custom style is equipped
  // or if we have no URL at all.
  if (avatarStyle && !isCustomStyle && (avatarStyle !== "initials" || !displayAvatarUrl)) {
    try {
      displayAvatarUrl = generateAvatarUrl(avatarStyle as AvatarStyle, seed)
    } catch (error) {
      console.error("Error generating avatar URL:", error)
    }
  }

  // Get frame class
  const frameId = !hideFrame ? (overrideFrame || cosmetics?.avatarFrame) : undefined
  const frameClass = getFrameClass(frameId, size)

  return (
    <div className={`relative ${frameSizeClasses[size]} flex items-center justify-center ${className}`}>
      <Avatar className={`${sizeClasses[size]} ${frameClass}`}>
        {displayAvatarUrl ? (
          <AvatarImage 
            src={displayAvatarUrl} 
            alt={nickname || "User"} 
            style={isCustomStyle && cosmetics?.avatarImageConfig ? {
              objectFit: cosmetics.avatarImageConfig.fit,
              transform: `scale(${cosmetics.avatarImageConfig.scale || 1}) translate(${cosmetics.avatarImageConfig.position.x - 50}%, ${cosmetics.avatarImageConfig.position.y - 50}%)`
            } : {
              objectFit: "cover"
            }}
          />
        ) : (
          <AvatarFallback>{nickname?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
        )}
      </Avatar>
      {frameId && renderFrameOverlay(frameId, size)}
    </div>
  )
}

function getFrameClass(frameId: string | undefined, size: "sm" | "md" | "lg" | "xl"): string {
  if (!frameId) return ""

  const borderClass = size === "xl" ? "border-4" : "border-2"

  // Glow frames
  if (frameId === "frame-neon-blue") return `${borderClass} border-cyan-500 shadow-[0_0_15px_#06b6d4]`
  if (frameId === "frame-radioactive") return `${borderClass} border-green-500 shadow-[0_0_15px_#22c55e] animate-pulse`
  if (frameId === "frame-void") return `${borderClass} border-purple-500 shadow-[0_0_15px_#8b5cf6]`

  // Motion frames (will be handled by CSS)
  if (frameId === "frame-rgb-gamer") return "cosmetic-frame-rgb-gamer"
  if (frameId === "frame-golden-lustre") return "cosmetic-frame-golden-lustre"
  if (frameId === "frame-nexus-glitch") return "cosmetic-frame-nexus-glitch"

  // Structure frames (will be handled by overlay)
  if (frameId === "frame-laurels") return `${borderClass} border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]`
  if (frameId === "frame-devil-horns") return `${borderClass} border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]`
  if (frameId === "frame-crown") return `${borderClass} border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]`

  return ""
}

function renderFrameOverlay(frameId: string | undefined, size: "sm" | "md" | "lg" | "xl"): React.ReactNode {
  if (!frameId) return null

  const iconSize = size === "xl" ? "text-4xl" : "text-xs"
  const zIndex = "z-50"

  // Structure frames
  if (frameId === "frame-laurels") {
    return (
      <div className={`absolute ${size === "xl" ? "-top-4" : "-top-1"} left-1/2 -translate-x-1/2 pointer-events-none ${zIndex}`}>
        <div className={`text-emerald-400 ${iconSize}`}>🌿</div>
      </div>
    )
  }
  if (frameId === "frame-devil-horns") {
    return (
      <div className={`absolute ${size === "xl" ? "-top-4" : "-top-1"} left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none ${zIndex}`}>
        <div className={`text-red-500 ${iconSize}`}>👹</div>
      </div>
    )
  }
  if (frameId === "frame-crown") {
    return (
      <div className={`absolute ${size === "xl" ? "-top-6" : "-top-2"} left-1/2 -translate-x-1/2 pointer-events-none ${zIndex}`}>
        <div className={`text-yellow-500 ${iconSize}`}>👑</div>
      </div>
    )
  }

  return null
}

