"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { canAccessCourseQuiz, canAccessModuleQuiz, hasAnyUnlockedModuleQuiz } from "@/lib/quiz-access-utils"
import {
  createChallengeShell,
  finalizeChallengeQuestions,
  DEFAULT_CHALLENGE_SETTINGS,
  type ChallengeSettings,
  type ChallengeGameMode,
  type CreateChallengeParams,
} from "@/lib/challenge-utils"
import { sendMessage } from "@/lib/chat-utils"
import { getUserNexon } from "@/lib/nexon-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { cn } from "@/lib/utils"
import { Zap, Sparkles } from "lucide-react"

interface ChallengeSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
  inChat?: boolean
  presetCourseId: string
  returnToChat?: boolean
}

const MODE_INFO: Record<
  ChallengeGameMode,
  { label: string; description: string; icon: ReactNode }
> = {
  classic: {
    label: "Classic",
    description: "Quiz + combo. Pick timer, flash feedback, or BPM below.",
    icon: <Sparkles className="h-3.5 w-3.5 shrink-0" />,
  },
  powered: {
    label: "Powered",
    description: "Live 1v1 — both players must be present. Classic rules plus power actions.",
    icon: <Zap className="h-3.5 w-3.5 shrink-0 text-orange-500" />,
  },
}

function BoolOptionRow({
  name,
  label,
  value,
  onChange,
}: {
  name: string
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label className="text-xs font-normal cursor-default">{label}</Label>
      <RadioGroup
        value={value ? "on" : "off"}
        onValueChange={(v) => onChange(v === "on")}
        className="flex items-center gap-3"
      >
        <div className="flex items-center gap-1">
          <RadioGroupItem value="on" id={`${name}-on`} className="h-3.5 w-3.5" />
          <Label htmlFor={`${name}-on`} className="text-[11px] font-normal cursor-pointer">
            On
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <RadioGroupItem value="off" id={`${name}-off`} className="h-3.5 w-3.5" />
          <Label htmlFor={`${name}-off`} className="text-[11px] font-normal cursor-pointer">
            Off
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}

export function ChallengeSelectionModal({
  open,
  onOpenChange,
  friendId,
  friendNickname,
  inChat = false,
  presetCourseId,
  returnToChat = false,
}: ChallengeSelectionModalProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [selectedCourse, setSelectedCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedQuizType, setSelectedQuizType] = useState<"course" | "module">("module")
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number | null>(null)
  const [betEnabled, setBetEnabled] = useState(false)
  const [betAmount, setBetAmount] = useState<number>(0)
  const [expirationHours, setExpirationHours] = useState<string>("48")
  const [nexon, setNexon] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [settings, setSettings] = useState<ChallengeSettings>(DEFAULT_CHALLENGE_SETTINGS)

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !presetCourseId) return
      try {
        setLoading(true)
        const [userCourses, nexonBalance] = await Promise.all([
          getUserCourses(user.uid),
          getUserNexon(user.uid),
        ])
        const course = userCourses.find((c) => c.id === presetCourseId) ?? null
        setSelectedCourse(course)
        setNexon(nexonBalance)
        if (course) {
          const firstModule = course.modules.findIndex((_, idx) =>
            canAccessModuleQuiz(course, idx)
          )
          const courseQuizOk = canAccessCourseQuiz(course)
          if (firstModule >= 0) {
            setSelectedQuizType("module")
            setSelectedModuleIndex(firstModule)
          } else if (courseQuizOk) {
            setSelectedQuizType("course")
            setSelectedModuleIndex(null)
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }
    if (open && presetCourseId) fetchData()
  }, [open, user, presetCourseId])

  const handleSubmit = async () => {
    if (!user || !presetCourseId || !selectedCourse) return
    setSubmitting(true)
    try {
      const params: CreateChallengeParams = {
        challengerId: user.uid,
        challengedId: friendId,
        courseId: presetCourseId,
        quizType: selectedQuizType,
        moduleIndex: selectedModuleIndex,
        betAmount: betEnabled ? betAmount : 0,
        expirationHours: parseInt(expirationHours),
        settings: { ...settings, combo: true },
      }
      const challengeId = await createChallengeShell(params)
      await sendMessage(
        user.uid,
        friendId,
        `Challenge: ${selectedQuizType === "course" ? "Final Quiz" : "Module Quiz"}`,
        "challenge",
        challengeId
      )
      const { emitQuestEvent } = require("@/lib/event-bus")
      emitQuestEvent({
        type: "quest.send_challenge",
        userId: user.uid,
        metadata: { challengeId, friendId, betAmount: betEnabled ? betAmount : 0 },
      })
      onOpenChange(false)
      if (returnToChat || inChat) {
        router.push(
          `/friends?openChat=${encodeURIComponent(friendId)}&friendName=${encodeURIComponent(friendNickname)}`
        )
      } else {
        router.push(`/friends`)
      }
      void finalizeChallengeQuestions(challengeId, params).catch((err) => {
        console.error("Background challenge generation failed:", err)
      })
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to create challenge")
    } finally {
      setSubmitting(false)
    }
  }

  const courseTitle = selectedCourse?.title ?? "Course"
  const canSubmit =
    !submitting &&
    selectedCourse &&
    hasAnyUnlockedModuleQuiz(selectedCourse) &&
    (!betEnabled || betAmount <= nexon) &&
    (selectedQuizType === "course"
      ? canAccessCourseQuiz(selectedCourse)
      : selectedModuleIndex !== null && canAccessModuleQuiz(selectedCourse, selectedModuleIndex))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSubmitting(false)
        onOpenChange(next)
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-4 gap-3 overflow-y-auto max-h-[90vh]">
        <DialogHeader className="space-y-0.5 pb-0 text-left">
          <DialogTitle className="text-base font-semibold leading-snug pr-6">{courseTitle}</DialogTitle>
          <p className="text-xs text-muted-foreground">Challenge {friendNickname}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !selectedCourse || !hasAnyUnlockedModuleQuiz(selectedCourse) ? (
          <p className="text-sm text-muted-foreground text-center py-4">No unlocked quizzes yet.</p>
        ) : (
          <div className="space-y-3">
            {/* Quiz type */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Quiz</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuizType("module")
                    if (selectedModuleIndex === null && selectedCourse) {
                      const first = selectedCourse.modules.findIndex((_, idx) =>
                        canAccessModuleQuiz(selectedCourse, idx)
                      )
                      if (first >= 0) setSelectedModuleIndex(first)
                    }
                  }}
                  className={cn(
                    "flex-1 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors",
                    selectedQuizType === "module"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  Module Quiz
                </button>
                <button
                  type="button"
                  disabled={!canAccessCourseQuiz(selectedCourse)}
                  onClick={() => {
                    setSelectedQuizType("course")
                    setSelectedModuleIndex(null)
                  }}
                  className={cn(
                    "flex-1 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors",
                    selectedQuizType === "course"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50",
                    !canAccessCourseQuiz(selectedCourse) && "opacity-40 cursor-not-allowed"
                  )}
                >
                  Final Quiz
                </button>
              </div>
            </div>

            {selectedQuizType === "module" && (
              <Select
                value={selectedModuleIndex?.toString() ?? ""}
                onValueChange={(v) => setSelectedModuleIndex(parseInt(v))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCourse.modules.map((m, i) => (
                    <SelectItem
                      key={i}
                      value={i.toString()}
                      disabled={!canAccessModuleQuiz(selectedCourse, i)}
                      className="text-xs"
                    >
                      {m.title.replace(/^Module\s+\d+:\s*/i, "").trim() || m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Game mode */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Mode</Label>
              {(["classic", "powered"] as ChallengeGameMode[]).map((mode) => {
                const info = MODE_INFO[mode]
                const selected = settings.gameMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, gameMode: mode }))}
                    className={cn(
                      "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                      selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      {info.icon}
                      {info.label}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{info.description}</p>
                  </button>
                )
              })}
            </div>

            {/* Options */}
            <div className="rounded-md border px-3 py-2 space-y-0">
              <p className="text-[11px] text-muted-foreground mb-1">Options · combo always on</p>
              <BoolOptionRow
                name="timer"
                label="Timer"
                value={settings.timer}
                onChange={(v) => setSettings((s) => ({ ...s, timer: v }))}
              />
              <BoolOptionRow
                name="feedback"
                label="Instant feedback"
                value={settings.immediateFeedback}
                onChange={(v) => setSettings((s) => ({ ...s, immediateFeedback: v }))}
              />
              <BoolOptionRow
                name="bpm"
                label="BPM meter"
                value={settings.bpm}
                onChange={(v) => setSettings((s) => ({ ...s, bpm: v }))}
              />
            </div>

            {settings.gameMode === "powered" && (
              <div className="rounded-md border px-3 py-2 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Actions per player (1–10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.actionsPerPlayer ?? 3}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      actionsPerPlayer: Math.min(10, Math.max(1, parseInt(e.target.value) || 3)),
                    }))
                  }
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Wager */}
            <div className="rounded-md border px-3 py-2">
              <BoolOptionRow
                name="wager"
                label="Wager Nexon"
                value={betEnabled}
                onChange={(v) => {
                  setBetEnabled(v)
                  if (!v) setBetAmount(0)
                }}
              />
              {betEnabled && (
                <div className="flex items-center gap-2 mt-2 pl-0">
                  <NexonIcon className="h-4 w-4 text-primary shrink-0" />
                  <Input
                    type="number"
                    min={0}
                    max={nexon}
                    value={betAmount}
                    onChange={(e) =>
                      setBetAmount(Math.max(0, Math.min(nexon, parseInt(e.target.value) || 0)))
                    }
                    className="h-8 text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">/ {nexon}</span>
                </div>
              )}
            </div>

            {/* Expiration */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Invitation expires</Label>
              <Select value={expirationHours} onValueChange={setExpirationHours}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="24">1 day</SelectItem>
                  <SelectItem value="48">2 days</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? "Sending…" : "Send challenge"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
