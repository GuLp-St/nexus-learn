"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CourseModule } from "@/lib/gemini"
import {
  resolveQuizQuestionReferencesForViewer,
  type QuizLessonReference,
} from "@/lib/quiz-reference-utils"
import type { QuizQuestion } from "@/lib/quiz-utils"

interface QuizQuestionReferencesProps {
  userId: string | null | undefined
  courseId: string
  question: QuizQuestion
  course?: { modules: CourseModule[]; createdBy?: string } | null
  variant?: "inline" | "block"
}

export function QuizQuestionReferences({
  userId,
  courseId,
  question,
  course,
  variant = "inline",
}: QuizQuestionReferencesProps) {
  const [refs, setRefs] = useState<QuizLessonReference[]>([])

  useEffect(() => {
    if (!userId || !course) {
      setRefs([])
      return
    }

    let cancelled = false
    void resolveQuizQuestionReferencesForViewer(userId, courseId, course, question).then(
      (resolved) => {
        if (!cancelled) setRefs(resolved)
      }
    )

    return () => {
      cancelled = true
    }
  }, [userId, courseId, course, question.questionId, question.sourceFactId, question.sourceFactIds, question.sourceLessonLinks, question.moduleIndex, question.lessonIndex])

  if (refs.length === 0) return null

  return (
    <div className={variant === "block" ? "mt-3 pt-3 border-t border-border" : "pt-1"}>
      {variant === "block" && (
        <p className="text-xs font-medium text-muted-foreground mb-2">Learn more:</p>
      )}
      <div className="flex flex-wrap gap-2">
        {refs.map((ref) => (
          <Button
            key={`${ref.moduleIndex}-${ref.lessonIndex}-${ref.blockIndex ?? "lesson"}`}
            variant="outline"
            size="sm"
            asChild
          >
            <Link href={ref.href} className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>{ref.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  )
}
