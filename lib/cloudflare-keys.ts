/**
 * Cloudflare Workers AI — each credential is accountId + apiToken (paired).
 *
 * Firestore config/ai (preferred):
 *   cloudflareAccounts: { accountId: string, apiToken: string }[]
 *   cloudflareImageModel: string
 *
 * Legacy (same account for all tokens):
 *   cloudflareAccountId + cloudflareApiTokens[]
 *
 * Environment:
 *   CLOUDFLARE_ACCOUNTS_JSON=[{"accountId":"...","apiToken":"..."},...]
 *   OR CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (+ optional CLOUDFLARE_API_TOKENS)
 */

export type CloudflareCredential = {
  accountId: string
  apiToken: string
}

type ConfigCache = {
  credentials: CloudflareCredential[]
  imageModel: string | null
  expiresAt: number
}

let configCache: ConfigCache | null = null
const CACHE_MS = 60_000

export const DEFAULT_CLOUDFLARE_IMAGE_MODEL =
  "@cf/black-forest-labs/flux-1-schnell"

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

export async function getCloudflareCredentials(): Promise<CloudflareCredential[]> {
  const now = Date.now()
  if (configCache && configCache.expiresAt > now) {
    return configCache.credentials
  }

  let credentials: CloudflareCredential[] = []
  let imageModel: string | null = null

  try {
    const { db } = await import("./firebase")
    const { doc, getDoc } = await import("firebase/firestore")

    for (const [collection, docId] of [
      ["config", "ai"],
      ["config", "cloudflare"],
      ["settings", "ai"],
    ] as const) {
      const snap = await getDoc(doc(db, collection, docId))
      if (!snap.exists()) continue
      const data = snap.data() as Record<string, unknown>
      const fromDb = parseAccountsFromFirestore(data)
      if (fromDb.length > 0) credentials = fromDb

      const dbModel = data.cloudflareImageModel ?? data.cfImageModel
      if (typeof dbModel === "string" && dbModel.trim()) {
        imageModel = dbModel.trim()
      }
      if (credentials.length > 0) break
    }
  } catch (err) {
    console.warn("[Cloudflare] Firestore config read failed:", err)
  }

  if (credentials.length === 0) {
    credentials = parseAccountsFromEnv()
  }

  configCache = {
    credentials,
    imageModel,
    expiresAt: now + CACHE_MS,
  }

  return credentials
}

export async function getCloudflareImageModel(): Promise<string> {
  await getCloudflareCredentials()
  return configCache?.imageModel ?? DEFAULT_CLOUDFLARE_IMAGE_MODEL
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
