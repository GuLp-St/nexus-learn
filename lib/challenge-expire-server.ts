import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"
import { getAdminFirestore } from "./firebase-admin"

interface ChallengeDoc {
  challengerId: string
  challengedId: string
  betAmount?: number
  hasChallengerPlayed?: boolean
  challengedScore?: number | null
}

async function refundNexonAdmin(
  db: Firestore,
  userId: string,
  amount: number,
  source: string,
  description: string,
  challengeId: string
): Promise<void> {
  if (amount <= 0) return
  const userRef = db.collection("users").doc(userId)
  await userRef.update({
    nexon: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await db.collection("nexonHistory").add({
    userId,
    amount,
    source,
    description,
    createdAt: FieldValue.serverTimestamp(),
    metadata: { challengeId },
  })
}

/**
 * Server-side sweep for expired challenges (cron-job.org / secure API).
 */
export async function checkAndHandleExpiredChallengesAdmin(): Promise<{
  pendingExpired: number
  acceptedResolved: number
}> {
  const db = getAdminFirestore()
  const now = Timestamp.now()
  let pendingExpired = 0
  let acceptedResolved = 0

  const pendingSnap = await db
    .collection("challenges")
    .where("status", "==", "pending")
    .where("expiresAt", "<", now)
    .get()

  for (const docSnap of pendingSnap.docs) {
    const data = docSnap.data() as ChallengeDoc
    const bet = data.betAmount || 0
    if (bet > 0) {
      await refundNexonAdmin(
        db,
        data.challengerId,
        bet,
        "Challenge Expired - Refund",
        "Challenge expired without response, bet refunded",
        docSnap.id
      )
    }
    await docSnap.ref.update({ status: "expired" })
    pendingExpired++
  }

  const acceptedSnap = await db
    .collection("challenges")
    .where("status", "==", "accepted")
    .where("completionDeadline", "<", now)
    .get()

  for (const docSnap of acceptedSnap.docs) {
    const data = docSnap.data() as ChallengeDoc
    const challengeId = docSnap.id
    const bet = data.betAmount || 0
    let winnerId: string | null = null

    if (data.hasChallengerPlayed && data.challengedScore == null) {
      winnerId = data.challengerId
    } else if (!data.hasChallengerPlayed && data.challengedScore != null) {
      winnerId = data.challengedId
    }

    if (winnerId) {
      if (bet > 0) {
        await db
          .collection("users")
          .doc(winnerId)
          .update({
            nexon: FieldValue.increment(bet * 2),
            updatedAt: FieldValue.serverTimestamp(),
          })
      }
      await docSnap.ref.update({
        status: "completed",
        winnerId,
        completedAt: FieldValue.serverTimestamp(),
      })
    } else {
      if (bet > 0) {
        await refundNexonAdmin(
          db,
          data.challengerId,
          bet,
          "Challenge Timeout - Refund",
          "Neither party completed, bet refunded",
          challengeId
        )
        await refundNexonAdmin(
          db,
          data.challengedId,
          bet,
          "Challenge Timeout - Refund",
          "Neither party completed, bet refunded",
          challengeId
        )
      }
      await docSnap.ref.update({ status: "expired" })
    }
    acceptedResolved++
  }

  return { pendingExpired, acceptedResolved }
}
