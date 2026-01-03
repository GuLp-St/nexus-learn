import { db } from "./firebase"
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, getDocs } from "firebase/firestore"
import { spendNexon, awardNexon } from "./nexon-utils"
import { generateAvatarUrl, AvatarStyle } from "./avatar-generator"

export type CosmeticCategory = "avatar" | "frame" | "wallpaper" | "nameColor"
export type CosmeticRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "unique"

export interface Cosmetic {
  id: string
  category: CosmeticCategory
  rarity: CosmeticRarity
  price: number
  name: string
  description: string
  config: Record<string, any> // Category-specific configuration
}

export interface UserCosmetics {
  avatarStyle?: string
  avatarFrame?: string
  wallpaper?: string
  nameColor?: string
  avatarSeed?: string
  ownedCosmetics: {
    avatars: string[]
    frames: string[]
    wallpapers: string[]
    nameColors: string[]
  }
}

// Cosmetic definitions - these would ideally be stored in Firestore, but for now we'll define them here
const COSMETICS: Cosmetic[] = [
  // Avatars - Commons are unlocked by default
  { id: "avatar-initials", category: "avatar", rarity: "common", price: 0, name: "Initials", description: "Simple letter-based avatar", config: { style: "initials" } },
  { id: "avatar-icons", category: "avatar", rarity: "common", price: 0, name: "Icons", description: "Clean symbol icons", config: { style: "icons" } },
  { id: "avatar-identicon", category: "avatar", rarity: "common", price: 0, name: "Identicon", description: "Geometric shapes avatar", config: { style: "identicon" } },
  
  // Uncommon Avatars
  { id: "avatar-rings", category: "avatar", rarity: "uncommon", price: 100, name: "Rings", description: "Concentric ring patterns", config: { style: "rings" } },
  { id: "avatar-shapes", category: "avatar", rarity: "uncommon", price: 100, name: "Shapes", description: "Abstract geometric shapes", config: { style: "shapes" } },
  { id: "avatar-fun-emoji", category: "avatar", rarity: "uncommon", price: 100, name: "Fun Emoji", description: "Expressive emoji characters", config: { style: "fun-emoji" } },
  { id: "avatar-bottts", category: "avatar", rarity: "uncommon", price: 100, name: "Bottts", description: "Cool robot avatar", config: { style: "bottts" } },

  // Rare Avatars
  { id: "avatar-thumbs", category: "avatar", rarity: "rare", price: 250, name: "Thumbs", description: "Hand gesture avatars", config: { style: "thumbs" } },
  { id: "avatar-personas", category: "avatar", rarity: "rare", price: 250, name: "Personas", description: "Stylized character portraits", config: { style: "personas" } },
  { id: "avatar-pixel-art", category: "avatar", rarity: "rare", price: 250, name: "Pixel Art", description: "Classic pixelated characters", config: { style: "pixel-art" } },
  { id: "avatar-dylan", category: "avatar", rarity: "rare", price: 250, name: "Dylan", description: "Unique hand-drawn style", config: { style: "dylan" } },
  { id: "avatar-croodles", category: "avatar", rarity: "rare", price: 250, name: "Croodles", description: "Doodle-style characters", config: { style: "croodles" } },
  { id: "avatar-big-ears", category: "avatar", rarity: "rare", price: 250, name: "Big Ears", description: "Cute characters with big ears", config: { style: "big-ears" } },
  { id: "avatar-adventurer", category: "avatar", rarity: "rare", price: 250, name: "Adventurer", description: "RPG character avatar", config: { style: "adventurer" } },

  // Epic Avatars
  { id: "avatar-miniavs", category: "avatar", rarity: "epic", price: 500, name: "Miniavs", description: "Minimalist character avatars", config: { style: "miniavs" } },
  { id: "avatar-notionists", category: "avatar", rarity: "epic", price: 500, name: "Notionists", description: "Artistic sketch avatar", config: { style: "notionists" } },
  { id: "avatar-open-peeps", category: "avatar", rarity: "epic", price: 500, name: "Open Peeps", description: "Hand-drawn people illustrations", config: { style: "open-peeps" } },
  { id: "avatar-big-smile", category: "avatar", rarity: "epic", price: 500, name: "Big Smile", description: "Friendly smiling faces", config: { style: "big-smile" } },
  { id: "avatar-avataaars", category: "avatar", rarity: "epic", price: 500, name: "Avataaars", description: "Detailed customizable people", config: { style: "avataaars" } },

  // Legendary Avatars
  { id: "avatar-lorelei", category: "avatar", rarity: "legendary", price: 1000, name: "Lorelei", description: "Beautiful anime-style portraits", config: { style: "lorelei" } },
  { id: "avatar-micah", category: "avatar", rarity: "legendary", price: 1000, name: "Micah", description: "Unique abstract person style", config: { style: "micah" } },
  
  // Avatar Frames - Rare (Glow)
  { id: "frame-neon-blue", category: "frame", rarity: "rare", price: 200, name: "Neon Blue Glow", description: "Sharp cyan glow effect", config: { type: "glow", color: "cyan" } },
  { id: "frame-radioactive", category: "frame", rarity: "rare", price: 200, name: "Radioactive", description: "Pulsing green glow", config: { type: "glow", color: "green" } },
  { id: "frame-void", category: "frame", rarity: "rare", price: 200, name: "Void", description: "Deep purple/black shadow", config: { type: "glow", color: "purple" } },
  
  // Avatar Frames - Epic (Motion)
  { id: "frame-rgb-gamer", category: "frame", rarity: "epic", price: 500, name: "RGB Gamer", description: "Rainbow gradient spinning border", config: { type: "motion", effect: "rgb" } },
  { id: "frame-golden-lustre", category: "frame", rarity: "epic", price: 500, name: "Golden Lustre", description: "Metallic gold sheen", config: { type: "motion", effect: "gold" } },
  
  // Avatar Frames - Legendary (Structure)
  { id: "frame-laurels", category: "frame", rarity: "legendary", price: 1000, name: "The Laurels", description: "leaf laurels", config: { type: "structure", element: "laurels" } },
  { id: "frame-devil-horns", category: "frame", rarity: "legendary", price: 1000, name: "Devil Horns", description: "Red horns overlay", config: { type: "structure", element: "horns" } },
  { id: "frame-crown", category: "frame", rarity: "legendary", price: 1000, name: "The Crown", description: "Floating crown icon", config: { type: "structure", element: "crown" } },
  
  // Avatar Frames - Unique
  { id: "frame-nexus-glitch", category: "frame", rarity: "unique", price: 2000, name: "Nexus Glitch", description: "Cyberpunk glitch effect", config: { type: "motion", effect: "glitch" } },
  
  // Wallpapers - Common
  { id: "wallpaper-midnight-blue", category: "wallpaper", rarity: "common", price: 50, name: "Midnight Blue", description: "Deep calming navy", config: { type: "solid", color: "slate-900" } },
  { id: "wallpaper-forest", category: "wallpaper", rarity: "common", price: 50, name: "Forest", description: "Very dark green", config: { type: "solid", color: "green-950" } },
  { id: "wallpaper-espresso", category: "wallpaper", rarity: "common", price: 50, name: "Espresso", description: "Dark warm brown", config: { type: "solid", color: "stone-900" } },
  
  // Wallpapers - Uncommon
  { id: "wallpaper-dusk", category: "wallpaper", rarity: "uncommon", price: 100, name: "Dusk", description: "Purple to orange gradient", config: { type: "gradient", from: "indigo-900", to: "orange-900" } },
  { id: "wallpaper-deep-ocean", category: "wallpaper", rarity: "uncommon", price: 100, name: "Deep Ocean", description: "Cyan to deep blue gradient", config: { type: "gradient", from: "cyan-900", to: "blue-950" } },
  { id: "wallpaper-vampire", category: "wallpaper", rarity: "uncommon", price: 100, name: "Vampire", description: "Black to deep red gradient", config: { type: "gradient", from: "black", to: "red-950" } },
  
  // Wallpapers - Rare
  { id: "wallpaper-blueprint", category: "wallpaper", rarity: "rare", price: 200, name: "Blueprint", description: "Subtle grid pattern on blue", config: { type: "pattern", pattern: "grid", color: "blue" } },
  { id: "wallpaper-carbon-fiber", category: "wallpaper", rarity: "rare", price: 200, name: "Carbon Fiber", description: "Dark woven texture", config: { type: "pattern", pattern: "carbon", color: "dark" } },
  { id: "wallpaper-hexagon-hive", category: "wallpaper", rarity: "rare", price: 200, name: "Hexagon Hive", description: "Honeycomb outlines", config: { type: "pattern", pattern: "hexagon", color: "dark" } },
  
  // Wallpapers - Epic
  { id: "wallpaper-aurora", category: "wallpaper", rarity: "epic", price: 500, name: "Aurora", description: "Northern lights effect", config: { type: "mesh", colors: ["green", "pink", "blue"] } },
  { id: "wallpaper-nebula", category: "wallpaper", rarity: "epic", price: 500, name: "Nebula", description: "Deep space clouds", config: { type: "mesh", colors: ["purple", "magenta"] } },
  { id: "wallpaper-holo", category: "wallpaper", rarity: "epic", price: 500, name: "Holo", description: "Pearlescent mix", config: { type: "mesh", colors: ["silver", "pink", "blue"] } },
  
  // Wallpapers - Legendary
  { id: "wallpaper-ethereal-mesh", category: "wallpaper", rarity: "legendary", price: 1000, name: "Ethereal Mesh", description: "Breathing mesh gradient", config: { type: "animated", animation: "ethereal-mesh" } },
  
  // Wallpapers - Unique
  { id: "wallpaper-matrix", category: "wallpaper", rarity: "unique", price: 2000, name: "The Matrix", description: "Falling Japanese characters", config: { type: "animated", animation: "matrix" } },
  { id: "wallpaper-nexus-constellation", category: "wallpaper", rarity: "unique", price: 2000, name: "Nexus Constellation", description: "Connected particle network", config: { type: "animated", animation: "nexus-constellation" } },
  { id: "wallpaper-hyperdrive", category: "wallpaper", rarity: "unique", price: 2000, name: "Hyperdrive", description: "Streaking stars at light speed", config: { type: "animated", animation: "hyperdrive" } },
  { id: "wallpaper-core-pulse", category: "wallpaper", rarity: "unique", price: 2000, name: "Core Pulse", description: "Pulsing reactor rings", config: { type: "animated", animation: "core-pulse" } },
  
  // Name Colors - Uncommon
  { id: "name-crimson", category: "nameColor", rarity: "uncommon", price: 100, name: "Crimson", description: "Bright red text", config: { type: "solid", light: "rose-600", dark: "rose-400" } },
  { id: "name-azure", category: "nameColor", rarity: "uncommon", price: 100, name: "Azure", description: "Bright cyan text", config: { type: "solid", light: "cyan-600", dark: "cyan-400" } },
  { id: "name-lime", category: "nameColor", rarity: "uncommon", price: 100, name: "Lime", description: "Bright green text", config: { type: "solid", light: "lime-600", dark: "lime-400" } },
  
  // Name Colors - Rare
  { id: "name-golden-god", category: "nameColor", rarity: "rare", price: 200, name: "Golden God", description: "Metallic gold gradient", config: { type: "gradient", from: "yellow-400", to: "amber-600" } },
  { id: "name-cyberpunk", category: "nameColor", rarity: "rare", price: 200, name: "Cyberpunk", description: "Pink to violet gradient", config: { type: "gradient", from: "pink-500", to: "violet-500" } },
  { id: "name-ice-cold", category: "nameColor", rarity: "rare", price: 200, name: "Ice Cold", description: "White to cyan gradient", config: { type: "gradient", from: "white", to: "cyan-400" } },
  
  // Name Colors - Legendary
  { id: "name-rgb-gamer", category: "nameColor", rarity: "legendary", price: 1000, name: "RGB Gamer", description: "Animated rainbow gradient", config: { type: "animated", animation: "rgb" } },
  { id: "name-neon", category: "nameColor", rarity: "legendary", price: 1000, name: "Neon", description: "Glowing cyan text", config: { type: "glow", color: "cyan" } },
  { id: "name-glitch", category: "nameColor", rarity: "unique", price: 2000, name: "Glitch", description: "Cyberpunk glitch effect", config: { type: "animated", animation: "glitch" } },
]

/**
 * Get all available cosmetics
 */
export async function getAllCosmetics(): Promise<Cosmetic[]> {
  // For now, return the static list
  // In the future, this could fetch from Firestore
  return COSMETICS
}

/**
 * Get cosmetics by category
 */
export async function getCosmeticsByCategory(category: CosmeticCategory): Promise<Cosmetic[]> {
  const all = await getAllCosmetics()
  return all.filter(c => c.category === category)
}

/**
 * Get cosmetic by ID
 */
export async function getCosmeticById(id: string): Promise<Cosmetic | null> {
  const all = await getAllCosmetics()
  return all.find(c => c.id === id) || null
}

/**
 * Get user's cosmetics (equipped and owned)
 */
export async function getUserCosmetics(userId: string): Promise<UserCosmetics> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return {
        ownedCosmetics: {
          avatars: ["avatar-initials", "avatar-identicon", "avatar-pixel-art"],
          frames: [],
          wallpapers: [],
          nameColors: [],
        },
      }
    }

    const data = userDoc.data()
    const owned = data.ownedCosmetics || {
      avatars: [],
      frames: [],
      wallpapers: [],
      nameColors: [],
    }

    // Ensure common avatars are always included and normalize all IDs
    const defaultAvatars = ["avatar-initials", "avatar-icons", "avatar-identicon"]
    const rawAvatars = Array.isArray(owned.avatars) ? owned.avatars : []
    
    // Normalize existing IDs (e.g., "initials" -> "avatar-initials")
    const normalizedOwnedAvatars = rawAvatars.map((id: string) => 
      id.startsWith("avatar-") ? id : `avatar-${id}`
    )
    
    const avatars = Array.from(new Set([...normalizedOwnedAvatars, ...defaultAvatars]))

    return {
      avatarStyle: data.cosmetics?.avatarStyle || (data.avatarStyle ? (data.avatarStyle.startsWith("avatar-") ? data.avatarStyle : `avatar-${data.avatarStyle}`) : undefined),
      avatarFrame: data.cosmetics?.avatarFrame,
      wallpaper: data.cosmetics?.wallpaper,
      nameColor: data.cosmetics?.nameColor,
      avatarSeed: data.avatarSeed || data.cosmetics?.avatarSeed,
      ownedCosmetics: {
        ...owned,
        avatars,
      },
    }
  } catch (error) {
    console.error("Error getting user cosmetics:", error)
    return {
      ownedCosmetics: {
        avatars: ["avatar-initials", "avatar-icons", "avatar-identicon"],
        frames: [],
        wallpapers: [],
        nameColors: [],
      },
    }
  }
}

/**
 * Purchase a cosmetic
 */
export async function purchaseCosmetic(userId: string, cosmeticId: string): Promise<void> {
  try {
    const cosmetic = await getCosmeticById(cosmeticId)
    if (!cosmetic) {
      throw new Error("Cosmetic not found")
    }

    // Check if already owned
    const userCosmetics = await getUserCosmetics(userId)
    const ownedKey = `${cosmetic.category}s` as keyof typeof userCosmetics.ownedCosmetics
    if (userCosmetics.ownedCosmetics[ownedKey].includes(cosmeticId)) {
      throw new Error("Cosmetic already owned")
    }

    // Spend Nexon
    await spendNexon(userId, cosmetic.price, `Purchased ${cosmetic.name}`, { cosmeticId, category: cosmetic.category })

    // Add to owned cosmetics
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    if (!userDoc.exists()) {
      throw new Error("User not found")
    }

    const currentOwned = userDoc.data()?.ownedCosmetics || {
      avatars: [],
      frames: [],
      wallpapers: [],
      nameColors: [],
    }

    const updatedOwned = {
      ...currentOwned,
      [ownedKey]: [...currentOwned[ownedKey], cosmeticId],
    }

    await updateDoc(userRef, {
      ownedCosmetics: updatedOwned,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error purchasing cosmetic:", error)
    throw error
  }
}

/**
 * Equip a cosmetic
 */
export async function equipCosmetic(userId: string, cosmeticId: string, category: CosmeticCategory): Promise<void> {
  try {
    const cosmetic = await getCosmeticById(cosmeticId)
    if (!cosmetic) {
      throw new Error("Cosmetic not found")
    }

    if (cosmetic.category !== category) {
      throw new Error("Category mismatch")
    }

    // Check if owned
    const userCosmetics = await getUserCosmetics(userId)
    const ownedKey = `${cosmetic.category}s` as keyof typeof userCosmetics.ownedCosmetics
    if (!userCosmetics.ownedCosmetics[ownedKey].includes(cosmeticId)) {
      throw new Error("Cosmetic not owned")
    }

    // Update equipped cosmetic
    const userRef = doc(db, "users", userId)
    const cosmeticField = category === "avatar" ? "avatarStyle" : category === "frame" ? "avatarFrame" : category === "wallpaper" ? "wallpaper" : "nameColor"

    await updateDoc(userRef, {
      [`cosmetics.${cosmeticField}`]: cosmeticId,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error equipping cosmetic:", error)
    throw error
  }
}

/**
 * Resolve a cosmetic ID to its configuration (e.g. avatar style name)
 */
export function resolveAvatarStyle(cosmeticId: string | undefined): AvatarStyle {
  if (!cosmeticId) return "initials"
  
  // 1. Check if it's already a clean style name
  const cleanStyle = cosmeticId.replace("avatar-", "") as AvatarStyle
  const validStyles: AvatarStyle[] = [
    "initials", "icons", "identicon", "rings", "shapes", "fun-emoji", 
    "bottts", "thumbs", "personas", "pixel-art", "dylan", "croodles", 
    "big-ears", "adventurer", "miniavs", "notionists", "open-peeps", 
    "big-smile", "avataaars", "lorelei", "micah"
  ]
  
  if (validStyles.includes(cleanStyle)) {
    return cleanStyle
  }

  // 2. Check the COSMETICS mapping
  const cosmetic = COSMETICS.find(c => c.id === cosmeticId || c.id === `avatar-${cosmeticId}`)
  if (cosmetic && cosmetic.category === "avatar" && cosmetic.config?.style) {
    return cosmetic.config.style as AvatarStyle
  }
  
  return "initials"
}

/**
 * Get cosmetic preview URL (for avatars)
 */
export function getCosmeticPreviewUrl(cosmetic: Cosmetic, seed: string = "preview"): string | null {
  if (cosmetic.category === "avatar" && cosmetic.config?.style) {
    try {
      return generateAvatarUrl(cosmetic.config.style as AvatarStyle, seed)
    } catch (error) {
      console.error("Error generating avatar preview URL:", error)
      return null
    }
  }
  return null
}

