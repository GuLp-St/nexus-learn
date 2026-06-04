import { db } from "./firebase"

import {

  collection,

  doc,

  setDoc,

  query,

  where,

  orderBy,

  limit,

  getDocs,

  updateDoc,

  serverTimestamp,

  Timestamp,

  onSnapshot,

  Unsubscribe,

  addDoc,

} from "firebase/firestore"



export interface ChatMessage {

  id: string

  chatId: string

  senderId: string

  receiverId: string

  message: string

  type: "text" | "challenge" | "course_share"

  challengeId?: string

  courseId?: string

  isUsed?: boolean

  read: boolean

  delivered: boolean

  createdAt: Timestamp

}



function logFirestoreError(context: string, error: unknown) {

  const err = error as { code?: string; message?: string }

  console.error(`[${context}]`, err?.code ?? "unknown", err?.message ?? error)

  if (err?.code === "failed-precondition" && err?.message?.includes("index")) {

    console.error("Create the Firestore index from the link in the message above, or run: npm run firebase:deploy:indexes")

  }

}



/**

 * Get a consistent chat ID for two users

 */

export function getChatId(userId1: string, userId2: string): string {

  return [userId1, userId2].sort().join("_")

}



function sortMessagesChronologically(messages: ChatMessage[]): ChatMessage[] {

  return [...messages].sort((a, b) => {

    const aTime = a.createdAt?.toMillis() || 0

    const bTime = b.createdAt?.toMillis() || 0

    return aTime - bTime

  })

}



function chatMessagesQuery(chatId: string, messageLimit: number) {

  return query(

    collection(db, "chatMessages"),

    where("chatId", "==", chatId),

    orderBy("createdAt", "desc"),

    limit(messageLimit)

  )

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



    const messageData: Record<string, unknown> = {

      chatId,

      senderId,

      receiverId,

      message: message.trim(),

      type,

      read: false,

      delivered: true,

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

    const snapshot = await getDocs(chatMessagesQuery(chatId, messageLimit))

    const messages = snapshot.docs.map(

      (docSnap) =>

        ({

          id: docSnap.id,

          ...docSnap.data({ serverTimestamps: "estimate" }),

        }) as ChatMessage

    )

    return sortMessagesChronologically(messages)

  } catch (error: unknown) {

    logFirestoreError("getChatMessages", error)

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



  return onSnapshot(

    chatMessagesQuery(chatId, messageLimit),

    (snapshot) => {

      const messages = snapshot.docs.map(

        (docSnap) =>

          ({

            id: docSnap.id,

            ...docSnap.data({ serverTimestamps: "estimate" }),

          }) as ChatMessage

      )

      callback(sortMessagesChronologically(messages))

    },

    (error) => logFirestoreError("subscribeToChatMessages", error)

  )

}



/**

 * Unread count for one friend

 */

export function subscribeToFriendUnreadCount(

  userId: string,

  friendId: string,

  callback: (count: number) => void

): Unsubscribe {

  const q = query(

    collection(db, "chatMessages"),

    where("receiverId", "==", userId),

    where("senderId", "==", friendId),

    where("read", "==", false)

  )



  return onSnapshot(

    q,

    (snapshot) => callback(snapshot.size),

    (error) => logFirestoreError("subscribeToFriendUnreadCount", error)

  )

}



/**

 * Mark messages as read

 */

export async function markMessagesAsRead(userId: string, otherUserId: string): Promise<void> {

  try {

    const unreadQuery = query(

      collection(db, "chatMessages"),

      where("receiverId", "==", userId),

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

  } catch (error: unknown) {

    logFirestoreError("markMessagesAsRead", error)

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

    logFirestoreError("getTotalUnreadChatCount", error)

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



  return onSnapshot(

    q,

    (snapshot) => callback(snapshot.size),

    (error) => logFirestoreError("subscribeToTotalUnreadChatCount", error)

  )

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

    logFirestoreError("setTypingStatus", error)

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



  return onSnapshot(

    typingRef,

    (docSnap) => {

      if (docSnap.exists()) {

        const data = docSnap.data({ serverTimestamps: "estimate" })

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

    },

    (error) => logFirestoreError("subscribeToTypingStatus", error)

  )

}


