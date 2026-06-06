import { db } from "./firebase"
import { doc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore"
import { getAllCosmetics, getUserCosmetics, type Cosmetic, type CosmeticRarity } from "./cosmetics-utils"

export const STYLE_SHARDS_PER_NEXUS_CACHE = 5
export const MAX_REFRESH_TOKENS = 3
export const REFRESH_TOKEN_TOPUP_NEXON_COST = 50

const RARITY_WEIGHTS: { rarity: CosmeticRarity; weight: number }[] = [
  { rarity: "uncommon", weight: 40 },
  { rarity: "rare", weight: 30 },
  { rarity: "epic", weight: 18 },
  { rarity: "legendary", weight: 10 },
  { rarity: "unique", weight: 2 },
]

function pickRarity(): CosmeticRarity {
  const total = RARITY_WEIGHTS.reduce((sum, r) => sum + r.weight, 0)
  let roll = Math.random() * total
  for (const entry of RARITY_WEIGHTS) {
    roll -= entry.weight
    if (roll <= 0) return entry.rarity
  }
  return "uncommon"
}

function getOwnedIds(userCosmetics: Awaited<ReturnType<typeof getUserCosmetics>>): Set<string> {
  const owned = userCosmetics.ownedCosmetics
  return new Set([
    ...owned.avatars,
    ...owned.frames,
    ...owned.wallpapers,
    ...owned.nameColors,
    ...owned.themes,
  ])
}

function pickCosmeticFromPool(cosmetics: Cosmetic[], ownedIds: Set<string>, rarity: CosmeticRarity): Cosmetic | null {
  const pool = cosmetics.filter(
    (c) => c.rarity === rarity && c.price > 0 && !ownedIds.has(c.id)
  )
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickAnyUnowned(cosmetics: Cosmetic[], ownedIds: Set<string>): Cosmetic | null {
  const pool = cosmetics.filter((c) => c.price > 0 && !ownedIds.has(c.id))
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function getStyleShards(userId: string): Promise<number> {
  const userDoc = await getDoc(doc(db, "users", userId))
  return userDoc.exists() ? userDoc.data()?.styleShards ?? 0 : 0
}

export async function getFreeNexusCaches(userId: string): Promise<number> {
  const userDoc = await getDoc(doc(db, "users", userId))
  return userDoc.exists() ? userDoc.data()?.freeNexusCaches ?? 0 : 0
}

export async function awardFreeNexusCache(userId: string, amount = 1): Promise<number> {
  const userRef = doc(db, "users", userId)
  await updateDoc(userRef, {
    freeNexusCaches: increment(amount),
    updatedAt: serverTimestamp(),
  })
  return getFreeNexusCaches(userId)
}

export async function consumeFreeNexusCache(userId: string): Promise<void> {
  const userRef = doc(db, "users", userId)
  const userDoc = await getDoc(userRef)
  if (!userDoc.exists()) throw new Error("User not found")
  const current = userDoc.data()?.freeNexusCaches ?? 0
  if (current <= 0) throw new Error("No free Nexus Cache available")
  await updateDoc(userRef, {
    freeNexusCaches: increment(-1),
    updatedAt: serverTimestamp(),
  })
}

export async function awardStyleShards(
  userId: string,
  amount: number,
  source?: string
): Promise<number> {
  if (amount <= 0) throw new Error("Amount must be positive")
  const userRef = doc(db, "users", userId)
  await updateDoc(userRef, {
    styleShards: increment(amount),
    updatedAt: serverTimestamp(),
  })
  return getStyleShards(userId)
}

export async function spendStyleShards(userId: string, amount: number): Promise<number> {
  if (amount <= 0) throw new Error("Amount must be positive")
  const userRef = doc(db, "users", userId)
  const userDoc = await getDoc(userRef)
  if (!userDoc.exists()) throw new Error("User not found")
  const current = userDoc.data()?.styleShards ?? 0
  if (current < amount) throw new Error("Not enough Style Shards")
  await updateDoc(userRef, {
    styleShards: increment(-amount),
    updatedAt: serverTimestamp(),
  })
  return getStyleShards(userId)
}

export interface NexusCacheReward {
  cosmetic: Cosmetic
  rarity: CosmeticRarity
}

export async function rollNexusCache(userId: string): Promise<NexusCacheReward> {
  const [cosmetics, userCosmetics] = await Promise.all([
    getAllCosmetics(),
    getUserCosmetics(userId),
  ])
  const ownedIds = getOwnedIds(userCosmetics)

  let picked: Cosmetic | null = null
  let rarity = pickRarity()

  for (let attempt = 0; attempt < 6 && !picked; attempt++) {
    picked = pickCosmeticFromPool(cosmetics, ownedIds, rarity)
    if (!picked) {
      rarity = pickRarity()
    }
  }

  if (!picked) {
    picked = pickAnyUnowned(cosmetics, ownedIds)
    if (picked) rarity = picked.rarity
  }

  if (!picked) {
    throw new Error("You already own every cosmetic in the Nexus Cache!")
  }

  const userRef = doc(db, "users", userId)
  const userDoc = await getDoc(userRef)
  if (!userDoc.exists()) throw new Error("User not found")

  const ownedKey = `${picked.category}s` as keyof typeof userCosmetics.ownedCosmetics
  const currentOwned = userDoc.data()?.ownedCosmetics || {
    avatars: [],
    frames: [],
    wallpapers: [],
    nameColors: [],
    themes: [],
  }

  await updateDoc(userRef, {
    ownedCosmetics: {
      ...currentOwned,
      [ownedKey]: [...(currentOwned[ownedKey] || []), picked.id],
    },
    updatedAt: serverTimestamp(),
  })

  return { cosmetic: picked, rarity }
}

export async function openNexusCacheWithShards(userId: string): Promise<NexusCacheReward> {
  await spendStyleShards(userId, STYLE_SHARDS_PER_NEXUS_CACHE)
  return rollNexusCache(userId)
}
