"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, X, Star, Clock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { getCourseWithProgress } from "@/lib/course-utils"
import { getQuizAttempts, QuizAttempt, fetchQuizQuestionsByIds, QuizQuestion } from "@/lib/quiz-utils"
import { formatDateForDisplay } from "@/lib/date-utils"
import { checkObjectiveAnswer } from "@/lib/quiz-generator"

export default function QuizHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const courseId = params.courseId as string
  const [course, setCourse] = useState<any>(null)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null)
  const [selectedAttemptQuestions, setSelectedAttemptQuestions] = useState<QuizQuestion[]>([])

  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }

    const fetchData = async () => {
      try {
        const courseData = await getCourseWithProgress(courseId, user.uid)
        setCourse(courseData)
        
        // Fetch all quiz attempts for this course
        const allAttempts = await getQuizAttempts(user.uid, courseId)
        setAttempts(allAttempts)
      } catch (error) {
        console.error("Error fetching quiz history:", error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchData()
    }
  }, [courseId, user, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        currentPath="/quizzes" 
        title="Quiz History"
        leftAction={
          <Link href={`/quizzes/${courseId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <main className="flex-1">
        <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
          <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
            <Link href={`/quizzes/${courseId}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Quiz Selection</span>
              </Button>
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Quiz History
              </h1>
              <p className="text-muted-foreground mt-2">
                {course?.title || "Course"}
              </p>
            </div>

            {attempts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground">No quiz attempts yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {attempts.map((attempt) => {
                  const scorePercentage = attempt.maxScore > 0 
                    ? Math.round((attempt.totalScore / attempt.maxScore) * 100) 
                    : 0
                  return (
                    <Card 
                      key={attempt.id}
                      className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.01] hover:shadow-md border-2 hover:border-primary/50"
                      onClick={async () => {
                        setSelectedAttempt(attempt)
                        // Fetch questions for this attempt
                        if (attempt.questionIds && attempt.questionIds.length > 0) {
                          const questions = await fetchQuizQuestionsByIds(courseId, attempt.questionIds)
                          setSelectedAttemptQuestions(questions)
                        }
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-foreground capitalize">
                                {attempt.quizType} Quiz
                              </h3>
                              {attempt.moduleIndex !== null && attempt.moduleIndex !== undefined && (
                                <span className="text-sm text-muted-foreground">
                                  Module {attempt.moduleIndex + 1}
                                </span>
                              )}
                              {attempt.lessonIndex !== null && attempt.lessonIndex !== undefined && (
                                <span className="text-sm text-muted-foreground">
                                  Lesson {attempt.lessonIndex + 1}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-primary">
                                  {attempt.totalScore}/{attempt.maxScore}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  ({scorePercentage}%)
                                </span>
                              </div>
                              {attempt.completedAt && (
                                <span className="text-sm text-muted-foreground">
                                  {formatDateForDisplay(attempt.completedAt, "MMM d, yyyy 'at' h:mm a")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const grade = scorePercentage >= 100 ? "S" 
                                : scorePercentage >= 80 ? "A"
                                : scorePercentage >= 60 ? "B"
                                : scorePercentage >= 40 ? "C"
                                : "F"
                              const gradeColor = grade === "S" ? "text-yellow-500"
                                : grade === "A" ? "text-green-500"
                                : grade === "B" ? "text-blue-500"
                                : grade === "C" ? "text-orange-500"
                                : "text-red-500"
                              return (
                                <span className={`text-2xl font-bold ${gradeColor}`}>
                                  {grade}
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Detailed View Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => {
          setSelectedAttempt(null)
          setSelectedAttemptQuestions([])
        }}>
          <Card className="max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground capitalize">
                    {selectedAttempt.quizType} Quiz Results
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {formatDateForDisplay(selectedAttempt.completedAt, "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => {
                  setSelectedAttempt(null)
                  setSelectedAttemptQuestions([])
                }}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="text-4xl font-bold text-primary">
                    {selectedAttempt.totalScore}/{selectedAttempt.maxScore}
                    </div>
                    {(() => {
                      const scorePercentage = selectedAttempt.maxScore > 0 
                        ? Math.round((selectedAttempt.totalScore / selectedAttempt.maxScore) * 100) 
                        : 0
                      const grade = scorePercentage >= 100 ? "S" 
                        : scorePercentage >= 80 ? "A"
                        : scorePercentage >= 60 ? "B"
                        : scorePercentage >= 40 ? "C"
                        : "F"
                      const gradeColor = grade === "S" ? "text-yellow-500"
                        : grade === "A" ? "text-green-500"
                        : grade === "B" ? "text-blue-500"
                        : grade === "C" ? "text-orange-500"
                        : "text-red-500"
                      return (
                        <div className={`text-5xl font-bold ${gradeColor}`}>
                          {grade}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="text-muted-foreground">
                    {selectedAttempt.maxScore > 0 
                      ? Math.round((selectedAttempt.totalScore / selectedAttempt.maxScore) * 100) 
                      : 0}% Score
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedAttempt.questionIds && selectedAttempt.questionIds.length > 0 && selectedAttemptQuestions.length === 0 && (
                    <div className="text-center py-4">
                      <Spinner className="h-6 w-6 mx-auto" />
                    </div>
                  )}
                  {selectedAttemptQuestions.map((question, index) => {
                    const answer = selectedAttempt.answers?.[question.questionId]
                    const score = selectedAttempt.scores?.[question.questionId]
                    const isCorrect = score?.correct || false

                    // Get correct answer display
                    let correctAnswerDisplay = ""
                    if (question.type === "objective") {
                      if (question.objectiveType === "multiple-choice" && question.options) {
                        const correctIndex = typeof question.correctAnswer === "number" 
                          ? question.correctAnswer 
                          : question.options.findIndex(opt => opt === question.correctAnswer)
                        correctAnswerDisplay = question.options[correctIndex] || String(question.correctAnswer)
                      } else if (question.objectiveType === "true-false") {
                        const correctBool = typeof question.correctAnswer === "boolean"
                          ? question.correctAnswer
                          : String(question.correctAnswer).toLowerCase() === "true"
                        correctAnswerDisplay = correctBool ? "True" : "False"
                      }
                    } else {
                      correctAnswerDisplay = question.suggestedAnswer || "See feedback"
                    }

                    // Get user answer display
                    let userAnswerDisplay = ""
                    if (question.type === "objective") {
                      if (question.objectiveType === "multiple-choice" && question.options && typeof answer === "number") {
                        userAnswerDisplay = question.options[answer] || String(answer)
                      } else if (question.objectiveType === "true-false") {
                        const userBool = typeof answer === "boolean"
                          ? answer
                          : String(answer).toLowerCase() === "true"
                        userAnswerDisplay = userBool ? "True" : "False"
                      } else {
                        userAnswerDisplay = String(answer)
                      }
                    } else {
                      userAnswerDisplay = String(answer || "")
                    }

                    return (
                      <Card key={question.questionId} className={isCorrect ? "border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20"}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {isCorrect ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 space-y-2">
                              <div>
                                <p className="font-medium text-foreground mb-1">
                                Question {index + 1}
                              </p>
                                <p className="text-foreground mb-3">
                                  {question.question}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Your answer:</p>
                                <p className="text-foreground font-semibold">{userAnswerDisplay}</p>
                              </div>
                              {!isCorrect && (
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Correct answer:</p>
                                  <p className="text-foreground font-semibold">{correctAnswerDisplay}</p>
                                </div>
                              )}
                              {question.type === "subjective" && score?.feedback && (
                                <div className="mt-2 p-2 bg-background/50 rounded">
                                  <p className="text-sm font-medium text-muted-foreground mb-1">AI Feedback:</p>
                                  <p className="text-sm text-foreground">{score.feedback}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

