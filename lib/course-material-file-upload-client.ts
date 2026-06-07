import { genUploader } from "uploadthing/client"
import type { OurFileRouter } from "@/app/api/uploadthing/core"

const { uploadFiles } = genUploader<OurFileRouter>()

export type UploadedCourseMaterialFile = {
  name: string
  url: string
  key: string
}

/** Upload course source files directly to UploadThing (bypasses Vercel body size limits). */
export async function uploadCourseMaterialFiles(
  files: File[],
  onProgress?: (detail: string) => void
): Promise<UploadedCourseMaterialFile[]> {
  if (!files.length) return []

  onProgress?.(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`)

  const results = await uploadFiles("courseMaterials", { files })

  return results.map((file, index) => ({
    name: files[index]?.name || file.name,
    url: file.ufsUrl,
    key: file.key,
  }))
}
