import { db } from "./firebase"
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, collection, query, where, getDocs, limit } from "firebase/firestore"
import { getUserXP } from "./leaderboard-utils"
import { getUserCourses } from "./course-utils"
import { getLevelProgress } from "./level-utils"

export interface FriendInfo {
  userId: string
  nickname: string
  avatarUrl?: string
  xp: number
  level: number
  currentCourse?: string
  isOnline: boolean
}

export interface FriendRequestInfo {
  userId: string
  nickname: string
  avatarUrl?: string
  mutualFriends?: number
}

/**
 * Send a friend request from userId to targetUserId
 */
export async function sendFriendRequest(userId: string, targetUserId: string): Promise<void> {
  if (userId === targetUserId) {
    throw new Error("Cannot send friend request to yourself")
  }

  try {
    const userRef = doc(db, "users", userId)
    const targetUserRef = doc(db, "users", targetUserId)

    // Check if already friends or request already sent
    const [userDoc, targetUserDoc] = await Promise.all([
      getDoc(userRef),
      getDoc(targetUserRef),
    ])

    if (!userDoc.exists() || !targetUserDoc.exists()) {
      throw new Error("User not found")
    }

    const userData = userDoc.data()
    const targetData = targetUserDoc.data()

    // Check if already friends
    if (userData.friends?.includes(targetUserId) || targetData.friends?.includes(userId)) {
      throw new Error("Already friends")
    }

    // Check if request already sent
    if (userData.sentFriendRequests?.includes(targetUserId)) {
      throw new Error("Friend request already sent")
    }

    // Check if already received a request from target
    if (userData.friendRequests?.includes(targetUserId)) {
      // Auto-accept if target already sent a request
      await acceptFriendRequest(userId, targetUserId)
      return
    }

    // Add to sender's sentFriendRequests and target's friendRequests
    await Promise.all([
      updateDoc(userRef, {
        sentFriendRequests: arrayUnion(targetUserId),
      }),
      updateDoc(targetUserRef, {
        friendRequests: arrayUnion(userId),
      }),
    ])
  } catch (error: any) {
    console.error("Error sending friend request:", error)
    throw error
  }
}

/**
 * Accept a friend request from requesterId
 */
export async function acceptFriendRequest(userId: string, requesterId: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId)
    const requesterRef = doc(db, "users", requesterId)

    // Check if request exists
    const userDoc = await getDoc(userRef)
    if (!userDoc.exists()) {
      throw new Error("User not found")
    }

    const userData = userDoc.data()
    if (!userData.friendRequests?.includes(requesterId)) {
      throw new Error("Friend request not found")
    }

    // Remove from friendRequests and sentFriendRequests, add to friends arrays
    await Promise.all([
      updateDoc(userRef, {
        friendRequests: arrayRemove(requesterId),
        friends: arrayUnion(requesterId),
      }),
      updateDoc(requesterRef, {
        sentFriendRequests: arrayRemove(userId),
        friends: arrayUnion(userId),
      }),
    ])
  } catch (error: any) {
    console.error("Error accepting friend request:", error)
    throw error
  }
}

/**
 * Reject a friend request from requesterId
 */
export async function rejectFriendRequest(userId: string, requesterId: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId)
    const requesterRef = doc(db, "users", requesterId)

    // Remove from friendRequests and sentFriendRequests
    await Promise.all([
      updateDoc(userRef, {
        friendRequests: arrayRemove(requesterId),
      }),
      updateDoc(requesterRef, {
        sentFriendRequests: arrayRemove(userId),
      }),
    ])
  } catch (error: any) {
    console.error("Error rejecting friend request:", error)
    throw error
  }
}

/**
 * Remove a friend (unfriend)
 */
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId)
    const friendRef = doc(db, "users", friendId)

    // Remove from both users' friends arrays
    await Promise.all([
      updateDoc(userRef, {
        friends: arrayRemove(friendId),
      }),
      updateDoc(friendRef, {
        friends: arrayRemove(userId),
      }),
    ])
  } catch (error: any) {
    console.error("Error removing friend:", error)
    throw error
  }
}

/**
 * Get friends list with full info (XP, level, current course, avatar, online status)
 */
export async function getFriends(userId: string): Promise<FriendInfo[]> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return []
    }

    const userData = userDoc.data()
    const friendIds: string[] = userData.friends || []

    if (friendIds.length === 0) {
      return []
    }

    // Fetch all friend user documents
    const friendPromises = friendIds.map(async (friendId) => {
      const friendRef = doc(db, "users", friendId)
      const friendDoc = await getDoc(friendRef)

      if (!friendDoc.exists()) {
        return null
      }

      const friendData = friendDoc.data()
      const xpData = await getUserXP(friendId)
      
      // Fallback values if XP data not found
      const xp = xpData?.xp || 0
      const levelProgress = getLevelProgress(xp)
      
      // Get current course (most recently accessed course)
      const courses = await getUserCourses(friendId)
      const currentCourse = courses.length > 0 ? courses[0].title : undefined

      // Check online status (will be enhanced with presence system)
      const { getUserPresence } = await import("./presence-utils")
      const presence = await getUserPresence(friendId)
      const isOnline = presence?.isOnline || false

      return {
        userId: friendId,
        nickname: friendData.nickname || "Unknown",
        avatarUrl: friendData.avatarUrl || undefined,
        xp: xp,
        level: levelProgress.currentLevel,
        currentCourse,
        isOnline,
      } as FriendInfo
    })

    const friends = await Promise.all(friendPromises)
    return friends.filter((f): f is FriendInfo => f !== null)
  } catch (error) {
    console.error("Error getting friends:", error)
    return []
  }
}

/**
 * Get incoming friend requests
 */
export async function getFriendRequests(userId: string): Promise<FriendRequestInfo[]> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return []
    }

    const userData = userDoc.data()
    const requestIds: string[] = userData.friendRequests || []

    if (requestIds.length === 0) {
      return []
    }

    // Fetch all requester user documents
    const requesterPromises = requestIds.map(async (requesterId) => {
      const requesterRef = doc(db, "users", requesterId)
      const requesterDoc = await getDoc(requesterRef)

      if (!requesterDoc.exists()) {
        return null
      }

      const requesterData = requesterDoc.data()

      // Calculate mutual friends count
      const requesterFriends: string[] = requesterData.friends || []
      const userFriends: string[] = userData.friends || []
      const mutualFriends = requesterFriends.filter((id) => userFriends.includes(id)).length

      return {
        userId: requesterId,
        nickname: requesterData.nickname || "Unknown",
        avatarUrl: requesterData.avatarUrl || undefined,
        mutualFriends,
      } as FriendRequestInfo
    })

    const requests = await Promise.all(requesterPromises)
    return requests.filter((r): r is FriendRequestInfo => r !== null)
  } catch (error) {
    console.error("Error getting friend requests:", error)
    return []
  }
}

/**
 * Search users by nickname (exclude current user and existing friends)
 */
export async function searchUsers(queryText: string, currentUserId: string): Promise<FriendRequestInfo[]> {
  if (!queryText || queryText.trim().length < 2) {
    return []
  }

  try {
    const userRef = doc(db, "users", currentUserId)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return []
    }

    const userData = userDoc.data()
    const friends: string[] = userData.friends || []
    const sentRequests: string[] = userData.sentFriendRequests || []
    const receivedRequests: string[] = userData.friendRequests || []

    // Get all users (limited search - Firestore doesn't support full-text search)
    // In production, you might want to use Algolia or similar for better search
    const usersQuery = query(collection(db, "users"), limit(100))
    const snapshot = await getDocs(usersQuery)

    const searchLower = queryText.toLowerCase().trim()
    const results: FriendRequestInfo[] = []

    snapshot.forEach((docSnap) => {
      const userId = docSnap.id
      if (userId === currentUserId) return

      const userData = docSnap.data()
      const nickname = (userData.nickname || "").toLowerCase()

      // Exclude if already friend, request sent, or request received
      if (
        friends.includes(userId) ||
        sentRequests.includes(userId) ||
        receivedRequests.includes(userId)
      ) {
        return
      }

      // Check if nickname contains search query
      if (nickname.includes(searchLower)) {
        results.push({
          userId,
          nickname: userData.nickname || "Unknown",
          avatarUrl: userData.avatarUrl || undefined,
        })
      }
    })

    return results.slice(0, 20) // Limit to 20 results
  } catch (error) {
    console.error("Error searching users:", error)
    return []
  }
}

/**
 * Check if two users are friends
 */
export async function areFriends(userId1: string, userId2: string): Promise<boolean> {
  try {
    const userRef = doc(db, "users", userId1)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      return false
    }

    const userData = userDoc.data()
    const friends: string[] = userData.friends || []
    return friends.includes(userId2)
  } catch (error) {
    console.error("Error checking friendship:", error)
    return false
  }
}

