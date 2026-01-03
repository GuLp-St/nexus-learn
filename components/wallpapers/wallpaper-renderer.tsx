"use client"

import { MatrixRain } from "./matrix-rain"
import { NexusConstellation } from "./nexus-constellation"
import { CorePulse } from "./core-pulse"
import { EtherealMesh } from "./ethereal-mesh"
import { Hyperdrive } from "./hyperdrive"

interface WallpaperRendererProps {
  wallpaper: string | null
  className?: string
}

export function WallpaperRenderer({ wallpaper, className = "" }: WallpaperRendererProps) {
  if (!wallpaper) return null

  // Remove "wallpaper-" prefix if present
  const wallpaperId = wallpaper.replace("wallpaper-", "")

  switch (wallpaperId) {
    case "matrix":
      return <MatrixRain className={className} />
    case "nexus-constellation":
    case "starfield": // Support old name for backward compatibility
      return <NexusConstellation className={className} />
    case "core-pulse":
    case "pulse": // Support old name for backward compatibility
      return <CorePulse className={className} />
    case "ethereal-mesh":
      return <EtherealMesh className={className} />
    case "hyperdrive":
      return <Hyperdrive className={className} />
    default:
      return null
  }
}

