"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Clock, CheckCircle, Play } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
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

function ContinueLearningButton({ courses }: { courses: CourseWithProgress[] }) {
  const { user } = useAuth()
  const router = useRouter()
  const [continueUrl, setContinueUrl] = useState<string | null>(null)
  const [details, setDetails] = useState<{ course: string; module: string; lesson: string; slide?: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const findContinueUrl = async () => {
      if (!user || courses.length === 0) return

      // Sort courses by lastAccessed (most recent first)
      const sortedCourses = [...courses].sort((a, b) => {
        const aTime = a.userProgress?.lastAccessed?.toMillis() || 0
        const bTime = b.userProgress?.lastAccessed?.toMillis() || 0
        return bTime - aTime
      })

      const mostRecent = sortedCourses[0]
      if (!mostRecent.userProgress) {
        setContinueUrl(`/courses/${mostRecent.id}/modules/0/lessons/0`)
        setDetails({
          course: mostRecent.title,
          module: "Module 1",
          lesson: "Lesson 1"
        })
        return
      }

      const moduleIndex = mostRecent.userProgress.lastAccessedModule ?? 0
      const lessonIndex = mostRecent.userProgress.lastAccessedLesson ?? 0

      // Check if lesson has slides and get current slide
      const module = mostRecent.modules[moduleIndex]
      if (!module) {
        setContinueUrl(`/courses/${mostRecent.id}/modules/0/lessons/0`)
        setDetails({ course: mostRecent.title, module: "Module 1", lesson: "Lesson 1" })
        return
      }

      const lesson = module.lessons[lessonIndex]
      if (!lesson) {
        setContinueUrl(`/courses/${mostRecent.id}/modules/0/lessons/0`)
        setDetails({ course: mostRecent.title, module: "Module 1", lesson: "Lesson 1" })
        return
      }

      // Get current slide from progress
      const lessonData = lesson as any
      const totalSlides = lessonData.slides?.length || 0
      let currentSlide = 0
      
      if (totalSlides > 0) {
        try {
          const { getLessonSlideProgress } = await import("@/lib/course-utils")
          const slideProgress = await getLessonSlideProgress(
            user.uid,
            mostRecent.id,
            moduleIndex,
            lessonIndex,
            totalSlides
          )
          currentSlide = slideProgress.currentSlide
        } catch (error) {
          console.error("Error fetching slide progress:", error)
        }
      }

      // Clean module title
      const cleanModuleTitle = module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title

      setDetails({
        course: mostRecent.title,
        module: `Module ${moduleIndex + 1}: ${cleanModuleTitle}`,
        lesson: `Lesson ${lessonIndex + 1}: ${lesson.title}`,
        slide: totalSlides > 0 ? currentSlide + 1 : undefined
      })

      setContinueUrl(`/courses/${mostRecent.id}/modules/${moduleIndex}/lessons/${lessonIndex}`)
    }

    findContinueUrl()
  }, [user, courses])

  if (!continueUrl) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Play className="mr-2 h-4 w-4" />
        Resume Course
      </Button>
    )
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="max-w-full text-foreground hover:text-primary"
        onClick={() => setConfirmOpen(true)}
      >
        <Play className="mr-2 h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">Resume Course</span>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resume Course</DialogTitle>
            <DialogDescription>
              Would you like to pick up where you left off?
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm border border-border">
              <p className="font-bold text-foreground">{details.course}</p>
              <div className="space-y-1 text-muted-foreground">
                <p className="truncate">{details.module}</p>
                <p className="truncate">{details.lesson}</p>
                {details.slide && <p>Slide {details.slide}</p>}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              No
            </Button>
            <Button onClick={() => router.push(continueUrl)}>
              Yes, Resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function LibraryPage() {
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeCourses: 0,
    completedCourses: 0,
    totalProgress: 0,
  })
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return

      try {
        const fetchedCourses = await getUserCourses(user.uid)
        setCourses(fetchedCourses)

        // Calculate stats
        const active = fetchedCourses.filter((c) => (c.userProgress?.progress || 0) < 100).length
        const completed = fetchedCourses.filter((c) => (c.userProgress?.progress || 0) >= 100).length
        const totalProgress =
          fetchedCourses.length > 0
            ? fetchedCourses.reduce((sum, c) => sum + (c.userProgress?.progress || 0), 0) / fetchedCourses.length
            : 0

        setStats({
          activeCourses: active,
          completedCourses: completed,
          totalProgress: Math.round(totalProgress),
        })
      } catch (error) {
        console.error("Error fetching courses:", error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchCourses()
    }
  }, [user])

  // Set chatbot context for library page
  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Library",
      description: `The user's course library with ${courses.length} courses. Stats: ${stats.activeCourses} active courses, ${stats.completedCourses} completed, ${stats.totalProgress}% average progress. The user can ask about their courses, learning progress, or which courses to focus on.`,
    })

  // Split courses into My Courses and Added Courses
  const myCourses = courses.filter(c => c.userProgress?.isOwnCourse === true)
  const addedCourses = courses.filter(c => c.userProgress?.isOwnCourse === false)

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

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/library" title="My Library" />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">My Learning Paths</h2>
              {courses.length > 0 && (
                <ContinueLearningButton courses={courses} />
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.activeCourses}</p>
                    <p className="text-sm text-muted-foreground">Active Courses</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalProgress}%</p>
                    <p className="text-sm text-muted-foreground">Average Progress</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.completedCourses}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Course Grid */}
            {courses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No courses yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center">
                    Start your learning journey by creating your first course
                  </p>
                  <Link href="/create-course">
                    <Button>
                      <Play className="mr-2 h-4 w-4" />
                      Create Course
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {courses.map((course, index) => {
                  const initials = course.title
                    .split(" ")
                    .map((word) => word[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase()
                  const color = colorGradients[index % colorGradients.length]
                  const isNew =
                    course.userProgress?.createdAt &&
                    course.userProgress.createdAt.toDate &&
                    (Date.now() - course.userProgress.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24) < 7

                  return (
                    <Link key={course.id} href={`/courses/${course.id}`}>
                      <Card className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50">
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            {/* Header with Icon and Badge */}
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
                                  <p className="text-sm text-muted-foreground">{course.userProgress?.progress || 0}% Complete</p>
                                </div>
                              </div>
                              {isNew && <Badge className="bg-primary text-primary-foreground">New</Badge>}
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-2">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
                                <div
                                  className="h-full bg-primary transition-all duration-500"
                                  style={{ width: `${course.userProgress?.progress || 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
