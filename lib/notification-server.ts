import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"
import type { NotificationType } from "./notification-utils"

export async function createServerNotification(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>
): Promise<string> {
  const db = getAdminFirestore()
  const ref = db.collection("notifications").doc()
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  )
  await ref.set({
    userId,
    type,
    data: cleanData,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}
