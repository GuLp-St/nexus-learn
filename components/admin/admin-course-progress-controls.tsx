"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Library } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { adminJson } from "@/lib/admin-api-client"
import { toast } from "sonner"
import { getModuleQuizScore, MODULE_QUIZ_PASS_SCORE } from "@/lib/progress-display-utils"

export type AdminCourseModule = {
  moduleIndex: number
  title: string
  lessons: { lessonIndex: number; title: string }[]
}

export type AdminCourseProgress = {
  courseId: string
  title: string
  progress: number
  completedLessons: string[]
  moduleQuizScores: Record<string, number>
  finalQuizScore: number | null
  modules: AdminCourseModule[]
}

interface AdminCourseProgressControlsProps {
  userId: string
  course: AdminCourseProgress
  onUpdated?: () => void
  compact?: boolean
}

export function AdminCourseProgressControls({
  userId,
  course,
  onUpdated,
  compact = false,
}: AdminCourseProgressControlsProps) {
  const [expanded, setExpanded] = useState(!compact)
  const [busy, setBusy] = useState(false)

  const run = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true)
    try {
      await adminJson(`/api/admin/users/${userId}/progress`, {
        method: "PATCH",
        body: { courseId: course.courseId, action, ...extra },
      })
      toast.success("Progress updated")
      onUpdated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  const completedSet = new Set(course.completedLessons)
  const finalDone =
    course.finalQuizScore !== null && course.finalQuizScore >= MODULE_QUIZ_PASS_SCORE

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex justify-between gap-2 items-start">
        <button
          type="button"
          className="flex items-center gap-1 min-w-0 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-sm truncate">{course.title}</span>
        </button>
        <Badge variant="outline" className="shrink-0">
          {course.progress}%
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => run("complete_course")}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Complete course
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => run("complete_final_quiz")}
        >
          Final quiz
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive"
          disabled={busy}
          onClick={() => run("reset_progress")}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Remove "${course.title}" from this user's library?`)) return
            setBusy(true)
            try {
              await adminJson(
                `/api/admin/users/${userId}/library?courseId=${encodeURIComponent(course.courseId)}`,
                { method: "DELETE" }
              )
              toast.success("Removed from library")
              onUpdated?.()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed")
            } finally {
              setBusy(false)
            }
          }}
        >
          <Library className="h-3 w-3 mr-1" />
          Remove from library
        </Button>
        {finalDone && (
          <Badge variant="secondary" className="text-xs h-7">
            Final {course.finalQuizScore}%
          </Badge>
        )}
      </div>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-border">
          {course.modules.map((mod) => {
            const modLessons = mod.lessons.map((l) => `${mod.moduleIndex}-${l.lessonIndex}`)
            const allLessonsDone = modLessons.every((id) => completedSet.has(id))
            const quizScore = getModuleQuizScore(course.moduleQuizScores, mod.moduleIndex)
            const quizDone = quizScore !== undefined && quizScore >= MODULE_QUIZ_PASS_SCORE

            return (
              <div
                key={mod.moduleIndex}
                className="rounded-md bg-muted/40 px-2 py-2 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-medium truncate">
                    M{mod.moduleIndex + 1}: {mod.title.replace(/^Module\s+\d+:\s*/i, "").slice(0, 40)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      disabled={busy}
                      onClick={() =>
                        run("complete_module", { moduleIndex: mod.moduleIndex })
                      }
                    >
                      Module
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      disabled={busy}
                      onClick={() =>
                        run("complete_module_quiz", { moduleIndex: mod.moduleIndex })
                      }
                    >
                      Quiz
                    </Button>
                  </div>
                </div>
                {(allLessonsDone || quizDone) && (
                  <p className="text-[10px] text-muted-foreground">
                    {allLessonsDone ? "Lessons ✓" : "Lessons …"}
                    {" · "}
                    {quizDone ? `Quiz ${quizScore}%` : "Quiz …"}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {mod.lessons.map((lesson) => {
                    const id = `${mod.moduleIndex}-${lesson.lessonIndex}`
                    const done = completedSet.has(id)
                    return (
                      <Button
                        key={id}
                        size="sm"
                        variant={done ? "secondary" : "ghost"}
                        className="h-6 text-[10px] px-1.5"
                        disabled={busy || done}
                        onClick={() =>
                          run("complete_lesson", {
                            moduleIndex: mod.moduleIndex,
                            lessonIndex: lesson.lessonIndex,
                          })
                        }
                        title={lesson.title}
                      >
                        L{lesson.lessonIndex + 1}
                        {done ? " ✓" : ""}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
