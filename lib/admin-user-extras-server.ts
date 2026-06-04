import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { BadgeId } from "./badge-utils"

const BADGE_IDS: BadgeId[] = [
  "first-steps",
  "quiz-master",
  "marathon-runner",
  "early-bird",
  "knowledge-seeker",
  "perfectionist",
]

const COSMETIC_CATEGORY_KEYS = [
  "avatars",
  "frames",
  "wallpapers",
  "nameColors",
  "themes",
] as const

type OwnedCosmetics = Record<(typeof COSMETIC_CATEGORY_KEYS)[number], string[]>

function emptyOwned(): OwnedCosmetics {
  return { avatars: [], frames: [], wallpapers: [], nameColors: [], themes: [] }
}

function categoryToKey(category: string): keyof OwnedCosmetics | null {
  const map: Record<string, keyof OwnedCosmetics> = {
    avatar: "avatars",
    frame: "frames",
    wallpaper: "wallpapers",
    nameColor: "nameColors",
    theme: "themes",
  }
  return map[category] ?? null
}

/** Static cosmetic catalog ids (mirrors cosmetics-utils). */
export function getAdminCosmeticCatalog(): {
  id: string
  category: string
  name: string
  price: number
}[] {
  // Import would pull client code; keep minimal list endpoint via duplicate fetch in API
  return []
}

export async function getUserBadgesAdmin(userId: string) {
  const db = getAdminFirestore()
  const ref = db.collection("userBadges").doc(userId)
  const snap = await ref.get()

  const defaultBadges = Object.fromEntries(
    BADGE_IDS.map((id) => [id, { unlocked: false }])
  ) as Record<BadgeId, { unlocked: boolean; unlockedAt?: Timestamp }>

  if (!snap.exists) {
    return { badges: defaultBadges }
  }

  const data = snap.data()!
  const badges = { ...defaultBadges, ...(data.badges as typeof defaultBadges) }
  return { badges }
}

export async function setUserBadgeAdmin(
  userId: string,
  badgeId: BadgeId,
  unlocked: boolean
): Promise<void> {
  if (!BADGE_IDS.includes(badgeId)) {
    throw new Error("Invalid badge id")
  }

  const db = getAdminFirestore()
  const ref = db.collection("userBadges").doc(userId)
  const snap = await ref.get()

  const badges: Record<string, { unlocked: boolean; unlockedAt?: Timestamp }> = snap.exists
    ? { ...(snap.data()?.badges as Record<string, { unlocked: boolean; unlockedAt?: Timestamp }>) }
    : Object.fromEntries(BADGE_IDS.map((id) => [id, { unlocked: false }]))

  if (unlocked) {
    badges[badgeId] = { unlocked: true, unlockedAt: Timestamp.now() }
  } else {
    badges[badgeId] = { unlocked: false }
  }

  await ref.set(
    {
      badges,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

export async function getUserCosmeticsAdmin(userId: string) {
  const db = getAdminFirestore()
  const snap = await db.collection("users").doc(userId).get()
  if (!snap.exists) throw new Error("User not found")

  const data = snap.data()!
  const owned = (data.ownedCosmetics as OwnedCosmetics) ?? emptyOwned()
  const cosmetics = (data.cosmetics as Record<string, string>) ?? {}

  return {
    ownedCosmetics: {
      avatars: owned.avatars ?? [],
      frames: owned.frames ?? [],
      wallpapers: owned.wallpapers ?? [],
      nameColors: owned.nameColors ?? [],
      themes: owned.themes ?? [],
    },
    equipped: {
      avatarStyle: cosmetics.avatarStyle ?? data.avatarStyle ?? null,
      avatarFrame: cosmetics.avatarFrame ?? null,
      wallpaper: cosmetics.wallpaper ?? null,
      nameColor: cosmetics.nameColor ?? null,
      theme: cosmetics.theme ?? "theme-teal",
    },
  }
}

export async function grantCosmeticAdmin(
  userId: string,
  cosmeticId: string,
  category: string
): Promise<void> {
  const key = categoryToKey(category)
  if (!key) throw new Error("Invalid cosmetic category")

  const db = getAdminFirestore()
  const userRef = db.collection("users").doc(userId)
  const snap = await userRef.get()
  if (!snap.exists) throw new Error("User not found")

  const owned = (snap.data()?.ownedCosmetics as OwnedCosmetics) ?? emptyOwned()
  const list = [...(owned[key] ?? [])]
  if (!list.includes(cosmeticId)) list.push(cosmeticId)

  await userRef.update({
    [`ownedCosmetics.${key}`]: list,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function revokeCosmeticAdmin(
  userId: string,
  cosmeticId: string,
  category: string
): Promise<void> {
  const key = categoryToKey(category)
  if (!key) throw new Error("Invalid cosmetic category")

  const db = getAdminFirestore()
  const userRef = db.collection("users").doc(userId)
  const snap = await userRef.get()
  if (!snap.exists) throw new Error("User not found")

  const owned = (snap.data()?.ownedCosmetics as OwnedCosmetics) ?? emptyOwned()
  const list = (owned[key] ?? []).filter((id) => id !== cosmeticId)

  const updates: Record<string, unknown> = {
    [`ownedCosmetics.${key}`]: list,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const cosmetics = snap.data()?.cosmetics as Record<string, string> | undefined
  const fieldMap: Record<string, string> = {
    avatars: "avatarStyle",
    frames: "avatarFrame",
    wallpapers: "wallpaper",
    nameColors: "nameColor",
    themes: "theme",
  }
  const equipField = fieldMap[key]
  if (cosmetics?.[equipField] === cosmeticId) {
    updates[`cosmetics.${equipField}`] = FieldValue.delete()
  }

  await userRef.update(updates)
}

export async function equipCosmeticAdmin(
  userId: string,
  cosmeticId: string,
  category: string
): Promise<void> {
  const fieldMap: Record<string, string> = {
    avatar: "avatarStyle",
    frame: "avatarFrame",
    wallpaper: "wallpaper",
    nameColor: "nameColor",
    theme: "theme",
  }
  const field = fieldMap[category]
  if (!field) throw new Error("Invalid category")

  const db = getAdminFirestore()
  await db.collection("users").doc(userId).update({
    [`cosmetics.${field}`]: cosmeticId,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export { BADGE_IDS, COSMETIC_CATEGORY_KEYS }
