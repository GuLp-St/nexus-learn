/**
 * Cloudflare Workers AI — each credential is accountId + apiToken (paired).
 *
 * Firestore config/ai (preferred):
 *   cloudflareAccounts: { accountId: string, apiToken: string }[]
 *   cloudflareImageModel: string — any Workers AI model id (change anytime to test)
 *   cloudflareImageModelFallback: string (optional) — used when primary fails
 *
 * Legacy (same account for all tokens):
 *   cloudflareAccountId + cloudflareApiTokens[]
 *
 * Environment:
 *   CLOUDFLARE_ACCOUNTS_JSON=[{"accountId":"...","apiToken":"..."},...]
 *   OR CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (+ optional CLOUDFLARE_API_TOKENS)
 *   CLOUDFLARE_IMAGE_MODEL — default / fallback Workers AI model (e.g. flux-1-schnell)
 */

export type CloudflareCredential = {
  accountId: string
  apiToken: string
}

type ConfigCache = {
  credentials: CloudflareCredential[]
  imageModel: string | null
  imageModelFallback: string | null
  expiresAt: number
}

let configCache: ConfigCache | null = null
/** Short TTL so Firestore model changes apply quickly when testing. */
const CACHE_MS = 10_000

function parseModelField(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Last-resort model when Firestore and CLOUDFLARE_IMAGE_MODEL are unset. */
export const DEFAULT_CLOUDFLARE_IMAGE_MODEL =
  "@cf/black-forest-labs/flux-2-klein-4b"

function getEnvCloudflareImageModel(): string | null {
  const value = process.env.CLOUDFLARE_IMAGE_MODEL?.trim()
  return value || null
}

function isValidCredential(c: unknown): c is CloudflareCredential {
  if (!c || typeof c !== "object") return false
  const o = c as Record<string, unknown>
  const accountId = o.accountId ?? o.cloudflareAccountId ?? o.cfAccountId
  const apiToken =
    o.apiToken ?? o.token ?? o.api_token ?? o.cloudflareApiToken
  return (
    typeof accountId === "string" &&
    accountId.trim().length > 0 &&
    typeof apiToken === "string" &&
    apiToken.trim().length > 0
  )
}

function normalizeCredential(c: CloudflareCredential): CloudflareCredential {
  return {
    accountId: c.accountId.trim(),
    apiToken: c.apiToken.trim(),
  }
}

function parseAccountsFromFirestore(data: Record<string, unknown>): CloudflareCredential[] {
  const accountsRaw = data.cloudflareAccounts ?? data.cfAccounts
  if (Array.isArray(accountsRaw)) {
    return accountsRaw
      .filter(isValidCredential)
      .map((c) =>
        normalizeCredential({
          accountId: String(
            (c as CloudflareCredential).accountId ??
              (c as Record<string, unknown>).cloudflareAccountId
          ),
          apiToken: String(
            (c as CloudflareCredential).apiToken ??
              (c as Record<string, unknown>).token
          ),
        })
      )
  }

  const accountId =
    (data.cloudflareAccountId as string) ??
    (data.cfAccountId as string) ??
    (data.accountId as string)

  const tokensRaw =
    data.cloudflareApiTokens ?? data.cloudflareTokens ?? data.cfApiTokens

  let tokens: string[] = []
  if (Array.isArray(tokensRaw)) {
    tokens = tokensRaw.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0
    )
  } else if (typeof tokensRaw === "string" && tokensRaw.trim()) {
    tokens = tokensRaw.split(",").map((t) => t.trim()).filter(Boolean)
  }

  if (typeof accountId === "string" && accountId.trim() && tokens.length > 0) {
    return tokens.map((apiToken) =>
      normalizeCredential({ accountId: accountId.trim(), apiToken: apiToken.trim() })
    )
  }

  return []
}

function parseAccountsFromEnv(): CloudflareCredential[] {
  const jsonRaw = process.env.CLOUDFLARE_ACCOUNTS_JSON?.trim()
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidCredential).map((c) =>
          normalizeCredential({
            accountId: String(
              (c as CloudflareCredential).accountId ??
                (c as Record<string, unknown>).cloudflareAccountId
            ),
            apiToken: String(
              (c as CloudflareCredential).apiToken ??
                (c as Record<string, unknown>).token
            ),
          })
        )
      }
    } catch (e) {
      console.warn("[Cloudflare] Invalid CLOUDFLARE_ACCOUNTS_JSON:", e)
    }
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? ""
  if (!accountId) return []

  const tokens: string[] = []
  const multi = process.env.CLOUDFLARE_API_TOKENS
  if (multi?.trim()) {
    tokens.push(...multi.split(",").map((t) => t.trim()).filter(Boolean))
  }
  const single = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (single && !tokens.includes(single)) tokens.unshift(single)

  return tokens.map((apiToken) => normalizeCredential({ accountId, apiToken }))
}

async function loadFirestoreCloudflareConfig(): Promise<{
  credentials: CloudflareCredential[]
  imageModel: string | null
  imageModelFallback: string | null
}> {
  let credentials: CloudflareCredential[] = []
  let imageModel: string | null = null
  let imageModelFallback: string | null = null

  try {
    const { db } = await import("./firebase")
    const { doc, getDoc } = await import("firebase/firestore")

    // config/ai is the canonical doc for model + accounts
    const aiSnap = await getDoc(doc(db, "config", "ai"))
    if (aiSnap.exists()) {
      const data = aiSnap.data() as Record<string, unknown>
      const fromAi = parseAccountsFromFirestore(data)
      if (fromAi.length > 0) credentials = fromAi
      imageModel = parseModelField(data.cloudflareImageModel ?? data.cfImageModel)
      imageModelFallback = parseModelField(
        data.cloudflareImageModelFallback ?? data.cfImageModelFallback
      )
    }

    if (credentials.length === 0 || !imageModel) {
      for (const [collection, docId] of [
        ["config", "cloudflare"],
        ["settings", "ai"],
      ] as const) {
        const snap = await getDoc(doc(db, collection, docId))
        if (!snap.exists()) continue
        const data = snap.data() as Record<string, unknown>
        if (credentials.length === 0) {
          const fromDb = parseAccountsFromFirestore(data)
          if (fromDb.length > 0) credentials = fromDb
        }
        if (!imageModel) {
          imageModel = parseModelField(data.cloudflareImageModel ?? data.cfImageModel)
        }
        if (!imageModelFallback) {
          imageModelFallback = parseModelField(
            data.cloudflareImageModelFallback ?? data.cfImageModelFallback
          )
        }
      }
    }
  } catch (err) {
    console.warn("[Cloudflare] Firestore config read failed:", err)
  }

  return { credentials, imageModel, imageModelFallback }
}

export async function refreshCloudflareConfig(): Promise<void> {
  const now = Date.now()
  const { credentials, imageModel, imageModelFallback } =
    await loadFirestoreCloudflareConfig()

  configCache = {
    credentials:
      credentials.length > 0 ? credentials : parseAccountsFromEnv(),
    imageModel,
    imageModelFallback,
    expiresAt: now + CACHE_MS,
  }
}

export async function getCloudflareCredentials(): Promise<CloudflareCredential[]> {
  const now = Date.now()
  if (!configCache || configCache.expiresAt <= now) {
    await refreshCloudflareConfig()
  }
  return configCache?.credentials ?? []
}

export async function getCloudflareImageModel(): Promise<string> {
  await getCloudflareCredentials()
  return (
    configCache?.imageModel ??
    getEnvCloudflareImageModel() ??
    DEFAULT_CLOUDFLARE_IMAGE_MODEL
  )
}

/** Optional fallback when primary model fails — Firestore field, then env, then hardcoded default. */
export async function getCloudflareFallbackImageModel(): Promise<string | null> {
  await getCloudflareCredentials()
  return (
    configCache?.imageModelFallback ??
    getEnvCloudflareImageModel() ??
    DEFAULT_CLOUDFLARE_IMAGE_MODEL
  )
}

/** @deprecated Use getCloudflareCredentials — kept for callers expecting old shape */
export async function getCloudflareConfig(): Promise<{
  accountId: string
  tokens: string[]
  imageModel: string
}> {
  const credentials = await getCloudflareCredentials()
  const imageModel = await getCloudflareImageModel()
  return {
    accountId: credentials[0]?.accountId ?? "",
    tokens: credentials.map((c) => c.apiToken),
    imageModel,
  }
}

export async function isCloudflareConfigured(): Promise<boolean> {
  const credentials = await getCloudflareCredentials()
  return credentials.length > 0
}

export function invalidateCloudflareConfigCache(): void {
  configCache = null
}

/** Alias for invalidateCloudflareConfigCache — call after editing config/ai in Firestore. */
export const clearCloudflareConfigCache = invalidateCloudflareConfigCache
