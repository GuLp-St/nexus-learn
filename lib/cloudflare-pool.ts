import {
  getCloudflareCredentials,
  getCloudflareImageModel,
  DEFAULT_CLOUDFLARE_IMAGE_MODEL,
  type CloudflareCredential,
} from "./cloudflare-keys"

let roundRobin = 0

export function isCloudflareRateLimitError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error ?? "")
  return /429|rate.?limit|quota|too many requests/i.test(message)
}

function pickCredentialIndex(preferred?: number, count = 1): number {
  if (count === 0) return 0
  if (preferred !== undefined) return preferred % count
  const idx = roundRobin % count
  roundRobin++
  return idx
}

async function requestImage(
  credential: CloudflareCredential,
  prompt: string,
  model: string
): Promise<Blob | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    }
  )

  const contentType = response.headers.get("content-type") ?? ""

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 429 || isCloudflareRateLimitError(errorText)) {
      throw new Error(`429 ${errorText}`)
    }
    console.error(
      `[Cloudflare] Error (${response.status}) account ${credential.accountId.slice(0, 8)}...:`,
      errorText.slice(0, 300)
    )
    return null
  }

  if (contentType.includes("application/json")) {
    const json = await response.json()
    const base64Image = json.result?.image
    if (!base64Image) return null

    let mimeType = "image/png"
    if (base64Image.startsWith("/9j/")) mimeType = "image/jpeg"

    const byteCharacters = atob(base64Image)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType })
  }

  return await response.blob()
}

/**
 * Generate image via Cloudflare Workers AI with credential rotation on 429.
 * Each credential uses its own accountId + apiToken pair.
 */
export async function generateCloudflareImagePooled(
  prompt: string,
  model?: string,
  preferredCredentialIndex?: number
): Promise<Blob | null> {
  const credentials = await getCloudflareCredentials()
  const imageModel =
    model ?? (await getCloudflareImageModel()) ?? DEFAULT_CLOUDFLARE_IMAGE_MODEL

  if (credentials.length === 0) {
    console.warn(
      "[Cloudflare] No credentials. Set cloudflareAccounts in Firestore config/ai or CLOUDFLARE_ACCOUNTS_JSON in env."
    )
    return null
  }

  const startIdx = pickCredentialIndex(
    preferredCredentialIndex,
    credentials.length
  )
  let lastError: unknown

  for (let attempt = 0; attempt < credentials.length; attempt++) {
    const credIndex = (startIdx + attempt) % credentials.length
    const credential = credentials[credIndex]

    try {
      return await requestImage(credential, prompt, imageModel)
    } catch (error) {
      lastError = error
      if (!isCloudflareRateLimitError(error)) throw error
      console.warn(
        `[Cloudflare] Rate limit on credential ${credIndex + 1}/${credentials.length} (account ${credential.accountId.slice(0, 8)}...), trying next...`
      )
    }
  }

  console.error("[Cloudflare] All credentials exhausted:", lastError)
  return null
}

/** Parallel image jobs — each uses a different credential index when possible. */
export async function mapParallelCloudflareImages<T, R>(
  items: T[],
  fn: (item: T, credentialIndex: number, index: number) => Promise<R>,
  maxConcurrency?: number
): Promise<R[]> {
  const credentials = await getCloudflareCredentials()
  const credCount = Math.max(credentials.length, 1)
  const concurrency = Math.min(
    maxConcurrency ?? items.length,
    items.length,
    credCount
  )

  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const index = next++
      if (index >= items.length) break
      results[index] = await fn(items[index], index % credCount, index)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}
