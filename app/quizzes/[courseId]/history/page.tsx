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
import { getQuizAttempts, QuizAttempt } from "@/lib/quiz-utils"
import { formatDateForDisplay } from "@/lib/date-utils"

export default function QuizHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const courseId = params.courseId as string
  const [course, setCourse] = useState<any>(null)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null)

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
                      onClick={() => setSelectedAttempt(attempt)}
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
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(attempt.maxScore, 10) }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-5 w-5 ${
                                  i < attempt.totalScore 
                                    ? "fill-primary text-primary" 
                                    : "text-muted"
                                }`}
                              />
                            ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedAttempt(null)}>
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
                <Button variant="ghost" size="icon" onClick={() => setSelectedAttempt(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-4xl font-bold text-primary mb-2">
                    {selectedAttempt.totalScore}/{selectedAttempt.maxScore}
                  </div>
                  <div className="text-muted-foreground">
                    {selectedAttempt.maxScore > 0 
                      ? Math.round((selectedAttempt.totalScore / selectedAttempt.maxScore) * 100) 
                      : 0}% Score
                  </div>
                </div>

                <div className="space-y-3">
                  {Object.entries(selectedAttempt.answers || {}).map(([questionId, answer], index) => {
                    const score = selectedAttempt.scores?.[questionId]
                    const isCorrect = score?.correct || false

                    return (
                      <Card key={questionId} className={isCorrect ? "border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20"}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {isCorrect ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1">
                              <p className="font-medium text-foreground mb-2">
                                Question {index + 1}
                              </p>
                              <p className="text-sm text-muted-foreground mb-2">
                                Your answer: {String(answer)}
                              </p>
                              {score?.feedback && (
                                <p className="text-sm text-foreground mt-2 p-2 bg-background/50 rounded">
                                  {score.feedback}
                                </p>
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

