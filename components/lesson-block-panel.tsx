"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ExternalLink, StickyNote, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import type { TextBlock } from "@/lib/gemini"
import {
  getLessonBlockNote,
  saveLessonBlockNote,
  resolveLessonBlockNoteConflict,
} from "@/lib/lesson-block-notes"

interface LessonBlockPanelProps {
  block: TextBlock
  blockIndex: number
  userId: string
  courseId: string
  moduleIndex: number
  lessonIndex: number
  courseTitle?: string
  moduleTitle?: string
  lessonTitle?: string
  isPast?: boolean
  readOnly?: boolean
  canContinue?: boolean
  onContinue?: () => void
  borderClass?: string
}

export function LessonBlockPanel({
  block,
  blockIndex,
  userId,
  courseId,
  moduleIndex,
  lessonIndex,
  isPast,
  readOnly,
  canContinue,
  onContinue,
  borderClass = "border-2 border-primary",
  courseTitle,
  moduleTitle,
  lessonTitle,
}: LessonBlockPanelProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  const [hasConflict, setHasConflict] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return
    getLessonBlockNote(userId, courseId, moduleIndex, lessonIndex, blockIndex, block.content).then(
      (record) => {
        setNote(record.note)
        setHasConflict(!!record.hasConflict)
        if (record.hasConflict) setNoteOpen(true)
      }
    )
  }, [userId, courseId, moduleIndex, lessonIndex, blockIndex, block.content])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const persistNote = useCallback(
    (value: string) => {
      if (!userId) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveLessonBlockNote(
          userId,
          courseId,
          moduleIndex,
          lessonIndex,
          blockIndex,
          value,
          block.content
        ).catch(console.error)
      }, 500)
    },
    [userId, courseId, moduleIndex, lessonIndex, blockIndex, block.content]
  )

  const handleNoteChange = (value: string) => {
    setNote(value)
    setHasConflict(false)
    persistNote(value)
  }

  const handleResolveConflict = async (action: "keep" | "discard") => {
    if (!userId) return
    await resolveLessonBlockNoteConflict(
      userId,
      courseId,
      moduleIndex,
      lessonIndex,
      blockIndex,
      action,
      block.content
    )
    if (action === "discard") setNote("")
    setHasConflict(false)
  }

  const ref = block.reference ?? {
    label: lessonTitle
      ? `${lessonTitle}${moduleTitle ? ` · ${moduleTitle}` : ""}`
      : courseTitle || "Course material",
  }

  return (
    <Card className={isPast && !readOnly ? "opacity-60" : readOnly ? "border" : borderClass}>
      <CardContent className="p-6 space-y-3">
        <MarkdownRenderer content={block.content} />

        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <span className="font-medium text-foreground">Source: </span>
            {ref.url ? (
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                {ref.label || ref.url}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : ref.fileName ? (
              <span className="text-foreground font-medium">
                {ref.fileName}
                {ref.page ? ` · page ${ref.page}` : ""}
                {ref.label ? ` — ${ref.label}` : ""}
              </span>
            ) : (
              <span className="text-foreground font-medium">{ref.label}</span>
            )}
        </div>

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setNoteOpen((o) => !o)}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {noteOpen ? "Hide note" : note ? "View note" : "Add note"}
            {noteOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {hasConflict && (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs space-y-2">
              <p className="text-amber-800 dark:text-amber-200">
                This block was updated after you wrote your note. Keep your note or discard it?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => handleResolveConflict("keep")}
                >
                  Keep note
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleResolveConflict("discard")}
                >
                  Discard note
                </Button>
              </div>
            </div>
          )}
          {noteOpen && (
            <Textarea
              className="mt-2 text-sm min-h-[80px]"
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Your notes for this block…"
            />
          )}
        </div>

        {!isPast && canContinue && onContinue && (
          <div className="mt-2">
            <Button onClick={onContinue} className="w-full">
              Continue
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
