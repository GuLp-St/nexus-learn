"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"
import { canAccessCourseQuiz, canAccessModuleQuiz, canAccessLessonQuiz } from "@/lib/quiz-access-utils"

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
  const [selectedQuizType, setSelectedQuizType] = useState<"course" | "module" | "lesson">("course")
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number | null>(null)
  const [selectedLessonIndex, setSelectedLessonIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return

      try {
        setLoading(true)
        const userCourses = await getUserCourses(user.uid)
        setCourses(userCourses)
        if (userCourses.length > 0) {
          setSelectedCourseId(userCourses[0].id)
        }
      } catch (error) {
        console.error("Error fetching courses:", error)
      } finally {
        setLoading(false)
      }
    }

    if (open) {
      fetchCourses()
    }
  }, [open, user])

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)

  const handleSubmit = async () => {
    if (!user || !selectedCourseId) return

    setSubmitting(true)
    try {
      // Navigate to quiz page with challenge parameters
      const quizType = selectedQuizType
      let quizUrl = ""

      if (quizType === "course") {
        quizUrl = `/quizzes/${selectedCourseId}/quiz?challenge=${friendId}`
      } else if (quizType === "module" && selectedModuleIndex !== null) {
        quizUrl = `/quizzes/${selectedCourseId}/modules/${selectedModuleIndex}/quiz?challenge=${friendId}`
      } else if (quizType === "lesson" && selectedModuleIndex !== null && selectedLessonIndex !== null) {
        quizUrl = `/quizzes/${selectedCourseId}/modules/${selectedModuleIndex}/lessons/${selectedLessonIndex}/quiz?challenge=${friendId}`
      } else {
        alert("Please select all required options")
        setSubmitting(false)
        return
      }

      onOpenChange(false)
      router.push(quizUrl)
    } catch (error) {
      console.error("Error starting challenge:", error)
      alert("Failed to start challenge")
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
                setSelectedLessonIndex(null)
              }}>
                <SelectTrigger id="course">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.filter((course) => {
                    // Only show courses that have at least one available quiz
                    return canAccessCourseQuiz(course) || 
                           course.modules.some((_, idx) => canAccessModuleQuiz(course, idx)) ||
                           course.modules.some((module, moduleIdx) => 
                             module.lessons.some((_, lessonIdx) => canAccessLessonQuiz(course, moduleIdx, lessonIdx))
                           )
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
                setSelectedQuizType(value as "course" | "module" | "lesson")
                setSelectedModuleIndex(null)
                setSelectedLessonIndex(null)
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
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value="lesson" 
                        id="lesson-type"
                        disabled={!selectedCourse.modules.some((module, moduleIdx) => 
                          module.lessons.some((_, lessonIdx) => canAccessLessonQuiz(selectedCourse, moduleIdx, lessonIdx))
                        )}
                      />
                      <Label 
                        htmlFor="lesson-type" 
                        className={`cursor-pointer ${!selectedCourse.modules.some((module, moduleIdx) => 
                          module.lessons.some((_, lessonIdx) => canAccessLessonQuiz(selectedCourse, moduleIdx, lessonIdx))
                        ) ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={!selectedCourse.modules.some((module, moduleIdx) => 
                          module.lessons.some((_, lessonIdx) => canAccessLessonQuiz(selectedCourse, moduleIdx, lessonIdx))
                        ) ? "Complete lessons to unlock lesson quizzes" : ""}
                      >
                        Lesson Quiz
                        {!selectedCourse.modules.some((module, moduleIdx) => 
                          module.lessons.some((_, lessonIdx) => canAccessLessonQuiz(selectedCourse, moduleIdx, lessonIdx))
                        ) && (
                          <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                        )}
                      </Label>
                    </div>
                  </>
                )}
              </RadioGroup>
            </div>

            {/* Module Selection (if module or lesson quiz) */}
            {selectedQuizType !== "course" && selectedCourse && (
              <div className="space-y-2">
                <Label htmlFor="module">Module</Label>
                <Select
                  value={selectedModuleIndex?.toString() || ""}
                  onValueChange={(value) => {
                    setSelectedModuleIndex(parseInt(value))
                    setSelectedLessonIndex(null)
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

            {/* Lesson Selection (if lesson quiz) */}
            {selectedQuizType === "lesson" && selectedCourse && selectedModuleIndex !== null && (
              <div className="space-y-2">
                <Label htmlFor="lesson">Lesson</Label>
                <Select
                  value={selectedLessonIndex?.toString() || ""}
                  onValueChange={(value) => setSelectedLessonIndex(parseInt(value))}
                >
                  <SelectTrigger id="lesson">
                    <SelectValue placeholder="Select a lesson" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCourse.modules[selectedModuleIndex]?.lessons
                      .map((lesson, index) => ({ lesson, index }))
                      .map(({ lesson, index }) => {
                        const isAccessible = canAccessLessonQuiz(selectedCourse, selectedModuleIndex, index)
                        return (
                          <SelectItem 
                            key={index} 
                            value={index.toString()}
                            disabled={!isAccessible}
                            className={!isAccessible ? "opacity-50" : ""}
                          >
                            {lesson.title}
                            {!isAccessible && " (Locked)"}
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                  (selectedQuizType === "course" && selectedCourse && !canAccessCourseQuiz(selectedCourse)) ||
                  (selectedQuizType === "module" && (selectedModuleIndex === null || (selectedCourse && selectedModuleIndex !== null && !canAccessModuleQuiz(selectedCourse, selectedModuleIndex)))) ||
                  (selectedQuizType === "lesson" && (selectedModuleIndex === null || selectedLessonIndex === null || (selectedCourse && selectedModuleIndex !== null && selectedLessonIndex !== null && !canAccessLessonQuiz(selectedCourse, selectedModuleIndex, selectedLessonIndex))))
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

