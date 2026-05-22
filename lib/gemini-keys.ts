/**
 * Loads Gemini API keys from Firestore (primary) and environment (fallback).
 *
 * Firestore (recommended for presentations — add keys without redeploying):
 *   Collection: config
 *   Document: ai
 *   Fields:
 *     - geminiApiKeys: string[]   // ["AIza...", "AIza..."]
 *     - geminiModel: string        // optional text model override
 *     - cloudflareAccountId, cloudflareApiTokens, cloudflareImageModel (see cloudflare-keys.ts)
 *
 * Environment fallback (single key):
 *   - NEXT_PUBLIC_GEMINI_API_KEY
 */

type KeysCache = { keys: string[]; expiresAt: number }

let keysCache: KeysCache | null = null
const CACHE_MS = 60_000

function parseEnvKeys(): string[] {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim()
  return key ? [key] : []
}

function extractKeysFromDoc(data: Record<string, unknown>): string[] {
  const raw = data.geminiApiKeys ?? data.apiKeys ?? data.keys
  if (Array.isArray(raw)) {
    return raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((k) => k.trim()).filter(Boolean)
  }
  return []
}

export async function getGeminiApiKeys(): Promise<string[]> {
  const now = Date.now()
  if (keysCache && keysCache.expiresAt > now) {
    return keysCache.keys
  }

  let keys: string[] = []

  try {
    const { db } = await import("./firebase")
    const { doc, getDoc } = await import("firebase/firestore")

    const candidates: Array<[string, string]> = [
      ["config", "ai"],
      ["config", "gemini"],
      ["settings", "ai"],
    ]

    for (const [collection, docId] of candidates) {
      const snap = await getDoc(doc(db, collection, docId))
      if (!snap.exists()) continue
      const fromDb = extractKeysFromDoc(snap.data() as Record<string, unknown>)
      if (fromDb.length > 0) {
        keys = fromDb
        break
      }
    }
  } catch (err) {
    console.warn("[Gemini Keys] Firestore read failed, using env fallback:", err)
  }

  if (keys.length === 0) {
    keys = parseEnvKeys()
  }

  keysCache = { keys, expiresAt: now + CACHE_MS }
  return keys
}

export function invalidateGeminiKeysCache(): void {
  keysCache = null
}

export async function hasGeminiApiKeys(): Promise<boolean> {
  const keys = await getGeminiApiKeys()
  return keys.length > 0
}
