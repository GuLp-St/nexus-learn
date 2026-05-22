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

export const CLOUDFLARE_MODELS = {
  /** Fast — best for course covers & lesson illustrations (recommended) */
  FLUX_SCHNELL: "@cf/black-forest-labs/flux-1-schnell",
  SDXL_LIGHTNING: "@cf/bytedance/stable-diffusion-xl-lightning",
  SDXL_BASE: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
} as const

export { getCloudflareImageModel } from "./cloudflare-keys"

/**
 * Generates an image using Cloudflare Workers AI and returns a Blob.
 */
export async function generateAIImage(
  prompt: string,
  model?: string,
  preferredTokenIndex?: number
): Promise<Blob | null> {
  if (!(await isCloudflareConfigured())) {
    console.warn(
      "[Cloudflare AI] Not configured — set CLOUDFLARE_ACCOUNT_ID + token(s), or Firestore config/ai."
    )
    return null
  }

  const resolvedModel = model ?? (await getCloudflareImageModel())
  console.log(`[Cloudflare AI] Generating with ${resolvedModel}...`)

  return generateCloudflareImagePooled(prompt, resolvedModel, preferredTokenIndex)
}

export { mapParallelCloudflareImages }
