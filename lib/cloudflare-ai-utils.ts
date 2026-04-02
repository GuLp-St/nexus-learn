/**
 * Utility to generate images using Cloudflare AI.
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

export const CLOUDFLARE_MODELS = {
  FLUX_SCHNELL: "@cf/black-forest-labs/flux-1-schnell",
  SDXL_LIGHTNING: "@cf/bytedance/stable-diffusion-xl-lightning",
  SDXL_BASE: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
};

/**
 * Generates an image using Cloudflare AI and returns a Blob.
 */
export async function generateAIImage(
  prompt: string, 
  model: string = CLOUDFLARE_MODELS.FLUX_SCHNELL
): Promise<Blob | null> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error("[Cloudflare AI] Credentials missing in environment variables.");
    return null;
  }

  console.log(`[Cloudflare AI] Generating image with model: ${model}...`);
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      }
    );

    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Cloudflare AI] Error (${response.status}):`, errorText);
      return null;
    }

    // Cloudflare AI returns the image directly as a binary stream for some models,
    // but for others (like flux-1-schnell), it returns a JSON object with a base64 string.
    if (contentType?.includes("application/json")) {
      const json = await response.json();
      const base64Image = json.result?.image;
      
      if (!base64Image) {
        console.error("[Cloudflare AI] JSON response missing result.image field");
        return null;
      }

      // Detect MIME type from base64 prefix if possible, default to image/png
      // JPEG usually starts with /9j/
      let mimeType = "image/png";
      if (base64Image.startsWith("/9j/")) {
        mimeType = "image/jpeg";
      }

      // Convert base64 to Blob
      const byteCharacters = atob(base64Image);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const imageBlob = new Blob([byteArray], { type: mimeType });

      return imageBlob;
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error("[Cloudflare AI] Unexpected error during generation:", error);
    return null;
  }
}
