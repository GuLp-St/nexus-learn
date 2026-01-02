import { db } from "./firebase"
import { collection, doc, setDoc, query, where, orderBy, limit, getDocs, updateDoc, serverTimestamp, Timestamp, onSnapshot, Unsubscribe, addDoc } from "firebase/firestore"

export interface ChatMessage {
  id: string
  chatId: string
  senderId: string
  receiverId: string
  message: string
  type: "text" | "challenge" | "course_share"
  challengeId?: string
  courseId?: string
  read: boolean
  delivered: boolean
  createdAt: Timestamp
}

/**
 * Get a consistent chat ID for two users
 */
export function getChatId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_")
}

/**
 * Send a chat message
 */
export async function sendMessage(
  senderId: string,
  receiverId: string,
  message: string,
  type: "text" | "challenge" | "course_share" = "text",
  challengeIdOrCourseId?: string
): Promise<string> {
  if (type === "text" && (!message || message.trim().length === 0)) {
    throw new Error("Message cannot be empty")
  }

  try {
    const chatId = getChatId(senderId, receiverId)
    const messageRef = collection(db, "chatMessages")
    
    const messageData: any = {
      chatId,
      senderId,
      receiverId,
      message: message.trim(),
      type,
      read: false,
      delivered: true, // Mark as delivered immediately when sent
      createdAt: serverTimestamp(),
    }

    if (type === "challenge" && challengeIdOrCourseId) {
      messageData.challengeId = challengeIdOrCourseId
    } else if (type === "course_share" && challengeIdOrCourseId) {
      messageData.courseId = challengeIdOrCourseId
    }

    const docRef = await addDoc(messageRef, messageData)

    return docRef.id
  } catch (error) {
    console.error("Error sending message:", error)
    throw new Error("Failed to send message")
  }
}

/**
 * Get chat messages between two users using chatId
 */
export async function getChatMessages(
  userId1: string,
  userId2: string,
  messageLimit: number = 50
): Promise<ChatMessage[]> {
  try {
    const chatId = getChatId(userId1, userId2)
    const q = query(
      collection(db, "chatMessages"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "desc"),
      limit(messageLimit)
    )

    const snapshot = await getDocs(q)
    const messages: ChatMessage[] = []

    snapshot.forEach((docSnap) => {
      messages.push({
        id: docSnap.id,
        ...docSnap.data({ serverTimestamps: 'estimate' }),
      } as ChatMessage)
    })

    // Sort by createdAt (most recent last)
    messages.sort((a, b) => {
      const aTime = a.createdAt?.toMillis() || Date.now()
      const bTime = b.createdAt?.toMillis() || Date.now()
      return aTime - bTime
    })

    return messages
  } catch (error: any) {
    console.error("Error getting chat messages:", error)
    return []
  }
}

/**
 * Subscribe to chat messages between two users (real-time) using chatId
 */
export function subscribeToChatMessages(
  userId1: string,
  userId2: string,
  callback: (messages: ChatMessage[]) => void,
  messageLimit: number = 50
): Unsubscribe {
  const chatId = getChatId(userId1, userId2)
  const q = query(
    collection(db, "chatMessages"),
    where("chatId", "==", chatId),
    orderBy("createdAt", "desc"),
    limit(messageLimit)
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data({ serverTimestamps: 'estimate' }),
      })) as ChatMessage[]
      
      // Sort by createdAt (most recent last)
      messages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis() || Date.now()
        const bTime = b.createdAt?.toMillis() || Date.now()
        return aTime - bTime
      })

      callback(messages)
    },
    (error) => {
      console.error("Error subscribing to chat messages:", error)
    }
  )
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(userId: string, otherUserId: string): Promise<void> {
  try {
    const chatId = getChatId(userId, otherUserId)
    // Get unread messages where otherUserId is sender and userId is receiver
    const unreadQuery = query(
      collection(db, "chatMessages"),
      where("chatId", "==", chatId),
      where("senderId", "==", otherUserId),
      where("read", "==", false)
    )

    const snapshot = await getDocs(unreadQuery)

    const updatePromises = snapshot.docs.map((docSnap) =>
      updateDoc(doc(db, "chatMessages", docSnap.id), {
        read: true,
      })
    )

    await Promise.all(updatePromises)
  } catch (error: any) {
    console.error("Error marking messages as read:", error)
  }
}

/**
 * Get total unread chat message count for a user
 */
export async function getTotalUnreadChatCount(userId: string): Promise<number> {
  try {
    const q = query(
      collection(db, "chatMessages"),
      where("receiverId", "==", userId),
      where("read", "==", false)
    )
    const snapshot = await getDocs(q)
    return snapshot.size
  } catch (error) {
    console.error("Error getting total unread chat count:", error)
    return 0
  }
}

/**
 * Subscribe to total unread chat message count for a user
 */
export function subscribeToTotalUnreadChatCount(
  userId: string,
  callback: (count: number) => void
): Unsubscribe {
  const q = query(
    collection(db, "chatMessages"),
    where("receiverId", "==", userId),
    where("read", "==", false)
  )

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size)
  }, (error) => {
    console.error("Error subscribing to unread chat count:", error)
  })
}

/**
 * Set typing status for a user in a specific chat
 */
export async function setTypingStatus(
  userId: string,
  otherUserId: string,
  isTyping: boolean
): Promise<void> {
  try {
    const chatId = getChatId(userId, otherUserId)
    const typingRef = doc(db, "typingStatus", `${chatId}_${userId}`)
    await setDoc(typingRef, {
      chatId,
      userId,
      isTyping,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error setting typing status:", error)
  }
}

/**
 * Subscribe to typing status of the other user in a chat
 */
export function subscribeToTypingStatus(
  userId: string,
  otherUserId: string,
  callback: (isTyping: boolean) => void
): Unsubscribe {
  const chatId = getChatId(userId, otherUserId)
  const typingRef = doc(db, "typingStatus", `${chatId}_${otherUserId}`)

  return onSnapshot(typingRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data({ serverTimestamps: 'estimate' })
      // Only consider typing if it was updated in the last 10 seconds
      const updatedAt = data.updatedAt?.toMillis() || 0
      const now = Date.now()
      if (data.isTyping && now - updatedAt < 10000) {
        callback(true)
      } else {
        callback(false)
      }
    } else {
      callback(false)
    }
  })
}
