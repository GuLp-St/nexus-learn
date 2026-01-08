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
import { canAccessCourseQuiz, canAccessModuleQuiz } from "@/lib/quiz-access-utils"
import { createChallenge } from "@/lib/challenge-utils"
import { sendMessage } from "@/lib/chat-utils"
import { getUserNexon } from "@/lib/nexon-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"

interface ChallengeSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
  inChat?: boolean
}

export function ChallengeSelectionModal({
  open,
  onOpenChange,
  friendId,
  friendNickname,
  inChat = false,
}: ChallengeSelectionModalProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<string>("")
  const [selectedQuizType, setSelectedQuizType] = useState<"course" | "module">("course")
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number | null>(null)
  const [betAmount, setBetAmount] = useState<number>(0)
  const [expirationHours, setExpirationHours] = useState<string>("48") // Default 48 hours (2 days)
  const [nexon, setNexon] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      try {
        setLoading(true)
        const [userCourses, nexonBalance] = await Promise.all([
          getUserCourses(user.uid),
          getUserNexon(user.uid),
        ])
        setCourses(userCourses)
        setNexon(nexonBalance)
        if (userCourses.length > 0) {
          setSelectedCourseId(userCourses[0].id)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    if (open) {
      fetchData()
    }
  }, [open, user])

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)

  const handleSubmit = async () => {
    if (!user || !selectedCourseId) return

    setSubmitting(true)
    try {
      // Create challenge immediately
      const challengeId = await createChallenge(
        user.uid,
        friendId,
        selectedCourseId,
        selectedQuizType,
        selectedModuleIndex,
        betAmount,
        parseInt(expirationHours)
      )

      // Send challenge message
      await sendMessage(user.uid, friendId, `Challenge: ${selectedQuizType === "course" ? "Final Quiz" : "Module Quiz"}`, "challenge", challengeId)

      // Emit challenge sent event
      const { emitQuestEvent } = require("@/lib/event-bus")
      emitQuestEvent({
        type: "quest.send_challenge",
        userId: user.uid,
        metadata: { challengeId, friendId, betAmount }
      })

      onOpenChange(false)
      router.push(`/friends`)
    } catch (error: any) {
      console.error("Error creating challenge:", error)
      alert(error.message || "Failed to create challenge")
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Challenge {friendNickname}</DialogTitle>
          <DialogDescription>
            Select a course and quiz type to challenge your friend to a 1v1 quiz!
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Course Selection */}
            <div className="space-y-2">
              <Label htmlFor="course">Course</Label>
              <Select value={selectedCourseId} onValueChange={(value) => {
                setSelectedCourseId(value)
                // Reset quiz type and selections when course changes
                setSelectedQuizType("course")
                setSelectedModuleIndex(null)
              }}>
                <SelectTrigger id="course">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.filter((course) => {
                    // Only show courses that have at least one available quiz
                    return canAccessCourseQuiz(course) || 
                           course.modules.some((_, idx) => canAccessModuleQuiz(course, idx))
                  }).map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quiz Type Selection */}
            <div className="space-y-2">
              <Label>Quiz Type</Label>
              <RadioGroup value={selectedQuizType} onValueChange={(value) => {
                setSelectedQuizType(value as "course" | "module")
                setSelectedModuleIndex(null)
              }}>
                {selectedCourse && (
                  <>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value="course" 
                        id="course-type" 
                        disabled={!canAccessCourseQuiz(selectedCourse)}
                      />
                      <Label 
                        htmlFor="course-type" 
                        className={`cursor-pointer ${!canAccessCourseQuiz(selectedCourse) ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={!canAccessCourseQuiz(selectedCourse) ? "Complete the course to unlock this quiz" : ""}
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
                        disabled={!selectedCourse.modules.some((_, idx) => canAccessModuleQuiz(selectedCourse, idx))}
                      />
                      <Label 
                        htmlFor="module-type" 
                        className={`cursor-pointer ${!selectedCourse.modules.some((_, idx) => canAccessModuleQuiz(selectedCourse, idx)) ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={!selectedCourse.modules.some((_, idx) => canAccessModuleQuiz(selectedCourse, idx)) ? "Complete modules to unlock module quizzes" : ""}
                      >
                        Module Quiz
                        {!selectedCourse.modules.some((_, idx) => canAccessModuleQuiz(selectedCourse, idx)) && (
                          <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                        )}
                      </Label>
                    </div>
                  </>
                )}
              </RadioGroup>
            </div>

            {/* Module Selection (if module quiz) */}
            {selectedQuizType === "module" && selectedCourse && (
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
                    {selectedCourse.modules
                      .map((module, index) => ({ module, index }))
                      .map(({ module, index }) => {
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

            {/* Expiration Selection */}
            <div className="space-y-2">
              <Label htmlFor="expiration">Invitation Expiration</Label>
              <Select value={expirationHours} onValueChange={setExpirationHours}>
                <SelectTrigger id="expiration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hour</SelectItem>
                  <SelectItem value="3">3 Hours</SelectItem>
                  <SelectItem value="6">6 Hours</SelectItem>
                  <SelectItem value="12">12 Hours</SelectItem>
                  <SelectItem value="24">24 Hours (1 Day)</SelectItem>
                  <SelectItem value="48">48 Hours (2 Days)</SelectItem>
                  <SelectItem value="72">72 Hours (3 Days)</SelectItem>
                  <SelectItem value="168">168 Hours (7 Days)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Challenge expires if not completed within this time.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !selectedCourseId ||
                  betAmount > nexon ||
                  (selectedQuizType === "course" && selectedCourse && !canAccessCourseQuiz(selectedCourse)) ||
                  (selectedQuizType === "module" && (selectedModuleIndex === null || (selectedCourse && selectedModuleIndex !== null && !canAccessModuleQuiz(selectedCourse, selectedModuleIndex))))
                }
              >
                {submitting ? "Starting..." : "Start Challenge"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

