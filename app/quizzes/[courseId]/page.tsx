"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FileQuestion, BookOpen, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { getMostRecentQuizAttempt, QuizAttempt } from "@/lib/quiz-utils"

export default function QuizSelectionPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [courseAttempt, setCourseAttempt] = useState<QuizAttempt | null>(null)
  const [loading, setLoading] = useState(true)
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
          // Fetch course quiz attempt
          const attempt = await getMostRecentQuizAttempt(user.uid, courseId, "course", null, null)
          setCourseAttempt(attempt)
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

  // Set chatbot context for quiz selection page
  useEffect(() => {
    if (course) {
      const lastScoreText = courseAttempt?.completedAt
        ? ` Last course quiz score: ${courseAttempt.totalScore}/${courseAttempt.maxScore}`
        : ""
      setPageContext({
        type: "generic",
        pageName: "Quiz Selection",
        description: `Quiz selection page for course "${course.title}". The user can choose between Lesson Quizzes, Module Quizzes, or Course Quiz.${lastScoreText} The user can ask about quiz types, which quiz to take, or quiz preparation tips.`,
      })
    }

    return () => {
      setPageContext(null)
    }
  }, [course, courseAttempt, setPageContext])

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

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        currentPath="/quizzes" 
        title="Select Quiz"
        leftAction={
          <Link href="/quizzes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <main className="flex-1">
        {/* Header - Desktop only */}
        <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
          <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
            <Link href="/quizzes">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Quizzes</span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Content Area */}
        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="space-y-8">
            {/* Course Header */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{course.title}</h1>
              <p className="text-lg text-muted-foreground">{course.description}</p>
            </div>

            {/* Quiz Type Selection */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Link href={`/quizzes/${courseId}/lessons`} className="h-full">
                <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer">
                  <CardContent className="p-6 h-full">
                    <div className="flex flex-col items-center text-center h-full">
                      <div className="rounded-full bg-primary/10 p-4 mb-4">
                        <FileQuestion className="h-8 w-8 text-primary" />
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-start space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">Lesson Quizzes</h3>
                        <div className="min-h-[1.5rem] flex flex-col items-center justify-center">
                        </div>
                      </div>
                      <Button className="w-full mt-6">View Lessons</Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href={`/quizzes/${courseId}/modules`} className="h-full">
                <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer">
                  <CardContent className="p-6 h-full">
                    <div className="flex flex-col items-center text-center h-full">
                      <div className="rounded-full bg-primary/10 p-4 mb-4">
                        <BookOpen className="h-8 w-8 text-primary" />
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-start space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">Module Quizzes</h3>
                        <div className="min-h-[1.5rem] flex flex-col items-center justify-center">
                        </div>
                      </div>
                      <Button className="w-full mt-6" variant="outline">View Modules</Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {course.userProgress?.progress && course.userProgress.progress >= 100 ? (
                <Link href={`/quizzes/${courseId}/quiz`} className="h-full">
                  <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer">
                    <CardContent className="p-6 h-full">
                      <div className="flex flex-col items-center text-center h-full">
                        <div className="rounded-full bg-primary/10 p-4 mb-4">
                          <Clock className="h-8 w-8 text-primary" />
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-start space-y-2 w-full">
                          <h3 className="text-lg font-semibold text-foreground">Course Quiz</h3>
                          <div className="min-h-[1.5rem] flex flex-col items-center justify-center">
                            {courseAttempt?.completedAt && (
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-sm font-medium text-green-500">
                                  Last Score: {courseAttempt.totalScore}/{courseAttempt.maxScore}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button className="w-full mt-6" variant={courseAttempt?.completedAt ? "outline" : "default"}>
                          {courseAttempt?.completedAt ? "Retake Course Quiz" : "Take Course Quiz"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="h-full opacity-60 grayscale-[0.5]">
                  <CardContent className="p-6 h-full">
                    <div className="flex flex-col items-center text-center h-full">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-start space-y-2 w-full">
                        <h3 className="text-lg font-semibold text-muted-foreground">Course Quiz</h3>
                        <div className="min-h-[1.5rem] flex flex-col items-center justify-center">
                          <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                            Complete the course (100%) to unlock.
                          </p>
                        </div>
                      </div>
                      <Button className="w-full mt-6" variant="ghost" disabled>
                        Locked
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
