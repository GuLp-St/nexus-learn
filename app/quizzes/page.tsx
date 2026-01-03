"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileQuestion, BookOpen, Clock, Target, Trophy, Hash } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { getAnyIncompleteQuizAttempt, QuizAttempt, getUserQuizStats, getQuizAttempts, getCourseAverageAccuracy } from "@/lib/quiz-utils"
import { PerfectStreakHistoryModal } from "@/components/perfect-streak-history-modal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const colorGradients = [
  "from-cyan-500 to-blue-500",
  "from-green-500 to-emerald-500",
  "from-purple-500 to-pink-500",
  "from-orange-500 to-red-500",
  "from-indigo-500 to-purple-500",
  "from-pink-500 to-rose-500",
  "from-teal-500 to-cyan-500",
  "from-blue-500 to-indigo-500",
]

function ContinueQuizButton() {
  const { user } = useAuth()
  const router = useRouter()
  const [incompleteQuiz, setIncompleteQuiz] = useState<(QuizAttempt & { courseTitle?: string }) | null>(null)
  const [quizDetails, setQuizDetails] = useState<{ moduleTitle?: string; lessonTitle?: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const fetchIncomplete = async () => {
      if (!user) return
      try {
        const attempt = await getAnyIncompleteQuizAttempt(user.uid)
        setIncompleteQuiz(attempt)

        if (attempt) {
          // Fetch additional details (module/lesson titles)
          try {
            const { getCourseWithProgress } = await import("@/lib/course-utils")
            const course = await getCourseWithProgress(attempt.courseId, user.uid)
            if (course) {
              const details: { moduleTitle?: string; lessonTitle?: string } = {}
              if (attempt.moduleIndex !== null && attempt.moduleIndex !== undefined) {
                const module = course.modules[attempt.moduleIndex]
                if (module) {
                  details.moduleTitle = module.title.replace(/^Module\s+\d+:\s*/i, "").trim()
                  if (attempt.lessonIndex !== null && attempt.lessonIndex !== undefined) {
                    const lesson = module.lessons[attempt.lessonIndex]
                    if (lesson) {
                      details.lessonTitle = lesson.title
                    }
                  }
                }
              }
              setQuizDetails(details)
            }
          } catch (error) {
            console.error("Error fetching quiz details:", error)
          }
        }
      } catch (error) {
        console.error("Error fetching incomplete quiz:", error)
      }
    }
    fetchIncomplete()
  }, [user])

  if (!incompleteQuiz) return null

  const { courseId, quizType, moduleIndex, lessonIndex, courseTitle } = incompleteQuiz
  let url = `/quizzes/${courseId}`
  if (quizType === "lesson") url += `/modules/${moduleIndex}/lessons/${lessonIndex}/quiz`
  else if (quizType === "module") url += `/modules/${moduleIndex}/quiz`
  else url += `/quiz`

  const quizLabel = quizType === "lesson" 
    ? "Lesson Quiz" 
    : quizType === "module" 
    ? "Module Quiz" 
    : "Course Quiz"

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="max-w-full text-foreground hover:text-primary"
        onClick={() => setConfirmOpen(true)}
      >
        <Clock className="mr-2 h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">Resume Quiz</span>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resume Quiz</DialogTitle>
            <DialogDescription>
              Would you like to continue your active quiz?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-lg space-y-2 text-sm border border-border">
            <p className="font-bold text-foreground">{courseTitle}</p>
            <p className="text-muted-foreground capitalize">Type: {quizType}</p>
            {quizDetails?.moduleTitle && moduleIndex !== null && moduleIndex !== undefined && (
              <p className="text-muted-foreground">Module: {moduleIndex + 1}. {quizDetails.moduleTitle}</p>
            )}
            {quizDetails?.lessonTitle && lessonIndex !== null && lessonIndex !== undefined && (
              <p className="text-muted-foreground">Lesson: {lessonIndex + 1}. {quizDetails.lessonTitle}</p>
            )}
            {!quizDetails?.moduleTitle && moduleIndex !== null && moduleIndex !== undefined && (
              <p className="text-muted-foreground">Module: {moduleIndex + 1}</p>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              No
            </Button>
            <Button onClick={() => router.push(url)}>
              Yes, Resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function QuizzesPage() {
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [stats, setStats] = useState({
    averageAccuracy: 0,
    totalQuestionsAnswered: 0,
    perfectStreaks: 0,
  })
  const [loading, setLoading] = useState(true)
  const [courseHasQuizzes, setCourseHasQuizzes] = useState<Set<string>>(new Set())
  const [courseAccuracies, setCourseAccuracies] = useState<Map<string, number>>(new Map())
  const [perfectStreakHistoryOpen, setPerfectStreakHistoryOpen] = useState(false)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      try {
        const [fetchedCourses, fetchedStats] = await Promise.all([
          getUserCourses(user.uid),
          getUserQuizStats(user.uid),
        ])
        setCourses(fetchedCourses)
        setStats(fetchedStats)
        
        // Check which courses have completed quizzes and calculate average accuracy
        const hasQuizzesSet = new Set<string>()
        const accuraciesMap = new Map<string, number>()
        await Promise.all(
          fetchedCourses.map(async (course) => {
            try {
              const attempts = await getQuizAttempts(user.uid, course.id)
              if (attempts.length > 0) {
                hasQuizzesSet.add(course.id)
                // Calculate average accuracy for this course
                const avgAccuracy = await getCourseAverageAccuracy(user.uid, course.id)
                accuraciesMap.set(course.id, avgAccuracy)
              }
            } catch (error) {
              console.error(`Error checking quizzes for course ${course.id}:`, error)
            }
          })
        )
        setCourseHasQuizzes(hasQuizzesSet)
        setCourseAccuracies(accuraciesMap)
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchData()
    }
  }, [user])

  // Set chatbot context for quizzes page
  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Quiz Center",
      description: `Quiz center showing ${courses.length} courses available for quizzes. Stats: ${stats.averageAccuracy}% average accuracy, ${stats.totalQuestionsAnswered} questions answered, ${stats.perfectStreaks} perfect streaks. The user can ask about quiz performance, which quizzes to take, or get quiz tips.`,
    })

    return () => {
      setPageContext(null)
    }
  }, [setPageContext, courses.length, stats])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy > 80) return "text-green-500"
    if (accuracy > 50) return "text-yellow-500"
    return "text-red-500"
  }

  const getCourseInitials = (title: string) => {
    return title
      .split(" ")
      .map((word) => word[0])
      .join("")
      .substring(0, 2)
      .toUpperCase()
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/quizzes" title="Quizzes" />

      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Quiz Center</h2>
              </div>
              <ContinueQuizButton />
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${getAccuracyColor(stats.averageAccuracy)}`}>
                      {stats.averageAccuracy}%
                    </p>
                    <p className="text-sm text-muted-foreground">Average Accuracy</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Hash className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalQuestionsAnswered}</p>
                    <p className="text-sm text-muted-foreground">Questions Answered</p>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50"
                onClick={() => setPerfectStreakHistoryOpen(true)}
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Trophy className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.perfectStreaks}</p>
                    <p className="text-sm text-muted-foreground">Perfect Streaks</p>
                    <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Course Grid */}
            {courses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No courses yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center">
                    Start your learning journey by creating your first course
                  </p>
                  <Link href="/create-course">
                    <Button>Create Course</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((course, index) => {
                  const initials = getCourseInitials(course.title)
                  const color = colorGradients[index % colorGradients.length]
                  const hasQuizzes = courseHasQuizzes.has(course.id)
                  const avgAccuracy = courseAccuracies.get(course.id) || 0
                  
                  // Get badge based on average accuracy
                  const getBadge = (accuracy: number) => {
                    if (accuracy > 100) return { text: "Perfectionist", color: "text-yellow-500" }
                    if (accuracy > 90) return { text: "Grandmaster", color: "text-purple-500" }
                    if (accuracy > 80) return { text: "Expert", color: "text-blue-500" }
                    if (accuracy > 50) return { text: "Learner", color: "text-green-500" }
                    if (accuracy > 0) return { text: "Learner", color: "text-green-500" }
                    return { text: "Unranked", color: "text-muted-foreground" }
                  }
                  
                  const badge = getBadge(avgAccuracy)

                  return (
                    <div key={course.id} className="space-y-2">
                      <Link href={`/quizzes/${course.id}`}>
                        <Card className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50">
                          <CardContent className="p-6">
                            <div className="space-y-4">
                              {/* Header with Icon */}
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-lg font-bold text-white shadow-sm`}
                                  >
                                    {initials}
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                      {course.title}
                                    </h3>
                                    <p className={`text-sm font-medium ${badge.color}`}>
                                      {badge.text}
                                    </p>
                                    {avgAccuracy > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        Avg: {avgAccuracy}%
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                      {hasQuizzes && (
                        <Link href={`/quizzes/${course.id}/history`}>
                          <Button variant="outline" size="sm" className="w-full">
                            <FileQuestion className="h-4 w-4 mr-2" />
                            Review Past Quiz
                          </Button>
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {user && (
        <PerfectStreakHistoryModal
          open={perfectStreakHistoryOpen}
          onOpenChange={setPerfectStreakHistoryOpen}
          userId={user.uid}
        />
      )}
    </div>
  )
}