"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { DailyQuests } from "@/lib/daily-quest-utils"

export function useClaimableQuestCount(userId: string | undefined) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) {
      setCount(0)
      return
    }

    return onSnapshot(doc(db, "dailyQuests", userId), (snap) => {
      if (!snap.exists()) {
        setCount(0)
        return
      }
      const data = snap.data() as DailyQuests
      const claimable = data.quests?.filter((q) => q.completed && !q.claimed).length ?? 0
      setCount(claimable)
    })
  }, [userId])

  return count
}
