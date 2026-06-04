import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import { omitUndefinedDeep } from "./firestore-sanitize"

export type ProcessedMaterialImage = {
  url: string
  description: string
  tags: string[]
  imageIndex: number
}

export async function getCourseMaterialProcessedImages(
  materialId: string
): Promise<ProcessedMaterialImage[]> {
  const snap = await getAdminFirestore().collection("course_materials").doc(materialId).get()
  if (!snap.exists) return []
  const data = snap.data()
  return (data?.processedImages as ProcessedMaterialImage[]) ?? []
}

export async function createCourseMaterial(
  userId: string,
  data: Record<string, unknown>
): Promise<string> {
  const db = getAdminFirestore()
  const ref = db.collection("course_materials").doc()
  await ref.set({
    ...omitUndefinedDeep({ ...data, userId }),
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}
