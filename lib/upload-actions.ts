"use server"

import { UTApi } from "uploadthing/server";
import { generateAIImage } from "./cloudflare-ai-utils";

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

/**
 * Generates an image with Cloudflare AI and uploads it to Uploadthing.
 */
export async function generateAndUploadImage(prompt: string, fileName: string = "generated-image.png", model?: string) {
  try {
    const blob = await generateAIImage(prompt, model);
    if (!blob) {
      throw new Error("Failed to generate image with Cloudflare AI");
    }
    
    return await uploadGeneratedImage(blob, fileName);
  } catch (error) {
    console.error("Error in generateAndUploadImage:", error);
    throw error;
  }
}

/**
 * Server action to generate an AI image and return it as a base64 string
 * (base64 is easier to send from server to client in a server action)
 */
export async function generateAIImageAction(prompt: string, model?: string) {
  try {
    console.log(`[AI Generation] Prompt: "${prompt}", Model: ${model || "default"}`);
    const blob = await generateAIImage(prompt, model);
    if (!blob) {
      console.error("[AI Generation] Failed: generateAIImage returned null");
      return null;
    }
    
    console.log(`[AI Generation] Success: Blob received, size: ${blob.size}, type: ${blob.type}`);
    
    // Convert blob to base64
    const buffer = Buffer.from(await blob.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUri = `data:${blob.type || "image/png"};base64,${base64}`;

    return dataUri;
  } catch (error) {
    console.error("[AI Generation] Error in generateAIImageAction:", error);
    return null;
  }
}

/**
 * Uploads a file (blob/buffer) to Uploadthing from the server.
 */
export async function uploadGeneratedImage(blob: Blob, fileName: string = "generated-image.png") {
  try {
    const file = new File([blob], fileName, { type: "image/png" });
    const response = await utapi.uploadFiles([file]);
    
    if (response[0].error) {
      throw new Error(response[0].error.message);
    }
    
    return {
      ufsUrl: response[0].data.ufsUrl,
      key: response[0].data.key,
    };
  } catch (error) {
    console.error("Error uploading to Uploadthing:", error);
    throw error;
  }
}

/**
 * Server Action: Uploads a single batch of base64 image data URIs to Uploadthing.
 * This is called multiple times from the client to avoid exceeding body size limits.
 */
export async function uploadCourseMaterialImagesBatch(dataUris: string[]) {
  if (!dataUris || dataUris.length === 0) return [];

  try {
    const files: File[] = [];

    for (let i = 0; i < dataUris.length; i++) {
      const uri = dataUris[i];
      const matches = uri.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) continue;

      const mimeType = matches[1] || "image/png";
      const base64Data = matches[2];

      const buffer = Buffer.from(base64Data, "base64");
      const blob = new Blob([buffer], { type: mimeType });
      const fileName = `course-material-${Date.now()}-${i}.png`;
      const file = new File([blob], fileName, { type: mimeType });
      files.push(file);
    }

    if (files.length === 0) return [];

    const response = await utapi.uploadFiles(files);

    return response
      .filter((r) => !r.error && r.data)
      .map((r) => ({
        ufsUrl: r.data!.ufsUrl,
        key: r.data!.key,
      }));
  } catch (error) {
    console.error("Error uploading course material images batch:", error);
    return [];
  }
}

/**
 * Uploads an array of base64 image data URIs (from course materials) to Uploadthing.
 * Returns an array of public URLs (ufsUrl) and keys for use in lessons and course context.
 * Processes images in batches to avoid exceeding Server Action body size limits.
 * NOTE: This function is kept for backward compatibility but should be called from client-side
 * with batching logic, or use uploadCourseMaterialImagesBatch directly.
 */
export async function uploadCourseMaterialImages(dataUris: string[]) {
  if (!dataUris || dataUris.length === 0) return [];

  const BATCH_SIZE = 5; // Upload 5 images at a time to avoid payload size issues
  const results: { ufsUrl: string; key: string }[] = [];

  try {
    // Process images in batches
    for (let batchStart = 0; batchStart < dataUris.length; batchStart += BATCH_SIZE) {
      const batch = dataUris.slice(batchStart, batchStart + BATCH_SIZE);
      const batchResults = await uploadCourseMaterialImagesBatch(batch);
      results.push(...batchResults);
    }

    return results;
  } catch (error) {
    console.error("Error uploading course material images:", error);
    return results; // Return whatever was successfully uploaded
  }
}

/**
 * Deletes a file from Uploadthing.
 */
export async function deleteFileFromUploadthing(fileKey: string) {
  if (!fileKey) return;
  
  try {
    await utapi.deleteFiles(fileKey);
    return { success: true };
  } catch (error) {
    console.error("Error deleting from Uploadthing:", error);
    return { success: false, error };
  }
}
