import { db } from "./firebase"
import { collection, doc, setDoc, getDoc, query, where, orderBy, limit, getDocs, updateDoc, serverTimestamp, Timestamp, onSnapshot, Unsubscribe } from "firebase/firestore"

export type NotificationType = "friend_request" | "challenge" | "challenge_result" | "xp_award"

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  data: {
    // friend_request
    requesterId?: string
    requesterName?: string
    // challenge
    challengeId?: string
    challengerId?: string
    challengerName?: string
    courseId?: string
    quizType?: "lesson" | "module" | "course"
    // challenge_result
    winnerId?: string
    winnerName?: string
    yourScore?: number
    opponentScore?: number
    xpAwarded?: number
    nexonWon?: number
    // xp_award
    amount?: number
    source?: string
    newLevel?: number
  }
  read: boolean
  createdAt: Timestamp
}

/**
 * Create a notification
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  data: Notification["data"]
): Promise<string> {
  try {
    const notificationRef = doc(collection(db, "notifications"))
    const notificationId = notificationRef.id

    // Remove undefined values from data to prevent Firestore errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    )

    await setDoc(notificationRef, {
      userId,
      type,
      data: cleanData,
      read: false,
      createdAt: serverTimestamp(),
    })

    return notificationId
  } catch (error) {
    console.error("Error creating notification:", error)
    throw new Error("Failed to create notification")
  }
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  limitCount: number = 50
): Promise<Notification[]> {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )

    const snapshot = await getDocs(notificationsQuery)
    const notifications: Notification[] = []

    snapshot.forEach((docSnap) => {
      notifications.push({
        id: docSnap.id,
        ...docSnap.data(),
      } as Notification)
    })

    return notifications
  } catch (error: any) {
    // If index is building, fallback without orderBy
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "notifications"),
          where("userId", "==", userId),
          limit(limitCount)
        )
        const snapshot = await getDocs(fallbackQuery)
        const notifications: Notification[] = []

        snapshot.forEach((docSnap) => {
          notifications.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as Notification)
        })

        // Sort client-side
        notifications.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0
          return bTime - aTime
        })

        return notifications
      } catch (fallbackError) {
        console.error("Error getting notifications (fallback):", fallbackError)
        return []
      }
    }

    console.error("Error getting notifications:", error)
    return []
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const notificationRef = doc(db, "notifications", notificationId)
    await updateDoc(notificationRef, {
      read: true,
    })
  } catch (error) {
    console.error("Error marking notification as read:", error)
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    )

    const snapshot = await getDocs(notificationsQuery)
    const updatePromises = snapshot.docs.map((docSnap) =>
      updateDoc(doc(db, "notifications", docSnap.id), {
        read: true,
      })
    )

    await Promise.all(updatePromises)
  } catch (error: any) {
    // If index is building, fetch all and filter client-side
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "notifications"),
          where("userId", "==", userId),
          limit(200)
        )
        const snapshot = await getDocs(fallbackQuery)

        const updatePromises = snapshot.docs
          .filter((docSnap) => docSnap.data().read === false)
          .map((docSnap) =>
            updateDoc(doc(db, "notifications", docSnap.id), {
              read: true,
            })
          )

        await Promise.all(updatePromises)
      } catch (fallbackError) {
        console.error("Error marking all notifications as read (fallback):", fallbackError)
      }
    } else {
      console.error("Error marking all notifications as read:", error)
    }
  }
}

/**
 * Subscribe to notifications for a user (real-time)
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void,
  limitCount: number = 50
): Unsubscribe {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  )

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const notifications: Notification[] = []
      snapshot.forEach((docSnap) => {
        notifications.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as Notification)
      })
      callback(notifications)
    },
    (error: any) => {
      // If index is building, use fallback query
      if (error.code === "failed-precondition") {
        const fallbackQuery = query(
          collection(db, "notifications"),
          where("userId", "==", userId),
          limit(limitCount)
        )
        
        const unsubscribe = onSnapshot(
          fallbackQuery,
          (snapshot) => {
            const notifications: Notification[] = []
            snapshot.forEach((docSnap) => {
              notifications.push({
                id: docSnap.id,
                ...docSnap.data(),
              } as Notification)
            })
            
            // Sort client-side
            notifications.sort((a, b) => {
              const aTime = a.createdAt?.toMillis() || 0
              const bTime = b.createdAt?.toMillis() || 0
              return bTime - aTime
            })
            
            callback(notifications)
          },
          (fallbackError) => {
            console.error("Error subscribing to notifications (fallback):", fallbackError)
            callback([])
          }
        )
        
        return unsubscribe
      }
      
      console.error("Error subscribing to notifications:", error)
      callback([])
    }
  )
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    )

    const snapshot = await getDocs(notificationsQuery)
    return snapshot.size
  } catch (error: any) {
    // If index is building, fetch all and count client-side
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "notifications"),
          where("userId", "==", userId),
          limit(200)
        )
        const snapshot = await getDocs(fallbackQuery)
        return snapshot.docs.filter((docSnap) => docSnap.data().read === false).length
      } catch (fallbackError) {
        console.error("Error getting unread count (fallback):", fallbackError)
        return 0
      }
    }

    console.error("Error getting unread notification count:", error)
    return 0
  }
}

