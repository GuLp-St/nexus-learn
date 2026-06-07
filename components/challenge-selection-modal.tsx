"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
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
import { createChallenge, DEFAULT_CHALLENGE_SETTINGS, type ChallengeSettings } from "@/lib/challenge-utils"
import { sendMessage } from "@/lib/chat-utils"
import { getUserNexon } from "@/lib/nexon-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"

interface ChallengeSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
  inChat?: boolean
  /** Course picked on journey before opening settings */
  presetCourseId: string
  /** Navigate back to friends chat after sending challenge */
  returnToChat?: boolean
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
  const [selectedQuizType, setSelectedQuizType] = useState<"course" | "module">("course")
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number | null>(null)
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
          const courseQuizOk = canAccessCourseQuiz(course)
          const firstModule = course.modules.findIndex((_, idx) =>
            canAccessModuleQuiz(course, idx)
          )
          if (courseQuizOk) {
            setSelectedQuizType("course")
            setSelectedModuleIndex(null)
          } else if (firstModule >= 0) {
            setSelectedQuizType("module")
            setSelectedModuleIndex(firstModule)
          } else {
            setSelectedQuizType("module")
            setSelectedModuleIndex(null)
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    if (open && presetCourseId) {
      fetchData()
    }
  }, [open, user, presetCourseId])

  const handleSubmit = async () => {
    if (!user || !presetCourseId || !selectedCourse) return

    setSubmitting(true)
    try {
      const challengeId = await Promise.race([
        createChallenge(
          user.uid,
          friendId,
          presetCourseId,
          selectedQuizType,
          selectedModuleIndex,
          betAmount,
          parseInt(expirationHours),
          settings
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Quiz generation timed out. Please try again.")), 90000)
        ),
      ])

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
        metadata: { challengeId, friendId, betAmount },
      })

      onOpenChange(false)
      if (returnToChat || inChat) {
        router.push(
          `/friends?openChat=${encodeURIComponent(friendId)}&friendName=${encodeURIComponent(friendNickname)}`
        )
      } else {
        router.push(`/friends`)
      }
    } catch (error: unknown) {
      console.error("Error creating challenge:", error)
      alert(error instanceof Error ? error.message : "Failed to create challenge")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setSubmitting(false)
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Challenge {friendNickname}</DialogTitle>
            <DialogDescription>
              Configure quiz type and settings for your challenge.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : !selectedCourse ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Course not found. Pick a course from your journey first.
            </p>
          ) : !hasAnyUnlockedModuleQuiz(selectedCourse) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              This course has no unlocked module quizzes yet. Complete a module first.
            </p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2">
                Course: <span className="font-medium text-foreground">{selectedCourse.title}</span>
              </p>

              {/* Quiz Type Selection */}
              <div className="space-y-2">
                <Label>Quiz Type</Label>
                <RadioGroup
                  value={selectedQuizType}
                  onValueChange={(value) => {
                    setSelectedQuizType(value as "course" | "module")
                    setSelectedModuleIndex(null)
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="course"
                      id="course-type"
                      disabled={!canAccessCourseQuiz(selectedCourse)}
                    />
                    <Label
                      htmlFor="course-type"
                      className={`cursor-pointer ${!canAccessCourseQuiz(selectedCourse) ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={
                        !canAccessCourseQuiz(selectedCourse)
                          ? "Complete the course to unlock this quiz"
                          : ""
                      }
                    >
                      Course Quiz (All modules)
                      {!canAccessCourseQuiz(selectedCourse) && (
                        <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                      )}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="module"
                      id="module-type"
                      disabled={
                        !selectedCourse.modules.some((_, idx) =>
                          canAccessModuleQuiz(selectedCourse, idx)
                        )
                      }
                    />
                    <Label
                      htmlFor="module-type"
                      className={`cursor-pointer ${
                        !selectedCourse.modules.some((_, idx) =>
                          canAccessModuleQuiz(selectedCourse, idx)
                        )
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                      title={
                        !selectedCourse.modules.some((_, idx) =>
                          canAccessModuleQuiz(selectedCourse, idx)
                        )
                          ? "Complete modules to unlock module quizzes"
                          : ""
                      }
                    >
                      Module Quiz
                      {!selectedCourse.modules.some((_, idx) =>
                        canAccessModuleQuiz(selectedCourse, idx)
                      ) && <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Module Selection (if module quiz) */}
              {selectedQuizType === "module" && (
                <div className="space-y-2">
                  <Label htmlFor="module">Module</Label>
                  <Select
                    value={selectedModuleIndex?.toString() || ""}
                    onValueChange={(value) => {
                      setSelectedModuleIndex(parseInt(value))
                    }}
                  >
                    <SelectTrigger id="module">
                      <SelectValue placeholder="Select a module" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCourse.modules.map((module, index) => {
                        const isAccessible = canAccessModuleQuiz(selectedCourse, index)
                        return (
                          <SelectItem
                            key={index}
                            value={index.toString()}
                            disabled={!isAccessible}
                            className={!isAccessible ? "opacity-50" : ""}
                          >
                            {module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title}
                            {!isAccessible && " (Locked)"}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Bet Amount Input */}
              <div className="space-y-2">
                <Label htmlFor="bet-amount">Bet Amount (Nexon)</Label>
                <div className="flex items-center gap-2">
                  <NexonIcon className="h-5 w-5 text-primary" />
                  <Input
                    id="bet-amount"
                    type="number"
                    min="0"
                    max={nexon}
                    value={betAmount}
                    onChange={(e) => {
                      const value = Math.max(0, Math.min(nexon, parseInt(e.target.value) || 0))
                      setBetAmount(value)
                    }}
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">
                    (You have {nexon.toLocaleString()})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Winner takes all bets. Both players must bet the same amount.
                </p>
              </div>

              {/* Challenge mode & features — rest unchanged */}
              <div className="space-y-3 rounded-lg border p-3">
                <Label>Challenge mode</Label>
                <RadioGroup
                  value={settings.mode}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      mode: v as "async" | "live",
                      hint: v === "live" ? s.hint : false,
                      sabotage: v === "live" ? s.sabotage : false,
                    }))
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="async" id="mode-async" />
                    <Label htmlFor="mode-async" className="cursor-pointer">
                      Async (play anytime)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="live" id="mode-live" />
                    <Label htmlFor="mode-live" className="cursor-pointer">
                      Live (real-time)
                    </Label>
                  </div>
                </RadioGroup>

                {settings.mode === "live" && (
                  <div className="space-y-2 pt-2 border-t">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.hint}
                        onChange={(e) => setSettings((s) => ({ ...s, hint: e.target.checked }))}
                        className="rounded"
                      />
                      Allow hints
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.sabotage}
                        onChange={(e) => setSettings((s) => ({ ...s, sabotage: e.target.checked }))}
                        className="rounded"
                      />
                      Allow sabotage
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <Label>Gameplay options</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.timer}
                      onChange={(e) => setSettings((s) => ({ ...s, timer: e.target.checked }))}
                      className="rounded"
                    />
                    Timer
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.bpm}
                      onChange={(e) => setSettings((s) => ({ ...s, bpm: e.target.checked }))}
                      className="rounded"
                    />
                    BPM meter
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.combo}
                      onChange={(e) => setSettings((s) => ({ ...s, combo: e.target.checked }))}
                      className="rounded"
                    />
                    Combo multiplier
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.immediateFeedback}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, immediateFeedback: e.target.checked }))
                      }
                      className="rounded"
                    />
                    Instant feedback (green / red flash)
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">Invitation expiration</Label>
                <Select value={expirationHours} onValueChange={setExpirationHours}>
                  <SelectTrigger id="expiration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="3">3 hours</SelectItem>
                    <SelectItem value="6">6 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                    <SelectItem value="24">24 hours (1 day)</SelectItem>
                    <SelectItem value="48">48 hours (2 days)</SelectItem>
                    <SelectItem value="72">72 hours (3 days)</SelectItem>
                    <SelectItem value="168">168 hours (7 days)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Challenge expires if not completed within this time.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    betAmount > nexon ||
                    !hasAnyUnlockedModuleQuiz(selectedCourse) ||
                    (selectedQuizType === "module" && selectedModuleIndex === null) ||
                    (selectedQuizType === "course" && !canAccessCourseQuiz(selectedCourse)) ||
                    (selectedQuizType === "module" &&
                      selectedModuleIndex !== null &&
                      !canAccessModuleQuiz(selectedCourse, selectedModuleIndex))
                  }
                >
                  {submitting ? "Starting…" : "Start Challenge"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
