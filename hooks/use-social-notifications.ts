"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { subscribeToTotalUnreadChatCount } from "@/lib/chat-utils"
import { doc, onSnapshot, collection, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Challenge } from "@/lib/challenge-utils"

export function useSocialNotifications() {
  const { user } = useAuth()
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState(0)
  const [pendingChallengesCount, setPendingChallengesCount] = useState(0)
  const [yourTurnChallengeCount, setYourTurnChallengeCount] = useState(0)

  useEffect(() => {
    if (!user) {
      setUnreadChatCount(0)
      setPendingFriendRequestsCount(0)
      setPendingChallengesCount(0)
      setYourTurnChallengeCount(0)
      return
    }

    const unsubscribeChat = subscribeToTotalUnreadChatCount(user.uid, (count) => {
      setUnreadChatCount(count)
    })

    const unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        setPendingFriendRequestsCount(data.friendRequests?.length || 0)
      }
    })

    const pendingQuery = query(
      collection(db, "challenges"),
      where("challengedId", "==", user.uid),
      where("status", "==", "pending")
    )
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      setPendingChallengesCount(snapshot.size)
    })

    let challengerTurn = 0
    let challengedTurn = 0

    const syncYourTurn = () => setYourTurnChallengeCount(challengerTurn + challengedTurn)

    const challengerActiveQuery = query(
      collection(db, "challenges"),
      where("challengerId", "==", user.uid),
      where("status", "==", "accepted")
    )
    const challengedActiveQuery = query(
      collection(db, "challenges"),
      where("challengedId", "==", user.uid),
      where("status", "==", "accepted")
    )

    const unsubscribeChallengerActive = onSnapshot(challengerActiveQuery, (snapshot) => {
      challengerTurn = 0
      snapshot.forEach((docSnap) => {
        const c = docSnap.data() as Challenge
        if (!c.hasChallengerPlayed) challengerTurn++
      })
      syncYourTurn()
    })
    const unsubscribeChallengedActive = onSnapshot(challengedActiveQuery, (snapshot) => {
      challengedTurn = 0
      snapshot.forEach((docSnap) => {
        const c = docSnap.data() as Challenge
        if (c.challengedScore === null) challengedTurn++
      })
      syncYourTurn()
    })

    return () => {
      unsubscribeChat()
      unsubscribeUser()
      unsubscribePending()
      unsubscribeChallengerActive()
      unsubscribeChallengedActive()
    }
  }, [user])

  const totalSocialNotifications =
    unreadChatCount +
    pendingFriendRequestsCount +
    pendingChallengesCount +
    yourTurnChallengeCount

  return {
    unreadChatCount,
    pendingFriendRequestsCount,
    pendingChallengesCount,
    yourTurnChallengeCount,
    totalSocialNotifications,
  }
}
