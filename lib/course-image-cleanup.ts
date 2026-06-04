"use server"

import { db } from "./firebase"
import { doc, getDoc, deleteDoc } from "firebase/firestore"
import { deleteFileFromUploadthing } from "./upload-actions"

export async function pruneUnusedMaterialImages(
  imageKeysByIndex: Record<number, string>,
  usedIndices: number[]
): Promise<void> {
  const used = new Set(usedIndices)
  for (const [indexStr, key] of Object.entries(imageKeysByIndex)) {
    const index = parseInt(indexStr, 10)
    if (!used.has(index) && key) {
      await deleteFileFromUploadthing(key)
    }
  }
}

export type CourseAssetCleanupInput = {
  imageKey?: string
  sourceMaterialId?: string
}

/** Delete cover, material uploads, and course_materials when course is fully removed. */
export async function deleteAllCourseAssets(
  input: CourseAssetCleanupInput
): Promise<void> {
  const keys = new Set<string>()

  if (input.imageKey) {
    keys.add(input.imageKey)
  }

  const sourceMaterialId = input.sourceMaterialId
  if (sourceMaterialId) {
    try {
      const materialSnap = await getDoc(doc(db, "course_materials", sourceMaterialId))
      if (materialSnap.exists()) {
        const material = materialSnap.data()
        const byIndex = material.imageKeysByIndex as Record<string, string> | undefined
        if (byIndex) {
          Object.values(byIndex).forEach((k) => {
            if (k) keys.add(k)
          })
        }
        const legacyKeys = material.imageKeys as string[] | undefined
        if (Array.isArray(legacyKeys)) {
          legacyKeys.forEach((k) => keys.add(k))
        }
        await deleteDoc(doc(db, "course_materials", sourceMaterialId))
      }
    } catch (e) {
      console.error("Error cleaning course_materials:", e)
    }
  }

  await Promise.all([...keys].map((k) => deleteFileFromUploadthing(k)))
}
