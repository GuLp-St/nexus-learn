"use client"

import { getUserCosmetics } from "@/lib/cosmetics-utils"
import { getNameColorClass, getNameColorStyle } from "@/lib/name-color-classes"
import { useTheme } from "@/components/theme-provider"
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
  const { theme } = useTheme()
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
  const colorStyle = getNameColorStyle(nameColorId, theme === "dark")

  return (
    <span
      className={`${colorClass} ${className}`}
      style={colorStyle}
      data-name-color={nameColorId ? "true" : undefined}
    >
      {name}
    </span>
  )
}

