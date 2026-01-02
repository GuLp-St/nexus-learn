"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { useXP } from "@/components/xp-context-provider"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore"
import { CourseData } from "@/lib/gemini"
import { generateLessonContent, LessonContent, LessonSlide } from "@/lib/gemini"
import { getCourseWithProgress, updateUserProgress, CourseWithProgress, ensureUserProgress } from "@/lib/course-utils"
import { useActivityTracking } from "@/hooks/use-activity-tracking"

export default function LessonPage() {
  const [course, setCourse] = useState<(CourseData & { id: string }) | null>(null)
  const [lessonContent, setLessonContent] = useState<LessonContent | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setPageContext } = useChatbotContext()
  const { showXPAward } = useXP()

  const courseId = params.id as string
  const moduleIndex = parseInt(params.moduleIndex as string)
  const lessonIndex = parseInt(params.lessonIndex as string)

  // Track activity on lesson page
  useActivityTracking({
    userId: user?.uid || null,
    pageType: "lesson",
    courseId,
    moduleIndex,
    lessonIndex,
    enabled: !!user && !!course && !!lessonContent,
  })

  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }

    // Update last accessed module and lesson
    const updateLastAccessed = async () => {
      if (user) {
        const progressRef = doc(db, "userCourseProgress", `${user.uid}-${courseId}`)
        await updateDoc(progressRef, {
          lastAccessedModule: moduleIndex,
          lastAccessedLesson: lessonIndex,
          lastAccessed: serverTimestamp(),
        })
      }
    }
    updateLastAccessed()

    const fetchCourseAndLesson = async () => {
      try {
        // Fetch course with progress
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
        if (!courseWithProgress) {
          router.push("/")
          return
        }

        const courseData = courseWithProgress
        setCourse(courseData)

        const module = courseData.modules[moduleIndex]
        const lesson = module?.lessons[lessonIndex]

        if (!module || !lesson) {
          router.push(`/courses/${courseId}`)
          return
        }

        // Check if lesson slides are already generated (stored in course document)
        const lessonData = (lesson as any)
        let savedSlideIndex = 0

        // Check for saved slide progress (even if completed, keep the last slide position for revisiting)
        const progressLessonId = `${moduleIndex}-${lessonIndex}`
        const progressDocRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
        const progressDoc = await getDoc(progressDocRef)
        if (progressDoc.exists()) {
          // Always use the saved slide index, even if completed (allows revisiting)
          savedSlideIndex = progressDoc.data().currentSlide || 0
        }

        // Check if slides already exist in course document
        if (lessonData.slides && Array.isArray(lessonData.slides) && lessonData.slides.length > 0) {
          const slides = lessonData.slides as LessonSlide[]
          const validatedSlideIndex = Math.min(savedSlideIndex, slides.length - 1)
          setLessonContent({ slides })
          setCurrentSlide(Math.max(0, validatedSlideIndex))
          setLoading(false)
          return
        }

        // Generate lesson content if not exists
        setGenerating(true)
        const generatedContent = await generateLessonContent(
          courseData.title,
          module.title,
          lesson.title,
          lesson.content
        )

        // Save generated slides to course document
        const courseRef = doc(db, "courses", courseId)
        const courseDoc = await getDoc(courseRef)
        const courseDataForUpdate = courseDoc.data()
        
        // Deep clone modules array
        const updatedModules = JSON.parse(JSON.stringify(courseDataForUpdate?.modules || []))
        if (updatedModules[moduleIndex] && updatedModules[moduleIndex].lessons[lessonIndex]) {
          updatedModules[moduleIndex].lessons[lessonIndex].slides = generatedContent.slides
          
          await updateDoc(courseRef, {
            modules: updatedModules,
          })
        }

        // Validate saved slide index is within bounds
        const validatedSlideIndex = Math.min(savedSlideIndex, generatedContent.slides.length - 1)
        setLessonContent(generatedContent)
        setCurrentSlide(Math.max(0, validatedSlideIndex))
      } catch (err: any) {
        console.error("Error loading lesson:", err)
        setError(err.message || "Failed to load lesson. Please try again.")
      } finally {
        setLoading(false)
        setGenerating(false)
      }
    }

    fetchCourseAndLesson()
  }, [courseId, moduleIndex, lessonIndex, router, user])

  // Save slide progress to Firestore
  const saveSlideProgress = useCallback(
    async (slideIndex: number) => {
      if (!user || !lessonContent) return

      try {
        const progressLessonId = `${moduleIndex}-${lessonIndex}`
        const progressDocRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
        await setDoc(
          progressDocRef,
          {
            userId: user.uid,
            courseId,
            moduleIndex,
            lessonIndex,
            currentSlide: slideIndex,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      } catch (error) {
        console.error("Error saving slide progress:", error)
      }
    },
    [user, lessonContent, courseId, moduleIndex, lessonIndex]
  )

  const handleNextSlide = () => {
    if (lessonContent && currentSlide < lessonContent.slides.length - 1) {
      const newSlide = currentSlide + 1
      setCurrentSlide(newSlide)
      saveSlideProgress(newSlide)
    }
  }

  const handlePreviousSlide = () => {
    if (currentSlide > 0) {
      const newSlide = currentSlide - 1
      setCurrentSlide(newSlide)
      saveSlideProgress(newSlide)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentSlide > 0) {
        const newSlide = currentSlide - 1
        setCurrentSlide(newSlide)
        saveSlideProgress(newSlide)
      } else if (e.key === "ArrowRight" && lessonContent && currentSlide < lessonContent.slides.length - 1) {
        const newSlide = currentSlide + 1
        setCurrentSlide(newSlide)
        saveSlideProgress(newSlide)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [currentSlide, lessonContent, saveSlideProgress])

  // Set chatbot context when lesson data is available
  useEffect(() => {
    if (course && lessonContent && lessonContent.slides.length > 0) {
      const module = course.modules[moduleIndex]
      const lesson = module?.lessons[lessonIndex]
      const slide = lessonContent.slides[currentSlide]

      if (module && lesson && slide) {
        const slideTitle = typeof slide.title === "string" ? slide.title : JSON.stringify(slide.title)
        const slideContent = typeof slide.content === "string" ? slide.content : typeof slide.content === "object" ? JSON.stringify(slide.content, null, 2) : String(slide.content)

        setPageContext({
          type: "lesson",
          courseTitle: course.title,
          courseDescription: course.description,
          moduleTitle: module.title,
          moduleIndex,
          lessonTitle: lesson.title,
          lessonIndex,
          currentSlide: {
            index: currentSlide,
            totalSlides: lessonContent.slides.length,
            title: slideTitle,
            content: slideContent,
          },
        })
      }
    }

    // Clear context on unmount
    return () => {
      setPageContext(null)
    }
  }, [course, lessonContent, currentSlide, moduleIndex, lessonIndex, setPageContext])

  const handleCompleteLesson = async () => {
    if (!course || !user) return

    try {
      const lessonId = `${moduleIndex}-${lessonIndex}`

      // Get current user progress
      const progressRef = doc(db, "userCourseProgress", `${user.uid}-${courseId}`)
      const progressDoc = await getDoc(progressRef)
      const currentProgress = progressDoc.data()
      const completedLessons = currentProgress?.completedLessons || []

      // Mark lesson as completed if not already completed
      if (!completedLessons.includes(lessonId)) {
        const updatedCompletedLessons = [...completedLessons, lessonId]

        // Record lesson completion
        const { recordLessonCompletion } = await import("@/lib/completion-utils")
        await recordLessonCompletion(user.uid, courseId, moduleIndex, lessonIndex).catch((error) => {
          console.error("Error recording lesson completion:", error)
        })

        // Calculate progress based on completed lessons
        const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0)
        const progress = Math.round((updatedCompletedLessons.length / totalLessons) * 100)

        const result = await updateUserProgress(user.uid, courseId, {
          completedLessons: updatedCompletedLessons,
          progress,
        })

        if (result) {
          showXPAward(result)
        }

        // Check if module is now complete and award module completion XP
        const module = course.modules[moduleIndex]
        if (module) {
          const moduleLessons = module.lessons
          const allModuleLessonsCompleted = moduleLessons.every((_, idx) => {
            const moduleLessonId = `${moduleIndex}-${idx}`
            return updatedCompletedLessons.includes(moduleLessonId)
          })

          if (allModuleLessonsCompleted) {
            // Record module completion
            const { recordModuleCompletion } = await import("@/lib/completion-utils")
            await recordModuleCompletion(user.uid, courseId, moduleIndex).catch((error) => {
              console.error("Error recording module completion:", error)
            })
            
            const { awardModuleCompletionXP } = await import("@/lib/xp-utils")
            const result = await awardModuleCompletionXP(user.uid, courseId, moduleIndex).catch((error) => {
              console.error("Error awarding module completion XP:", error)
              return null
            })
            if (result) {
              showXPAward(result)
            }
          }
        }
      }

      // Mark lesson as completed but keep the current slide position for revisiting
      const progressLessonId = `${moduleIndex}-${lessonIndex}`
      const slideProgressRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
      await setDoc(slideProgressRef, {
        currentSlide: currentSlide, // Keep current slide position even when completed
        completed: true,
        completedAt: serverTimestamp(),
      }, { merge: true })

      // Check badges after lesson completion
      const { checkAndUpdateBadges } = await import("@/lib/badge-utils")
      await checkAndUpdateBadges(user.uid).catch((error) => {
        console.error("Error checking badges:", error)
        // Don't block navigation on badge check failure
      })

      // Navigate back to course page
      router.push(`/courses/${courseId}`)
    } catch (error) {
      console.error("Error completing lesson:", error)
    }
  }

  if (loading || generating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">
            {generating ? "Generating lesson content..." : "Loading lesson..."}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <Link href={`/courses/${courseId}`}>
              <Button>Back to Course</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!course || !lessonContent || lessonContent.slides.length === 0) {
    return null
  }

  const module = course.modules[moduleIndex]
  const lesson = module?.lessons[lessonIndex]
  const slide = lessonContent.slides[currentSlide]
  const isLastSlide = currentSlide === lessonContent.slides.length - 1
  const isFirstSlide = currentSlide === 0

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        title={lesson?.title}
        leftAction={
          <Link href={`/courses/${courseId}`}>
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
            <div className="flex items-center justify-between">
              <Link href={`/courses/${courseId}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Course</span>
                </Button>
              </Link>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{lesson?.duration}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Lesson Content */}
        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">{lesson?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Module {moduleIndex + 1}: {module?.title ? module.title.replace(/^Module\s+\d+:\s*/i, "").trim() : ""}
            </p>
          </div>

          {/* Slide Counter */}
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Slide {currentSlide + 1} of {lessonContent.slides.length}
            </span>
            <div className="flex gap-1">
              {lessonContent.slides.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    index <= currentSlide ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Slide Content */}
          <Card className="mb-6 min-h-[400px]">
            <CardContent className="p-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-foreground">
                  {typeof slide.title === "string" ? slide.title : JSON.stringify(slide.title)}
                </h2>
                <div className="prose prose-lg max-w-none text-foreground">
                  <div className="leading-relaxed whitespace-pre-wrap">
                    {typeof slide.content === "string"
                      ? slide.content
                      : typeof slide.content === "object"
                        ? JSON.stringify(slide.content, null, 2)
                        : String(slide.content)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePreviousSlide}
              disabled={isFirstSlide}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            {isLastSlide ? (
              <Button onClick={handleCompleteLesson} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Complete Lesson
              </Button>
            ) : (
              <Button onClick={handleNextSlide} className="gap-2">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

