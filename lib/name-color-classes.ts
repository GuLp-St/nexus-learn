import type { CSSProperties } from "react"

const SOLID_NAME_COLORS: Record<string, { light: string; dark: string; className: string }> = {
  "name-crimson": { light: "#e11d48", dark: "#fb7185", className: "cosmetic-name-crimson" },
  "name-azure": { light: "#0891b2", dark: "#22d3ee", className: "cosmetic-name-azure" },
  "name-lime": { light: "#65a30d", dark: "#a3e635", className: "cosmetic-name-lime" },
}

const GRADIENT_AND_EFFECT_CLASSES: Record<string, string> = {
  "name-golden-god": "cosmetic-name-golden-god",
  "name-cyberpunk": "cosmetic-name-cyberpunk",
  "name-ice-cold": "cosmetic-name-ice-cold",
  "name-rgb-gamer": "cosmetic-name-rgb-gamer",
  "name-neon": "cosmetic-name-neon",
  "name-glitch": "cosmetic-name-glitch",
}

/** CSS class for a name color cosmetic (used for gradient effects + profile theme exclusions). */
export function getNameColorClass(nameColorId: string | undefined): string {
  if (!nameColorId) return ""
  return (
    SOLID_NAME_COLORS[nameColorId]?.className ??
    GRADIENT_AND_EFFECT_CLASSES[nameColorId] ??
    ""
  )
}

/** Inline color for solid name color cosmetics. */
export function getNameColorStyle(
  nameColorId: string | undefined,
  isDark: boolean
): CSSProperties | undefined {
  if (!nameColorId) return undefined
  const entry = SOLID_NAME_COLORS[nameColorId]
  if (!entry) return undefined
  return { color: isDark ? entry.dark : entry.light }
}
