/**
 * Client-side file processor — sends files to /api/extract-file (server-side extraction).
 * Avoids pdfjs-dist worker issues with Next.js Turbopack in the browser.
 */

export interface ProcessedImage {
  index: number
  base64: string
}

export interface ProcessedFileResult {
  text: string
  images: ProcessedImage[]
}

export type ProcessFileOptions = {
  onProgress?: (message: string) => void
}

export async function processFile(
  file: File,
  options?: ProcessFileOptions
): Promise<ProcessedFileResult> {
  options?.onProgress?.(`Uploading ${file.name}…`)

  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch("/api/extract-file", {
    method: "POST",
    body: formData,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `Failed to process ${file.name}`
    )
  }

  options?.onProgress?.(`Finished ${file.name}`)

  return payload as ProcessedFileResult
}
