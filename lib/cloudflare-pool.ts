import {
  getCloudflareCredentials,
  getCloudflareImageModel,
  getCloudflareFallbackImageModel,
  DEFAULT_CLOUDFLARE_IMAGE_MODEL,
  type CloudflareCredential,
} from "./cloudflare-keys"
import { recordCloudflareKeyUsage } from "./api-key-usage"

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

export type CloudflareImageOptions = {
  width?: number
  height?: number
}

function modelUsesMultipartForm(model: string): boolean {
  return model.includes("flux-2")
}

function isGoogleImageModel(model: string): boolean {
  return model.startsWith("google/")
}

function aspectRatioFromSize(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 1.7) return "16:9"
  if (ratio < 0.6) return "9:16"
  if (ratio > 1.2) return "4:3"
  if (ratio < 0.85) return "3:4"
  return "1:1"
}

async function requestGoogleImage(
  credential: CloudflareCredential,
  prompt: string,
  model: string,
  options?: CloudflareImageOptions
): Promise<Blob | null> {
  const width = options?.width ?? 1280
  const height = options?.height ?? 720

  // Proxied Google models use POST /ai/run with { model, input } — not /ai/run/{model}
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/ai/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          prompt,
          aspect_ratio: aspectRatioFromSize(width, height),
          output_format: "png",
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 429 || isCloudflareRateLimitError(errorText)) {
      throw new Error(`429 ${errorText}`)
    }
    console.error(
      `[Cloudflare] Google model error (${response.status}):`,
      errorText.slice(0, 300)
    )
    return null
  }

  const json = (await response.json()) as {
    result?: { image?: string }
  }
  const imageRef = json.result?.image
  if (!imageRef) return null

  if (imageRef.startsWith("http://") || imageRef.startsWith("https://")) {
    const imgRes = await fetch(imageRef)
    if (!imgRes.ok) return null
    return await imgRes.blob()
  }

  if (imageRef.startsWith("data:")) {
    const base64 = imageRef.split(",")[1]
    if (!base64) return null
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return new Blob([bytes], { type: "image/png" })
  }

  const bytes = Uint8Array.from(atob(imageRef), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: "image/png" })
}

async function requestImage(
  credential: CloudflareCredential,
  prompt: string,
  model: string,
  options?: CloudflareImageOptions
): Promise<Blob | null> {
  if (isGoogleImageModel(model)) {
    return requestGoogleImage(credential, prompt, model, options)
  }

  const width = options?.width ?? 1280
  const height = options?.height ?? 720

  let requestInit: RequestInit

  if (modelUsesMultipartForm(model)) {
    const form = new FormData()
    form.append("prompt", prompt)
    form.append("width", String(width))
    form.append("height", String(height))
    requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiToken}`,
      },
      body: form,
    }
  } else {
    requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, width, height }),
    }
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/ai/run/${model}`,
    requestInit
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
  preferredCredentialIndex?: number,
  options?: CloudflareImageOptions
): Promise<Blob | null> {
  const credentials = await getCloudflareCredentials()
  const imageModel =
    model ?? (await getCloudflareImageModel()) ?? DEFAULT_CLOUDFLARE_IMAGE_MODEL
  const fallbackModel = await getCloudflareFallbackImageModel()
  const useFallback =
    fallbackModel !== null && fallbackModel !== imageModel

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
      const blob = await requestImage(credential, prompt, imageModel, options)
      if (blob) {
        recordCloudflareKeyUsage(credIndex)
        return blob
      }

      if (useFallback) {
        console.warn(
          `[Cloudflare] ${imageModel} failed on account ${credential.accountId.slice(0, 8)}..., falling back to ${fallbackModel}`
        )
        const fallback = await requestImage(
          credential,
          prompt,
          fallbackModel!,
          options
        )
        if (fallback) {
          recordCloudflareKeyUsage(credIndex)
          return fallback
        }
      }
    } catch (error) {
      lastError = error
      if (!isCloudflareRateLimitError(error)) throw error
      recordCloudflareKeyUsage(credIndex, true)
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
