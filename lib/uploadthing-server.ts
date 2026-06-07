import { UTApi } from "uploadthing/server"

export type UploadedImageResult = { ufsUrl: string; key: string }

function getUtApi(): UTApi {
  const token = process.env.UPLOADTHING_TOKEN
  if (!token) {
    throw new Error(
      "UPLOADTHING_TOKEN is not configured. Add it to your environment variables to enable file uploads."
    )
  }
  return new UTApi({ token })
}

/** Upload base64 data URIs to Uploadthing (server-side, no Server Action wrapper). */
export async function uploadDataUrisToUploadthing(
  dataUris: string[]
): Promise<UploadedImageResult[]> {
  if (!dataUris.length) return []

  const utapi = getUtApi()
  const files: File[] = []

  for (let i = 0; i < dataUris.length; i++) {
    const uri = dataUris[i]
    const matches = uri.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) continue

    const mimeType = matches[1] || "image/png"
    const base64Data = matches[2]
    const buffer = Buffer.from(base64Data, "base64")
    const blob = new Blob([buffer], { type: mimeType })
    const fileName = `course-material-${Date.now()}-${i}.png`
    files.push(new File([blob], fileName, { type: mimeType }))
  }

  if (!files.length) return []

  const response = await utapi.uploadFiles(files)
  const errors = response.filter((r) => r.error).map((r) => r.error?.message)
  if (errors.length === response.length) {
    throw new Error(errors[0] || "Failed to upload images to storage")
  }

  return response
    .filter((r) => !r.error && r.data)
    .map((r) => ({
      ufsUrl: r.data!.ufsUrl,
      key: r.data!.key,
    }))
}
