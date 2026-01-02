"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { subscribeToTotalUnreadChatCount } from "@/lib/chat-utils"
import { doc, onSnapshot, collection, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"

export function useSocialNotifications() {
  const { user } = useAuth()
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState(0)
  const [pendingChallengesCount, setPendingChallengesCount] = useState(0)

  useEffect(() => {
    if (!user) {
      setUnreadChatCount(0)
      setPendingFriendRequestsCount(0)
      setPendingChallengesCount(0)
      return
    }

    // Subscribe to unread chat count
    const unsubscribeChat = subscribeToTotalUnreadChatCount(user.uid, (count) => {
      setUnreadChatCount(count)
    })

    // Subscribe to user doc for friend requests
    const unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        setPendingFriendRequestsCount(data.friendRequests?.length || 0)
      }
    })

    // Subscribe to pending challenges
    const challengesQuery = query(
      collection(db, "challenges"),
      where("challengedId", "==", user.uid),
      where("status", "==", "pending")
    )
    const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
      setPendingChallengesCount(snapshot.size)
    })

    return () => {
      unsubscribeChat()
      unsubscribeUser()
      unsubscribeChallenges()
    }
  }, [user])

  return {
    unreadChatCount,
    pendingFriendRequestsCount,
    pendingChallengesCount,
    totalSocialNotifications: unreadChatCount + pendingFriendRequestsCount + pendingChallengesCount,
  }
}

