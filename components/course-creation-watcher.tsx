"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { CourseCreationJob } from "@/lib/course-creation-job"
import { toast } from "sonner"

function wasNotified(jobId: string): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(`course-notified-${jobId}`) === "1"
}

function markNotified(jobId: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`course-notified-${jobId}`, "1")
  }
}

/**
 * Watches active course creation jobs globally so users can navigate away
 * and still receive a toast when their journey is ready.
 */
export function CourseCreationWatcher() {
  const { user } = useAuth()
  const router = useRouter()
  const notifiedJobsRef = useRef<Set<string>>(new Set())
  const jobStatusRef = useRef<Map<string, CourseCreationJob["status"]>>(new Map())

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, "courseCreationJobs"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "running", "completed"])
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const seen = new Set<string>()

        snap.docs.forEach((docSnap) => {
          const job = { id: docSnap.id, ...docSnap.data() } as CourseCreationJob
          seen.add(job.id)

          const prevStatus = jobStatusRef.current.get(job.id)
          jobStatusRef.current.set(job.id, job.status)

          if (job.status !== "completed" || !job.courseId) return
          if (notifiedJobsRef.current.has(job.id) || wasNotified(job.id)) return
          // Only toast on transition to completed, not when re-opening with stale completed jobs
          if (prevStatus !== undefined && prevStatus === "completed") return

          notifiedJobsRef.current.add(job.id)
          markNotified(job.id)

          const title = job.type === "upload" ? "Upload course" : "AI course"
          toast.success(`${title} is ready!`, {
            description: "Your journey has been built. Tap to open it.",
            duration: 12000,
            action: {
              label: "Open",
              onClick: () => router.push(`/journey/${job.courseId}`),
            },
          })
        })

        for (const id of jobStatusRef.current.keys()) {
          if (!seen.has(id)) jobStatusRef.current.delete(id)
        }
      },
      (err) => {
        console.error("Course creation watcher error:", err)
      }
    )

    return () => unsub()
  }, [user, router])

  return null
}
