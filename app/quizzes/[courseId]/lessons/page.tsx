"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FileQuestion, Play, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { getMostRecentQuizAttempt, QuizAttempt } from "@/lib/quiz-utils"
import { QuizRetakeModal } from "@/components/quiz-retake-modal"

export default function LessonQuizzesPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [lessonAttempts, setLessonAttempts] = useState<{ [key: string]: QuizAttempt | null }>({})
  const [retakeModal, setRetakeModal] = useState<{ open: boolean; lessonKey: string; lessonTitle: string; moduleIndex: number; lessonIndex: number } | null>(null)
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setPageContext } = useChatbotContext()
  const courseId = params.courseId as string

  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }

    const fetchCourse = async () => {
      try {
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
        if (courseWithProgress) {
          setCourse(courseWithProgress)

          // Fetch quiz attempts for all lessons
          const attempts: { [key: string]: QuizAttempt | null } = {}
          for (let moduleIndex = 0; moduleIndex < courseWithProgress.modules.length; moduleIndex++) {
            const module = courseWithProgress.modules[moduleIndex]
            for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
              const lessonKey = `${moduleIndex}-${lessonIndex}`
              const attempt = await getMostRecentQuizAttempt(user.uid, courseId, "lesson", moduleIndex, lessonIndex)
              attempts[lessonKey] = attempt
            }
          }
          setLessonAttempts(attempts)
        } else {
          router.push("/quizzes")
        }
      } catch (error) {
        console.error("Error fetching course:", error)
        router.push("/quizzes")
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchCourse()
    }
  }, [courseId, router, user])

  // Set chatbot context for lesson quizzes page
  useEffect(() => {
    if (course) {
      const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0)
      const completedCount = Object.values(lessonAttempts).filter(a => a?.completedAt).length
      setPageContext({
        type: "generic",
        pageName: "Lesson Quizzes",
        description: `Lesson quizzes page for course "${course.title}". Shows ${totalLessons} lessons across ${course.modules.length} modules. ${completedCount} lesson quiz(es) completed. The user can ask about lesson quizzes, which quiz to take, or quiz preparation.`,
      })
    }

    return () => {
      setPageContext(null)
    }
  }, [course, lessonAttempts, setPageContext])

  const getQuizStatus = (attempt: QuizAttempt | null) => {
    if (!attempt) return { status: "not-started", label: "Not Started", variant: "outline" as const }
    if (!attempt.completedAt) return { status: "in-progress", label: "In Progress", variant: "secondary" as const }
    return { status: "completed", label: "Completed", variant: "default" as const }
  }

  const handleTakeQuiz = (moduleIndex: number, lessonIndex: number, lessonTitle: string) => {
    const lessonKey = `${moduleIndex}-${lessonIndex}`
    const attempt = lessonAttempts[lessonKey]
    const status = getQuizStatus(attempt)

    if (status.status === "completed") {
      // Show retake modal
      setRetakeModal({ open: true, lessonKey, lessonTitle, moduleIndex, lessonIndex })
    } else {
      // Start or resume quiz
      router.push(`/quizzes/${courseId}/modules/${moduleIndex}/lessons/${lessonIndex}/quiz`)
    }
  }

  const handleRetakeSame = () => {
    if (!retakeModal) return
    router.push(`/quizzes/${courseId}/modules/${retakeModal.moduleIndex}/lessons/${retakeModal.lessonIndex}/quiz?retake=same`)
    setRetakeModal(null)
  }

  const handleNewQuestions = () => {
    if (!retakeModal) return
    router.push(`/quizzes/${courseId}/modules/${retakeModal.moduleIndex}/lessons/${retakeModal.lessonIndex}/quiz?retake=new`)
    setRetakeModal(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!course) {
    return null
  }

  const cleanModuleTitle = (title: string) => {
    return title.replace(/^Module\s+\d+:\s*/i, "").trim() || title
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <SidebarNav currentPath="/quizzes" />

      <main className="flex-1">
        {/* Header - Desktop only */}
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

        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Lesson Quizzes</h1>
              <p className="text-muted-foreground mt-2">Test your knowledge for each lesson in {course.title}</p>
            </div>

            <div className="space-y-8">
              {course.modules.map((module, moduleIndex) => {
                const moduleTitle = cleanModuleTitle(module.title)
                
                return (
                  <div key={moduleIndex} className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        Module {moduleIndex + 1}: {moduleTitle}
                      </h2>
                      <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const lessonKey = `${moduleIndex}-${lessonIndex}`
                        const attempt = lessonAttempts[lessonKey] || null
                        const status = getQuizStatus(attempt)
                        const score = attempt && attempt.completedAt
                          ? `${attempt.totalScore}/${attempt.maxScore}`
                          : null
                        const isLessonCompleted = course.userProgress?.completedLessons?.includes(lessonKey) || false

                        return (
                          <Card key={`${moduleIndex}-${lessonIndex}`} className="flex flex-col">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-lg">{lesson.title}</CardTitle>
                                </div>
                                <Badge variant={status.variant} className="ml-2 shrink-0">{status.label}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col justify-end gap-3">
                              {score && (
                                <div className="text-sm text-muted-foreground">
                                  Last score: <span className="font-semibold text-foreground">{score}</span>
                                </div>
                              )}
                              {!isLessonCompleted && (
                                <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                                  Complete the lesson to unlock this quiz.
                                </p>
                              )}
                              <div className="space-y-2 w-full mt-auto">
                                <Button
                                  className="w-full"
                                  variant={status.status === "completed" ? "outline" : "default"}
                                  onClick={() => handleTakeQuiz(moduleIndex, lessonIndex, lesson.title)}
                                  disabled={!isLessonCompleted}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  {status.status === "completed" ? "Retake Quiz" : status.status === "in-progress" ? "Resume Quiz" : "Take Quiz"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {retakeModal && (
          <QuizRetakeModal
            open={retakeModal.open}
            onClose={() => setRetakeModal(null)}
            onRetakeSame={handleRetakeSame}
            onNewQuestions={handleNewQuestions}
            quizTitle={retakeModal.lessonTitle}
            onReviewPast={() => {
              setRetakeModal(null)
              router.push(`/quizzes/${courseId}/history`)
            }}
          />
        )}
      </main>
    </div>
  )
}
