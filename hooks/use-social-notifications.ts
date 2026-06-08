"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { subscribeToTotalUnreadChatCount } from "@/lib/chat-utils"
import { doc, onSnapshot, collection, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Challenge } from "@/lib/challenge-utils"
import {
  getSeenChallengeIds,
  getSeenFriendRequestIds,
} from "@/lib/social-notification-seen"

export function useSocialNotifications() {
  const { user } = useAuth()
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState(0)
  const [pendingChallengesCount, setPendingChallengesCount] = useState(0)
  const [yourTurnChallengeCount, setYourTurnChallengeCount] = useState(0)
  const [seenTick, setSeenTick] = useState(0)

  const bumpSeen = useCallback(() => setSeenTick((n) => n + 1), [])

  useEffect(() => {
    const onSeenUpdate = () => bumpSeen()
    window.addEventListener("nexus-social-seen-updated", onSeenUpdate)
    return () => window.removeEventListener("nexus-social-seen-updated", onSeenUpdate)
  }, [bumpSeen])

  useEffect(() => {
    if (!user) {
      setUnreadChatCount(0)
      setPendingFriendRequestsCount(0)
      setPendingChallengesCount(0)
      setYourTurnChallengeCount(0)
      return
    }

    let challengerTurn = 0
    let challengedTurn = 0

    const syncYourTurn = () => setYourTurnChallengeCount(challengerTurn + challengedTurn)

    const unsubscribeChat = subscribeToTotalUnreadChatCount(user.uid, (count) => {
      setUnreadChatCount(count)
    })

    const unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        const requests: string[] = data.friendRequests || []
        const seenReq = getSeenFriendRequestIds()
        setPendingFriendRequestsCount(requests.filter((id) => !seenReq.has(id)).length)
      }
    })

    const pendingQuery = query(
      collection(db, "challenges"),
      where("challengedId", "==", user.uid),
      where("status", "==", "pending")
    )
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      const seen = getSeenChallengeIds()
      let count = 0
      snapshot.forEach((docSnap) => {
        if (!seen.has(docSnap.id)) count++
      })
      setPendingChallengesCount(count)
    })

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
      const seen = getSeenChallengeIds()
      challengerTurn = 0
      snapshot.forEach((docSnap) => {
        if (seen.has(docSnap.id)) return
        const c = docSnap.data() as Challenge
        if (!c.hasChallengerPlayed) challengerTurn++
      })
      syncYourTurn()
    })
    const unsubscribeChallengedActive = onSnapshot(challengedActiveQuery, (snapshot) => {
      const seen = getSeenChallengeIds()
      challengedTurn = 0
      snapshot.forEach((docSnap) => {
        if (seen.has(docSnap.id)) return
        const c = docSnap.data() as Challenge
        if (c.hasChallengedAccepted && c.challengedScore == null) challengedTurn++
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
  }, [user, seenTick])

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
