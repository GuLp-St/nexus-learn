/**
 * Cloudflare Workers AI image generation (pooled tokens from Firestore).
 */

import {
  generateCloudflareImagePooled,
  mapParallelCloudflareImages,
} from "./cloudflare-pool"
import {
  getCloudflareImageModel,
  isCloudflareConfigured,
} from "./cloudflare-keys"

export { isCloudflareConfigured }

/** Paste any of these into Firestore config/ai → cloudflareImageModel to test. */
export const CLOUDFLARE_MODELS = {
  /** Google proxied — strong text-in-image; requires AI Gateway balance / BYOK */
  NANO_BANANA_2: "google/nano-banana-2",
  NANO_BANANA: "google/nano-banana",
  /** Leonardo — best @cf text-in-image */
  PHOENIX: "@cf/leonardo/phoenix-1.0",
  LUCID_ORIGIN: "@cf/leonardo/lucid-origin",
  /** Black Forest Labs */
  FLUX_2_KLEIN_4B: "@cf/black-forest-labs/flux-2-klein-4b",
  FLUX_2_KLEIN_9B: "@cf/black-forest-labs/flux-2-klein-9b",
  FLUX_2_DEV: "@cf/black-forest-labs/flux-2-dev",
  FLUX_SCHNELL: "@cf/black-forest-labs/flux-1-schnell",
  SDXL_LIGHTNING: "@cf/bytedance/stable-diffusion-xl-lightning",
  SDXL_BASE: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
} as const

export type GenerateAIImageOptions = {
  width?: number
  height?: number
}

export { getCloudflareImageModel } from "./cloudflare-keys"

/**
 * Generates an image using Cloudflare Workers AI and returns a Blob.
 */
export async function generateAIImage(
  prompt: string,
  model?: string,
  preferredTokenIndex?: number,
  options?: GenerateAIImageOptions
): Promise<Blob | null> {
  if (!(await isCloudflareConfigured())) {
    console.warn(
      "[Cloudflare AI] Not configured — set CLOUDFLARE_ACCOUNT_ID + token(s), or Firestore config/ai."
    )
    return null
  }

  const resolvedModel = model ?? (await getCloudflareImageModel())
  console.log(`[Cloudflare AI] Generating with ${resolvedModel}...`)

  return generateCloudflareImagePooled(
    prompt,
    resolvedModel,
    preferredTokenIndex,
    options
  )
}

export { mapParallelCloudflareImages }
