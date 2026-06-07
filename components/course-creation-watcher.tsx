"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import type { CourseCreationJob } from "@/lib/course-creation-job"
import { toast } from "sonner"

/**
 * Watches active course creation jobs globally so users can navigate away
 * and still receive a toast when their journey is ready.
 */
export function CourseCreationWatcher() {
  const { user } = useAuth()
  const router = useRouter()
  const notifiedJobsRef = useRef<Set<string>>(new Set())

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
        snap.docs.forEach((docSnap) => {
          const job = { id: docSnap.id, ...docSnap.data() } as CourseCreationJob
          if (job.status !== "completed" || !job.courseId) return
          if (notifiedJobsRef.current.has(job.id)) return
          if (typeof sessionStorage !== "undefined") {
            const key = `course-notified-${job.id}`
            if (sessionStorage.getItem(key)) return
            sessionStorage.setItem(key, "1")
          }
          notifiedJobsRef.current.add(job.id)

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
      },
      (err) => {
        console.error("Course creation watcher error:", err)
      }
    )

    return () => unsub()
  }, [user, router])

  return null
}
