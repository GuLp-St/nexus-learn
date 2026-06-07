"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { QuizPrepJob } from "@/lib/quiz-prep-job"
import { toast } from "sonner"

/**
 * Notifies users when a journey quiz finishes generating in the background.
 */
export function QuizPrepWatcher() {
  const { user } = useAuth()
  const router = useRouter()
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, "quizPrepJobs"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "running", "completed"])
    )

    const unsub = onSnapshot(q, (snap) => {
      snap.docs.forEach((docSnap) => {
        const job = { id: docSnap.id, ...docSnap.data() } as QuizPrepJob
        if (job.status !== "completed" || !job.questionIds?.length) return
        if (notifiedRef.current.has(job.id)) return

        const key = `quiz-prep-notified-${job.id}`
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1")
        notifiedRef.current.add(job.id)

        const label =
          job.kind === "course"
            ? "Final quiz"
            : `Module ${(job.moduleIndex ?? 0) + 1} quiz`
        const href =
          job.kind === "course"
            ? `/journey/quiz/${job.courseId}/quiz`
            : `/journey/quiz/${job.courseId}/modules/${job.moduleIndex}/quiz`

        toast.success(`${label} is ready!`, {
          description: job.courseTitle
            ? `${job.courseTitle} — tap to start`
            : "Tap to open your quiz",
          duration: 12000,
          action: {
            label: "Open",
            onClick: () => router.push(href),
          },
        })
      })
    })

    return () => unsub()
  }, [user, router])

  return null
}
