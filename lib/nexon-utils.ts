import { db } from "./firebase"
import { doc, getDoc, updateDoc, increment, serverTimestamp, collection, setDoc, Timestamp } from "firebase/firestore"

export interface NexonHistoryEntry {
  id: string
  userId: string
  amount: number // Positive for gains, negative for losses
  source: string
  description?: string
  createdAt: Timestamp
  metadata?: Record<string, any>
}

/**
 * Award Nexon to a user
 */
export async function awardNexon(
  userId: string,
  amount: number,
  source?: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<number> {
  try {
    if (amount <= 0) {
      throw new Error("Amount must be positive")
    }

    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      throw new Error("User not found")
    }

    // Update Nexon balance
    await updateDoc(userRef, {
      nexon: increment(amount),
      updatedAt: serverTimestamp(),
    })

    // Record in history
    await recordNexonHistory(userId, amount, source || "Nexon Award", description, metadata)

    // Get updated balance
    const updatedDoc = await getDoc(userRef)
    return updatedDoc.data()?.nexon || 0
  } catch (error) {
    console.error("Error awarding Nexon:", error)
    throw error
  }
}

/**
 * Spend Nexon (deduct from user balance)
 */
export async function spendNexon(
  userId: string,
  amount: number,
  description?: string,
  metadata?: Record<string, any>
): Promise<number> {
  try {
    if (amount <= 0) {
      throw new Error("Amount must be positive")
    }

    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      throw new Error("User not found")
    }

    const currentNexon = userDoc.data()?.nexon || 0

    if (currentNexon < amount) {
      throw new Error("Insufficient Nexon")
    }

    // Update Nexon balance
    await updateDoc(userRef, {
      nexon: increment(-amount),
      updatedAt: serverTimestamp(),
    })

    // Record in history (negative amount)
    await recordNexonHistory(userId, -amount, "Purchase", description, metadata)

    // Get updated balance
    const updatedDoc = await getDoc(userRef)
    return updatedDoc.data()?.nexon || 0
  } catch (error) {
    console.error("Error spending Nexon:", error)
    throw error
  }
}

/**
 * Get user's current Nexon balance
 */
export async function getUserNexon(userId: string): Promise<number> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return 0
    }

    return userDoc.data()?.nexon || 0
  } catch (error) {
    console.error("Error getting user Nexon:", error)
    return 0
  }
}

/**
 * Record Nexon transaction in history
 */
export async function recordNexonHistory(
  userId: string,
  amount: number,
  source: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const historyRef = doc(collection(db, "nexonHistory"))
    await setDoc(historyRef, {
      userId,
      amount,
      source,
      description: description || "",
      createdAt: serverTimestamp(),
      metadata: metadata || {},
    })
  } catch (error) {
    console.error("Error recording Nexon history:", error)
    // Don't throw - history recording failures shouldn't block transactions
  }
}

/**
 * Get Nexon history for a user
 */
export async function getNexonHistory(userId: string, limit: number = 50): Promise<NexonHistoryEntry[]> {
  try {
    const { query, where, orderBy, getDocs, limit: limitQuery } = await import("firebase/firestore")
    const historyQuery = query(
      collection(db, "nexonHistory"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limitQuery(limit)
    )

    const snapshot = await getDocs(historyQuery)
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as NexonHistoryEntry[]
  } catch (error) {
    console.error("Error getting Nexon history:", error)
    return []
  }
}

