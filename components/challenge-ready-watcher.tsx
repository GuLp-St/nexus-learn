"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { Challenge } from "@/lib/challenge-utils"
import { toast } from "sonner"

/**
 * Toast when a challenge quiz finishes generating in the background.
 */
export function ChallengeReadyWatcher() {
  const { user } = useAuth()
  const router = useRouter()
  const wasGeneratingRef = useRef<Set<string>>(new Set())
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return

    const handleSnap = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => {
      snap.docs.forEach((docSnap) => {
        const c = { id: docSnap.id, ...docSnap.data() } as Challenge
        if (!c.id) return

        if (c.status === "generating" || !c.questionIds?.length) {
          wasGeneratingRef.current.add(c.id)
          return
        }

        if (c.status !== "pending" || !wasGeneratingRef.current.has(c.id)) return
        if (notifiedRef.current.has(c.id)) return

        const key = `challenge-ready-${c.id}`
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1")
        notifiedRef.current.add(c.id)
        wasGeneratingRef.current.delete(c.id)

        const label = c.quizType === "course" ? "Final Quiz" : "Module Quiz"
        toast.success(`Challenge ${label} is ready!`, {
          description: "Open the challenge in chat to play.",
          duration: 12000,
          action: {
            label: "Open",
            onClick: () => router.push(`/challenges/${c.id}/quiz`),
          },
        })
      })
    }

    const qChallenger = query(
      collection(db, "challenges"),
      where("challengerId", "==", user.uid),
      where("status", "in", ["generating", "pending"])
    )
    const qChallenged = query(
      collection(db, "challenges"),
      where("challengedId", "==", user.uid),
      where("status", "in", ["generating", "pending"])
    )

    const unsub1 = onSnapshot(qChallenger, handleSnap)
    const unsub2 = onSnapshot(qChallenged, handleSnap)

    return () => {
      unsub1()
      unsub2()
    }
  }, [user, router])

  return null
}
