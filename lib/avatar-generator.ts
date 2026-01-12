/**
 * Generate avatar URLs using DiceBear API
 * https://dicebear.com/
 */

export type AvatarStyle = 
  | "initials" 
  | "icons"
  | "identicon" 
  | "rings"
  | "shapes"
  | "fun-emoji"
  | "bottts" 
  | "thumbs"
  | "personas"
  | "pixel-art" 
  | "dylan"
  | "croodles"
  | "big-ears"
  | "adventurer" 
  | "miniavs"
  | "notionists"
  | "open-peeps"
  | "big-smile"
  | "avataaars" 
  | "lorelei"
  | "micah"
  | "hf"
  | "unsplash"
  | "upload"

/**
 * Generate avatar URL from DiceBear API
 */
export function generateAvatarUrl(
  style: AvatarStyle,
  seed: string,
  size: number = 256
): string {
  const baseUrl = "https://api.dicebear.com/9.x"
  
  // All DiceBear styles follow the same URL pattern
  return `${baseUrl}/${style}/svg?seed=${encodeURIComponent(seed || "default")}&size=${size}`
}

/**
 * Get default avatar style (initials)
 */
export function getDefaultAvatarStyle(): AvatarStyle {
  return "initials"
}
