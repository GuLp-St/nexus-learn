/**
 * Generate avatar URLs using DiceBear API
 * https://dicebear.com/
 */

export type AvatarStyle = 
  | "initials" 
  | "identicon" 
  | "pixel-art" 
  | "adventurer" 
  | "bottts" 
  | "avataaars" 
  | "notionists"

/**
 * Generate avatar URL from DiceBear API
 */
export function generateAvatarUrl(
  style: AvatarStyle,
  seed: string,
  size: number = 256
): string {
  const baseUrl = "https://api.dicebear.com/9.x"
  
  switch (style) {
    case "initials":
      return `${baseUrl}/initials/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "identicon":
      return `${baseUrl}/identicon/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "pixel-art":
      return `${baseUrl}/pixel-art/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "adventurer":
      return `${baseUrl}/adventurer/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "bottts":
      return `${baseUrl}/bottts/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "avataaars":
      return `${baseUrl}/avataaars/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    case "notionists":
      return `${baseUrl}/notionists/svg?seed=${encodeURIComponent(seed)}&size=${size}`
    default:
      return `${baseUrl}/initials/svg?seed=${encodeURIComponent(seed)}&size=${size}`
  }
}

/**
 * Get default avatar style (initials)
 */
export function getDefaultAvatarStyle(): AvatarStyle {
  return "initials"
}

