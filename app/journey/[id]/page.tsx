"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { useActivityTracking } from "@/hooks/use-activity-tracking"
import { CourseRoadmap } from "@/components/course-roadmap"


export default function CourseContentPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setPageContext } = useChatContext()
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
      // No need to process lesson progress for roadmap view
    }

    if (user) {
      fetchCourse()
    }
  }, [params.id, router, user])

  // Save and restore scroll position
  useEffect(() => {
    if (loading || !course) return

    const scrollKey = `scroll-pos-${courseId}`
    
    // Restore scroll position on mount
    const savedScroll = sessionStorage.getItem(scrollKey)
    if (savedScroll) {
      const scrollY = parseInt(savedScroll, 10)
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY)
      })
    }

    // Throttle scroll save
    let scrollTimeout: NodeJS.Timeout | null = null
    const handleScroll = () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        sessionStorage.setItem(scrollKey, window.scrollY.toString())
        scrollTimeout = null
      }, 100) // Save every 100ms
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [loading, course, courseId])

  // Set chatbot context with real-time course data
  useEffect(() => {
    if (!loading && course && user) {
      // Calculate completed modules
      const completedModules = course.modules.filter((module, moduleIndex) => {
        return module.lessons.every((lesson, lessonIndex) => {
          const lessonId = `${moduleIndex}-${lessonIndex}`
          return course.userProgress?.completedLessons?.includes(lessonId)
        })
      }).length

      setPageContext({
        title: `Course: ${course.title}`,
        description: `Viewing course "${course.title}". ${course.description || ""} The user can see modules, lessons, and their progress.`,
        data: {
          courseId: course.id,
          courseTitle: course.title,
          courseDescription: course.description,
          estimatedDuration: course.estimatedDuration,
          difficulty: course.difficulty,
          xpMultiplier: course.xpMultiplier,
          // Full module structure with all lessons
          modules: course.modules.map((module, moduleIndex) => {
            const isModuleCompleted = module.lessons.every((lesson, lessonIndex) => {
              const lessonId = `${moduleIndex}-${lessonIndex}`
              return course.userProgress?.completedLessons?.includes(lessonId)
            })
            return {
              moduleIndex,
              title: module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title,
              description: module.description,
              duration: module.duration,
              lessonsCount: module.lessons.length,
              isCompleted: isModuleCompleted,
              moduleQuizScore: course.userProgress?.moduleQuizScores?.[moduleIndex.toString()],
              // All lessons in this module
              lessons: module.lessons.map((lesson, lessonIndex) => {
                const lessonId = `${moduleIndex}-${lessonIndex}`
                return {
                  lessonIndex,
                  title: lesson.title,
                  content: lesson.content || "",
                  duration: lesson.duration,
                  isCompleted: course.userProgress?.completedLessons?.includes(lessonId) || false,
                }
              }),
            }
          }),
          progress: {
            percentage: course.userProgress?.progress || 0,
            completedLessons: course.userProgress?.completedLessons || [],
            completedModules,
            totalModules: course.modules.length,
            lastAccessedModule: course.userProgress?.lastAccessedModule,
            lastAccessedLesson: course.userProgress?.lastAccessedLesson,
          },
          quizScores: {
            moduleQuizScores: course.userProgress?.moduleQuizScores || {},
            finalQuizScore: course.userProgress?.finalQuizScore,
          },
        },
      })
    }
  }, [course, loading, user, setPageContext])

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
          <Link href="/journey">
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
            <Link href="/journey">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Journey</span>
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

            {/* Roadmap */}
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground">Learning Journey</h2>
              <div className="w-full">
                <CourseRoadmap course={course} />
              </div>
            </div>
          </article>
        </div>
      </main>
    </div>
  )
}

