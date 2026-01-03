"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Clock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getCourseWithProgress, CourseWithProgress, getLessonSlideProgress } from "@/lib/course-utils"
import { getUserRating } from "@/lib/rating-utils"
import { RatingModal } from "@/components/rating-modal"
import { checkPublishRequirements } from "@/lib/publish-utils"
import { Upload } from "lucide-react"
import { useActivityTracking } from "@/hooks/use-activity-tracking"

interface LessonProgress {
  [key: string]: { currentSlide: number; completed: boolean; progress: number; totalSlides: number }
}

export default function CourseContentPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [hasRated, setHasRated] = useState(false)
  const [lessonProgresses, setLessonProgresses] = useState<LessonProgress>({})
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set())
  const [canPublish, setCanPublish] = useState(false)
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setPageContext } = useChatbotContext()
  const courseId = params.id as string

  // Track activity on course page
  useActivityTracking({
    userId: user?.uid || null,
    pageType: "course",
    courseId,
    enabled: !!user && !!course,
  })

  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }

    const fetchCourse = async () => {
      try {
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)

        if (courseWithProgress) {
          // If the course is found but progress record is missing, create it
          if (!courseWithProgress.userProgress) {
            const { ensureUserProgress } = await import("@/lib/course-utils")
            await ensureUserProgress(user.uid, courseId)
            
            // Re-fetch to get the new progress
            const updatedCourse = await getCourseWithProgress(courseId, user.uid)
            if (updatedCourse) {
              setCourse(updatedCourse)
              // Continue with the rest of the logic using the updated course
              processCourseData(updatedCourse)
            }
          } else {
            setCourse(courseWithProgress)
            processCourseData(courseWithProgress)
          }
        } else {
          router.push("/")
        }
      } catch (error) {
        console.error("Error fetching course:", error)
        router.push("/")
      } finally {
        setLoading(false)
      }
    }

    const processCourseData = async (courseData: CourseWithProgress) => {
      if (!user) return
      
      // Fetch slide progress for each lesson
      const progresses: LessonProgress = {}
      for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex++) {
        const module = courseData.modules[moduleIndex]
        for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
          const lesson = module.lessons[lessonIndex]
          const lessonKey = `${moduleIndex}-${lessonIndex}`
          
          // Check if lesson has slides (has been generated)
          const lessonInfo = lesson as any
          const totalSlides = lessonInfo.slides?.length || 0
          
          if (totalSlides > 0) {
            const slideProgress = await getLessonSlideProgress(
              user.uid,
              courseId,
              moduleIndex,
              lessonIndex,
              totalSlides
            )
            progresses[lessonKey] = {
              ...slideProgress,
              totalSlides,
            }
          } else {
            const isCompleted = courseData.userProgress?.completedLessons?.includes(lessonKey) || false
            progresses[lessonKey] = {
              currentSlide: 0,
              completed: isCompleted,
              progress: isCompleted ? 100 : 0,
              totalSlides: 0,
            }
          }
        }
      }
      setLessonProgresses(progresses)
      
      // Determine which modules to expand
      const expanded = new Set<number>()
      const lastModuleIndex = courseData.userProgress?.lastAccessedModule
      
      if (lastModuleIndex !== undefined && lastModuleIndex >= 0 && lastModuleIndex < courseData.modules.length) {
        expanded.add(lastModuleIndex)
      } else if (courseData.modules.length > 0) {
        expanded.add(0)
      }
      setExpandedModules(expanded)
      
      // Check if course is 100% complete
      const progress = courseData.userProgress?.progress || 0
      if (progress >= 100) {
        const userRating = await getUserRating(user.uid, courseId)
        if (!userRating) {
          setHasRated(false)
        } else {
          setHasRated(true)
        }
      }

      // Check publish requirements
      if (courseData.createdBy === user.uid && !courseData.isPublic) {
        try {
          const reqs = await checkPublishRequirements(user.uid, courseId)
          setCanPublish(reqs.canPublish)
        } catch (error) {
          console.error("Error checking publish requirements:", error)
          setCanPublish(false)
        }
      }
    }

    if (user) {
      fetchCourse()
    }
  }, [params.id, router, user])

  // Set chatbot context when course is loaded
  useEffect(() => {
    if (course) {
      setPageContext({
        type: "course",
        courseTitle: course.title,
        courseDescription: course.description,
        estimatedDuration: course.estimatedDuration,
        difficulty: course.difficulty,
        modules: course.modules.map((module) => ({
          title: module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title,
          description: module.description,
          duration: module.duration,
          lessonsCount: module.lessons.length,
          lessons: module.lessons.map((lesson) => ({
            title: lesson.title,
            content: lesson.content,
            duration: lesson.duration,
          })),
        })),
        progress: course.userProgress
          ? {
              percentage: course.userProgress.progress || 0,
              completedLessons: course.userProgress.completedLessons || [],
            }
          : undefined,
      })
    }

    // Clear context on unmount
    return () => {
      setPageContext(null)
    }
  }, [course, setPageContext])

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
        title={course.title}
        leftAction={
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* Header - Desktop only */}
        <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
          <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Content Area */}
        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <article className="space-y-8">
            {/* Course Header */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                  {course.title}
                </h1>
                <p className="text-lg text-muted-foreground">{course.description}</p>
              </div>

              {/* Course Meta */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{course.estimatedDuration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>{course.difficulty}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{course.modules.length} Modules</span>
                </div>
              </div>
            </div>

            {/* Modules List */}
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground">Course Modules</h2>
              <div className="grid gap-4 sm:grid-cols-2 items-start">
                {course.modules.map((module, moduleIndex) => {
                  // Strip "Module X:" prefix if it exists in the title
                  const cleanTitle = module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title
                  
                  return (
                  <Card key={moduleIndex} className="flex flex-col">
                    <CardHeader
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => {
                        setExpandedModules((prev) => {
                          const newSet = new Set(prev)
                          if (newSet.has(moduleIndex)) {
                            newSet.delete(moduleIndex)
                          } else {
                            newSet.add(moduleIndex)
                          }
                          return newSet
                        })
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shrink-0 mt-0.5">
                              {moduleIndex + 1}
                            </span>
                            <CardTitle className="text-lg line-clamp-2 flex-1 min-w-0">{cleanTitle}</CardTitle>
                          </div>
                          <CardDescription className="text-sm mt-1 line-clamp-2">
                            {module.description}
                          </CardDescription>
                        </div>
                        <div className="shrink-0">
                          {expandedModules.has(moduleIndex) ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{module.duration}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>{module.lessons.length} Lessons</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col">
                      <div className="rounded-lg bg-muted/50 p-3 mb-3">
                        <p className="text-xs text-foreground leading-relaxed line-clamp-3">{module.content}</p>
                      </div>

                      {/* Lessons List */}
                      {expandedModules.has(moduleIndex) && (
                        <div className="space-y-2">
                            {module.lessons.map((lesson, lessonIndex) => {
                            const lessonId = `${moduleIndex}-${lessonIndex}`
                            const isCompleted = course.userProgress?.completedLessons?.includes(lessonId) || false
                            const lessonProgress = lessonProgresses[lessonId]
                            const slideProgress = lessonProgress?.progress || 0
                            const currentSlide = lessonProgress?.currentSlide || 0
                            const totalSlides = lessonProgress?.totalSlides || 0
                            const hasSlides = totalSlides > 0

                            return (
                              <Link
                                key={lessonIndex}
                                href={`/courses/${course.id}/modules/${moduleIndex}/lessons/${lessonIndex}`}
                              >
                                <div className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 hover:bg-accent/50 hover:border-primary/50 transition-all cursor-pointer">
                                  <CheckCircle2
                                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                                      isCompleted ? "text-primary fill-primary" : "text-muted-foreground"
                                    }`}
                                  />
                                  <div className="flex-1 space-y-1.5 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <h4 className="font-medium text-sm text-foreground truncate">{lesson.title}</h4>
                                      <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {lesson.content}
                                    </p>
                                    {/* Progress Bar */}
                                    {hasSlides && (
                                      <div className="space-y-0.5">
                                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/50">
                                          <div
                                            className={`h-full transition-all ${
                                              isCompleted
                                                ? "bg-primary"
                                                : "bg-primary/60"
                                            }`}
                                            style={{ width: `${slideProgress}%` }}
                                          />
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <span className="text-xs">
                                            {isCompleted
                                              ? "Completed"
                                              : hasSlides
                                                ? `Slide ${currentSlide + 1} of ${totalSlides}`
                                                : "Not started"}
                                          </span>
                                          {hasSlides && !isCompleted && (
                                            <span className="text-xs">{slideProgress}%</span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            )
                          })}
                          </div>
                        )}
                    </CardContent>
                  </Card>
                  )
                })}
              </div>
            </div>
          </article>
        </div>


        {/* Rating Modal */}
        {showRatingModal && course && user && (
          <RatingModal
            courseId={course.id}
            userId={user.uid}
            courseTitle={course.title}
            onClose={() => setShowRatingModal(false)}
            onRated={async () => {
              setShowRatingModal(false)
              setHasRated(true)
              // Refresh course data to show updated public status
              if (user) {
                try {
                  const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
                  if (courseWithProgress) {
                    setCourse(courseWithProgress)
                  }
                } catch (error) {
                  console.error("Error fetching course:", error)
                }
              }
            }}
          />
        )}
      </main>
    </div>
  )
}
