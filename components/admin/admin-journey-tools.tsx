"use client"

import { useState } from "react"
import { Wand2, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/components/auth-provider"
import { CourseWithProgress } from "@/lib/course-utils"
import {
  AdminCourseProgressControls,
  type AdminCourseProgress,
} from "@/components/admin/admin-course-progress-controls"

interface AdminJourneyToolsProps {
  course: CourseWithProgress
  onUpdated?: () => void
}

function toAdminCourseProgress(course: CourseWithProgress): AdminCourseProgress {
  const progress = course.userProgress
  return {
    courseId: course.id,
    title: course.title,
    progress: progress?.progress ?? 0,
    completedLessons: progress?.completedLessons ?? [],
    moduleQuizScores: progress?.moduleQuizScores ?? {},
    finalQuizScore: progress?.finalQuizScore ?? null,
    modules: (course.modules ?? []).map((mod, moduleIndex) => ({
      moduleIndex,
      title: mod.title ?? `Module ${moduleIndex + 1}`,
      lessons: (mod.lessons ?? []).map((lesson, lessonIndex) => ({
        lessonIndex,
        title: lesson.title ?? `Lesson ${lessonIndex + 1}`,
      })),
    })),
  }
}

/** Granular admin progress controls on a journey course page (admin only). */
export function AdminJourneyTools({ course, onUpdated }: AdminJourneyToolsProps) {
  const { isAdmin, user } = useAuth()
  const [open, setOpen] = useState(false)

  if (!isAdmin || !user || !course.userProgress) return null

  return (
    <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
      <CardHeader className="py-3 px-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Wand2 className="h-4 w-4" />
            Admin demo tools
          </CardTitle>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-4 pb-4">
          <AdminCourseProgressControls
            userId={user.uid}
            course={toAdminCourseProgress(course)}
            onUpdated={onUpdated}
            compact
          />
        </CardContent>
      )}
    </Card>
  )
}
