import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp, Unsubscribe } from "firebase/firestore"

export interface UserPresence {
  isOnline: boolean
  lastSeen: Timestamp | null
}

let presenceHeartbeatInterval: NodeJS.Timeout | null = null
let currentUserId: string | null = null

/**
 * Set user as online and start heartbeat to maintain presence
 */
export async function setUserOnline(userId: string): Promise<void> {
  try {
    const presenceRef = doc(db, "userPresence", userId)
    await setDoc(
      presenceRef,
      {
        isOnline: true,
        lastSeen: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      },
      { merge: true }
    )

    // Start heartbeat to maintain online status (update every 30 seconds)
    if (currentUserId !== userId) {
      // Clear existing interval if switching users
      if (presenceHeartbeatInterval) {
        clearInterval(presenceHeartbeatInterval)
      }

      currentUserId = userId
      presenceHeartbeatInterval = setInterval(async () => {
        try {
          await updateDoc(presenceRef, {
            lastHeartbeat: serverTimestamp(),
          })
        } catch (error) {
          console.error("Error updating presence heartbeat:", error)
        }
      }, 30000) // 30 seconds
    }
  } catch (error) {
    console.error("Error setting user online:", error)
  }
}

/**
 * Set user as offline
 */
export async function setUserOffline(userId: string): Promise<void> {
  try {
    // Clear heartbeat interval
    if (presenceHeartbeatInterval) {
      clearInterval(presenceHeartbeatInterval)
      presenceHeartbeatInterval = null
    }

    currentUserId = null

    const presenceRef = doc(db, "userPresence", userId)
    await updateDoc(presenceRef, {
      isOnline: false,
      lastSeen: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error setting user offline:", error)
  }
}

/**
 * Get user presence (online status and last seen)
 */
export async function getUserPresence(userId: string): Promise<UserPresence | null> {
  try {
    const presenceRef = doc(db, "userPresence", userId)
    const presenceDoc = await getDoc(presenceRef)

    if (!presenceDoc.exists()) {
      return null
    }

    const data = presenceDoc.data()
    
    // Check if user is considered online (within last 1 minute of heartbeat)
    // This handles cases where the user's connection dropped but heartbeat wasn't cleared
    const lastHeartbeat = data.lastHeartbeat as Timestamp | undefined
    const isOnline = data.isOnline === true
    
    // If marked as online, verify they're actually online (heartbeat within 1 minute)
    if (isOnline && lastHeartbeat) {
      const now = Date.now()
      const heartbeatTime = lastHeartbeat.toMillis()
      const timeSinceHeartbeat = now - heartbeatTime
      
      // Consider offline if no heartbeat in last 90 seconds
      if (timeSinceHeartbeat > 90000) {
        // Auto-update to offline
        await updateDoc(presenceRef, {
          isOnline: false,
          lastSeen: serverTimestamp(),
        })
        return {
          isOnline: false,
          lastSeen: data.lastSeen as Timestamp | null,
        }
      }
    }

    return {
      isOnline,
      lastSeen: data.lastSeen as Timestamp | null,
    }
  } catch (error) {
    console.error("Error getting user presence:", error)
    return null
  }
}

/**
 * Subscribe to user presence changes (real-time)
 */
export function subscribeToUserPresence(
  userId: string,
  callback: (presence: UserPresence | null) => void
): Unsubscribe {
  const presenceRef = doc(db, "userPresence", userId)
  
  return onSnapshot(
    presenceRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }

      const data = snapshot.data()
      const lastHeartbeat = data.lastHeartbeat as Timestamp | undefined
      const isOnline = data.isOnline === true

      // Verify online status based on heartbeat
      if (isOnline && lastHeartbeat) {
        const now = Date.now()
        const heartbeatTime = lastHeartbeat.toMillis()
        const timeSinceHeartbeat = now - heartbeatTime

        if (timeSinceHeartbeat > 90000) {
          // Auto-update to offline
          updateDoc(presenceRef, {
            isOnline: false,
            lastSeen: serverTimestamp(),
          }).catch(console.error)
          
          callback({
            isOnline: false,
            lastSeen: data.lastSeen as Timestamp | null,
          })
          return
        }
      }

      callback({
        isOnline,
        lastSeen: data.lastSeen as Timestamp | null,
      })
    },
    (error) => {
      console.error("Error subscribing to presence:", error)
      callback(null)
    }
  )
}

/**
 * Initialize presence system (call when user logs in)
 */
export async function initializePresence(userId: string): Promise<void> {
  await setUserOnline(userId)
}

/**
 * Cleanup presence system (call when user logs out or app closes)
 */
export async function cleanupPresence(userId: string): Promise<void> {
  await setUserOffline(userId)
}

