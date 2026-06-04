/**
 * Tracks API key usage in Firestore config/ai (client SDK — safe for browser + server bundles).
 * Avoids firebase-admin so gemini-pool / cloudflare-pool can run from client code paths.
 */
import { db } from "./firebase"
import { doc, updateDoc, setDoc, increment, serverTimestamp } from "firebase/firestore"

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

async function bumpUsage(
  fieldPrefix: "geminiKeyUsage" | "cloudflareKeyUsage",
  keyIndex: number,
  rateLimited: boolean
): Promise<void> {
  const date = todayKey()
  const ref = doc(db, "config", "ai")
  const updates: Record<string, ReturnType<typeof increment> | ReturnType<typeof serverTimestamp>> = {
    [`${fieldPrefix}.${keyIndex}.${date}.requests`]: increment(1),
    usageUpdatedAt: serverTimestamp(),
  }
  if (rateLimited) {
    updates[`${fieldPrefix}.${keyIndex}.${date}.rateLimits`] = increment(1)
  }

  try {
    await updateDoc(ref, updates)
  } catch {
    await setDoc(
      ref,
      {
        [fieldPrefix]: {
          [keyIndex]: {
            [date]: { requests: 1, rateLimits: rateLimited ? 1 : 0 },
          },
        },
        usageUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }
}

/** Fire-and-forget: increment daily Gemini key usage. */
export function recordGeminiKeyUsage(keyIndex: number, rateLimited = false): void {
  void bumpUsage("geminiKeyUsage", keyIndex, rateLimited).catch((err) =>
    console.warn("[api-key-usage] gemini:", err)
  )
}

/** Fire-and-forget: increment daily Cloudflare credential usage. */
export function recordCloudflareKeyUsage(keyIndex: number, rateLimited = false): void {
  void bumpUsage("cloudflareKeyUsage", keyIndex, rateLimited).catch((err) =>
    console.warn("[api-key-usage] cloudflare:", err)
  )
}
