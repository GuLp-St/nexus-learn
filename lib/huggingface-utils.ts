/**
 * Utility to generate images using Hugging Face Inference API.
 */

import { HfInference } from "@huggingface/inference";

/**
 * Utility to generate images using Hugging Face Inference API.
 */
export async function generateAIImage(prompt: string, model: string = "black-forest-labs/FLUX.1-dev"): Promise<Blob | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY;

  if (!apiKey) {
    console.error("[Hugging Face] API Key is missing. Check HUGGINGFACE_API_KEY in .env.local");
    return null;
  }

  const client = new HfInference(apiKey);

  try {
    // Attempt generation with requested model
    const blob = await client.textToImage({
      model: model,
      inputs: prompt,
    }) as any;

    return blob as Blob;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`[Hugging Face] Error with model ${model}:`, errorMsg);
    
    // If the error is about credits or provider issues, try a more reliable fallback model
    if (
      (errorMsg.includes("credits") || errorMsg.includes("provider") || errorMsg.includes("too many requests")) && 
      model !== "black-forest-labs/FLUX.1-schnell"
    ) {
      console.log(`[Hugging Face] Attempting fallback to FLUX.1-schnell...`);
      try {
        const fallbackBlob = await client.textToImage({
          model: "black-forest-labs/FLUX.1-schnell",
          inputs: prompt,
        }) as any;
        return fallbackBlob as Blob;
      } catch (fallbackError: any) {
        console.error(`[Hugging Face] Fallback also failed:`, fallbackError.message || fallbackError);
      }
    }

    // Log response details if it's a fetch error
    if (error.response) {
      try {
        const text = await error.response.text();
        console.error(`[Hugging Face] Response details: ${text}`);
      } catch (e) {}
    }
    return null;
  }
}
