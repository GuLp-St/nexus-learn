"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { QuizPrepJob } from "@/lib/quiz-prep-job"
import { toast } from "sonner"

function wasNotified(jobId: string): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(`quiz-prep-notified-${jobId}`) === "1"
}

function markNotified(jobId: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`quiz-prep-notified-${jobId}`, "1")
  }
}

/**
 * Notifies users when a journey quiz finishes generating in the background.
 */
export function QuizPrepWatcher() {
  const { user } = useAuth()
  const router = useRouter()
  const notifiedRef = useRef<Set<string>>(new Set())
  const jobStatusRef = useRef<Map<string, QuizPrepJob["status"]>>(new Map())

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, "quizPrepJobs"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "running", "completed"])
    )

    const unsub = onSnapshot(q, (snap) => {
      const seen = new Set<string>()

      snap.docs.forEach((docSnap) => {
        const job = { id: docSnap.id, ...docSnap.data() } as QuizPrepJob
        seen.add(job.id)

        const prevStatus = jobStatusRef.current.get(job.id)
        jobStatusRef.current.set(job.id, job.status)

        if (job.status !== "completed" || !job.questionIds?.length) return
        if (notifiedRef.current.has(job.id) || wasNotified(job.id)) return
        if (prevStatus !== undefined && prevStatus === "completed") return

        notifiedRef.current.add(job.id)
        markNotified(job.id)

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

      for (const id of jobStatusRef.current.keys()) {
        if (!seen.has(id)) jobStatusRef.current.delete(id)
      }
    })

    return () => unsub()
  }, [user, router])

  return null
}
