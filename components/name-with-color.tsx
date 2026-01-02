"use client"

import { getUserCosmetics } from "@/lib/cosmetics-utils"
import { useEffect, useState } from "react"

interface NameWithColorProps {
  userId: string
  name: string
  className?: string
  refreshKey?: number
  overrideColor?: string
}

export function NameWithColor({ 
  userId, 
  name, 
  className = "", 
  refreshKey = 0,
  overrideColor 
}: NameWithColorProps) {
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

  if (loading && !overrideColor) {
    return <span className={className}>{name}</span>
  }

  const nameColorId = overrideColor || cosmetics?.nameColor
  const colorClass = getNameColorClass(nameColorId)

  return (
    <span className={`${colorClass} ${className}`}>
      {name}
    </span>
  )
}

function getNameColorClass(nameColorId: string | undefined): string {
  if (!nameColorId) return ""

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

