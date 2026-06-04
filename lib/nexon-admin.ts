import { FieldValue } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"

export async function getUserNexonAdmin(userId: string): Promise<number> {
  const snap = await getAdminFirestore().collection("users").doc(userId).get()
  if (!snap.exists) return 0
  return snap.data()?.nexon ?? 0
}

export async function spendNexonAdmin(
  userId: string,
  amount: number,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<number> {
  if (amount <= 0) {
    throw new Error("Amount must be positive")
  }

  const db = getAdminFirestore()
  const userRef = db.collection("users").doc(userId)
  const userSnap = await userRef.get()

  if (!userSnap.exists) {
    throw new Error("User not found")
  }

  const currentNexon = userSnap.data()?.nexon ?? 0
  if (currentNexon < amount) {
    throw new Error("Insufficient Nexon")
  }

  await userRef.update({
    nexon: FieldValue.increment(-amount),
    updatedAt: FieldValue.serverTimestamp(),
  })

  try {
    await db.collection("nexonHistory").add({
      userId,
      amount: -amount,
      source: "Purchase",
      description: description ?? "",
      createdAt: FieldValue.serverTimestamp(),
      metadata: metadata ?? {},
    })
  } catch (error) {
    console.error("Error recording Nexon history:", error)
  }

  const updated = await userRef.get()
  return updated.data()?.nexon ?? 0
}
