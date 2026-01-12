"use server"

import { UTApi } from "uploadthing/server";
import { generateAIImage } from "./huggingface-utils";

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

/**
 * Generates an image with Hugging Face and uploads it to Uploadthing.
 */
export async function generateAndUploadImage(prompt: string, fileName: string = "generated-image.png", model?: string) {
  try {
    const blob = await generateAIImage(prompt, model);
    if (!blob) {
      throw new Error("Failed to generate image with Hugging Face");
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
    
    console.log(`[AI Generation] Success: Blob received, size: ${blob.size}`);
    // Convert blob to base64
    const buffer = Buffer.from(await blob.arrayBuffer());
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
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
      url: response[0].data.url,
      key: response[0].data.key,
    };
  } catch (error) {
    console.error("Error uploading to Uploadthing:", error);
    throw error;
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
