"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Play, CheckCircle2, FileQuestion } from "lucide-react"
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

export default function ModuleQuizzesPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [moduleAttempts, setModuleAttempts] = useState<{ [key: number]: QuizAttempt | null }>({})
  const [retakeModal, setRetakeModal] = useState<{ open: boolean; moduleIndex: number; moduleTitle: string } | null>(null)
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

          // Fetch quiz attempts for all modules
          const attempts: { [key: number]: QuizAttempt | null } = {}
          for (let moduleIndex = 0; moduleIndex < courseWithProgress.modules.length; moduleIndex++) {
            const attempt = await getMostRecentQuizAttempt(user.uid, courseId, "module", moduleIndex, null)
            attempts[moduleIndex] = attempt
          }
          setModuleAttempts(attempts)
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

  // Set chatbot context for module quizzes page
  useEffect(() => {
    if (course) {
      const completedCount = Object.values(moduleAttempts).filter(a => a?.completedAt).length
      setPageContext({
        type: "generic",
        pageName: "Module Quizzes",
        description: `Module quizzes page for course "${course.title}". Shows ${course.modules.length} modules available for quizzes. ${completedCount} module quiz(es) completed. The user can ask about module quizzes, which quiz to take, or quiz preparation.`,
      })
    }

    return () => {
      setPageContext(null)
    }
  }, [course, moduleAttempts, setPageContext])

  const getQuizStatus = (attempt: QuizAttempt | null) => {
    if (!attempt) return { status: "not-started", label: "Not Started", variant: "outline" as const }
    if (!attempt.completedAt) return { status: "in-progress", label: "In Progress", variant: "secondary" as const }
    return { status: "completed", label: "Completed", variant: "default" as const }
  }

  const handleTakeQuiz = (moduleIndex: number, moduleTitle: string) => {
    const attempt = moduleAttempts[moduleIndex]
    const status = getQuizStatus(attempt)

    if (status.status === "completed") {
      // Show retake modal
      setRetakeModal({ open: true, moduleIndex, moduleTitle })
    } else {
      // Start or resume quiz
      router.push(`/quizzes/${courseId}/modules/${moduleIndex}/quiz`)
    }
  }

  const handleRetakeSame = () => {
    if (!retakeModal) return
    router.push(`/quizzes/${courseId}/modules/${retakeModal.moduleIndex}/quiz?retake=same`)
    setRetakeModal(null)
  }

  const handleNewQuestions = () => {
    if (!retakeModal) return
    router.push(`/quizzes/${courseId}/modules/${retakeModal.moduleIndex}/quiz?retake=new`)
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
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Module Quizzes</h1>
              <p className="text-muted-foreground mt-2">Test your knowledge across entire modules in {course.title}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {course.modules.map((module, moduleIndex) => {
                const attempt = moduleAttempts[moduleIndex] || null
                const status = getQuizStatus(attempt)
                const score = attempt && attempt.completedAt
                  ? `${attempt.totalScore}/${attempt.maxScore}`
                  : null
                const cleanTitle = cleanModuleTitle(module.title)
                
                // Check if all lessons in this module are completed
                const moduleLessonIds = module.lessons.map((_, idx) => `${moduleIndex}-${idx}`)
                const allLessonsCompleted = moduleLessonIds.every(id => 
                  course.userProgress?.completedLessons?.includes(id)
                )

                return (
                  <Card key={moduleIndex} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg">
                            Module {moduleIndex + 1}: {cleanTitle}
                          </CardTitle>
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
                      {!allLessonsCompleted && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                          Complete all lessons in this module to unlock.
                        </p>
                      )}
                      <div className="space-y-2 w-full mt-auto">
                        <Button
                          className="w-full"
                          variant={status.status === "completed" ? "outline" : "default"}
                          onClick={() => handleTakeQuiz(moduleIndex, cleanTitle)}
                          disabled={!allLessonsCompleted}
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          {status.status === "completed" ? "Retake Quiz" : status.status === "in-progress" ? "Resume Quiz" : "Take Module Quiz"}
                        </Button>
                        {status.status === "completed" && (
                          <Button
                            variant="ghost"
                            className="w-full"
                            onClick={() => router.push(`/quizzes/${courseId}/history`)}
                          >
                            <FileQuestion className="mr-2 h-4 w-4" />
                            Review Past Quiz
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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
            quizTitle={`Module: ${retakeModal.moduleTitle}`}
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
