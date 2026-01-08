"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, Clock, Sparkles, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { useXP } from "@/components/xp-context-provider"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore"
import { CourseData, LessonStream, LessonStreamBlock, TextBlock, generateLessonStream } from "@/lib/gemini"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { getCourseWithProgress, updateUserProgress, CourseWithProgress, ensureUserProgress, getLessonStreamProgress } from "@/lib/course-utils"
import { useActivityTracking } from "@/hooks/use-activity-tracking"
import {
  SwipeInteractionComponent,
  ReorderInteractionComponent,
  FillBlankInteractionComponent,
  BugHunterInteractionComponent,
  MatchingInteractionComponent,
  ChatSimInteractionComponent,
} from "@/components/lesson-interactions"

export default function LessonPage() {
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [lessonStream, setLessonStream] = useState<LessonStream | null>(null)
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [interactionResults, setInteractionResults] = useState<{ [index: number]: boolean }>({})
  const [completedInteractions, setCompletedInteractions] = useState<{ [index: number]: any }>({})
  const [viewMode, setViewMode] = useState<"interactive" | "review">("interactive")
  const [resetLesson, setResetLesson] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  const [showCompletion, setShowCompletion] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setPageContext } = useChatContext()
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
    enabled: !!user && !!course && !!lessonStream,
  })

  useEffect(() => {
    if (!user) {
      router.push("/auth")
      return
    }

    // Update last accessed module and lesson
    const updateLastAccessed = async () => {
      if (user) {
        await ensureUserProgress(user.uid, courseId)
        
        const progressRef = doc(db, "userCourseProgress", `${user.uid}-${courseId}`)
        await updateDoc(progressRef, {
          lastAccessedModule: moduleIndex,
          lastAccessedLesson: lessonIndex,
          lastAccessedBlockIndex: currentBlockIndex,
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

        // Check if lesson stream already exists (stored in course document)
        const lessonData = (lesson as any)
        let savedBlockIndex = 0

        // Detect reset flag from URL (e.g. ?reset=true)
        let resetRequested = false
        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search)
          resetRequested = searchParams.get("reset") === "true"
        }

        // Check for saved stream progress
        const progressLessonId = `${moduleIndex}-${lessonIndex}`
        let streamProgress = await getLessonStreamProgress(
          user.uid,
          courseId,
          moduleIndex,
          lessonIndex,
          100 // placeholder, will update after loading
        )

        // If reset is requested (and not already processed), clear server-side progress once
        if (resetRequested && !resetLesson) {
          const progressDocRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
          await setDoc(
            progressDocRef,
            {
              userId: user.uid,
              courseId,
              moduleIndex,
              lessonIndex,
              currentBlockIndex: 0,
              completed: false,
              completedAt: null,
              completedInteractions: {},
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
          streamProgress = {
            currentBlockIndex: 0,
            completed: false,
            progress: 0,
            completedInteractions: {},
          }
          setResetLesson(true)
        }

        savedBlockIndex = streamProgress.currentBlockIndex
        setCompletedInteractions(streamProgress.completedInteractions || {})

        // Check if stream already exists in course document
        if (lessonData.stream && lessonData.stream.blocks && Array.isArray(lessonData.stream.blocks) && lessonData.stream.blocks.length > 0) {
          const stream = lessonData.stream as LessonStream
          const validatedBlockIndex = Math.min(savedBlockIndex, stream.blocks.length - 1)
          setLessonStream(stream)
          setCurrentBlockIndex(Math.max(0, validatedBlockIndex))
          setLoading(false)
          return
        }

        // Generate lesson stream if not exists
        setGenerating(true)
        const generatedStream = await generateLessonStream(
          lesson.title,
          courseData.title,
          module.title
        )

        // Save facts to module's accumulatedContext
        const courseRef = doc(db, "courses", courseId)
        const courseDoc = await getDoc(courseRef)
        const courseDataForUpdate = courseDoc.data()
        
        const updatedModules = JSON.parse(JSON.stringify(courseDataForUpdate?.modules || []))
        if (updatedModules[moduleIndex]) {
          // Initialize accumulatedContext if not exists
          if (!updatedModules[moduleIndex].accumulatedContext) {
            updatedModules[moduleIndex].accumulatedContext = []
          }
          
          // Add facts with source information
          const lessonId = `${courseId}-${moduleIndex}-${lessonIndex}`
          generatedStream.facts.forEach((fact) => {
            const factEntry = {
              id: fact.id,
              text: fact.text,
              sourceLessonId: lessonId,
              sourceLessonTitle: lesson.title,
            }
            // Check if fact already exists (avoid duplicates)
            const exists = updatedModules[moduleIndex].accumulatedContext.some(
              (f: any) => f.id === fact.id
            )
            if (!exists) {
              updatedModules[moduleIndex].accumulatedContext.push(factEntry)
            }
          })
          
          // Save stream to lesson
          updatedModules[moduleIndex].lessons[lessonIndex].stream = generatedStream
          
          await updateDoc(courseRef, {
            modules: updatedModules,
          })
        }

        // Validate saved block index
        const validatedBlockIndex = Math.min(savedBlockIndex, generatedStream.blocks.length - 1)
        setLessonStream(generatedStream)
        setCurrentBlockIndex(Math.max(0, validatedBlockIndex))
      } catch (err: any) {
        console.error("Error loading lesson:", err)
        setError(err.message || "Failed to load lesson. Please try again.")
      } finally {
        setLoading(false)
        setGenerating(false)
      }
    }

    fetchCourseAndLesson()
      }, [courseId, moduleIndex, lessonIndex, router, user, currentBlockIndex])

  // Always keep the newest block in view when content grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [currentBlockIndex, interactionResults, completedInteractions, showCompletion])

  // Save block progress to Firestore
  const saveBlockProgress = useCallback(
    async (blockIndex: number, completed: boolean = false) => {
      if (!user || !lessonStream) return

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
            currentBlockIndex: blockIndex,
            completed,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )

        // Update course progress
        const progressRef = doc(db, "userCourseProgress", `${user.uid}-${courseId}`)
        await updateDoc(progressRef, {
          lastAccessedBlockIndex: blockIndex,
          lastAccessed: serverTimestamp(),
        })
      } catch (error) {
        console.error("Error saving block progress:", error)
      }
    },
    [user, lessonStream, courseId, moduleIndex, lessonIndex]
  )

  async function handleCompleteLesson() {
    if (!course || !user || !lessonStream) return

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

        // Calculate progress
        const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0)
        const progress = Math.round((updatedCompletedLessons.length / totalLessons) * 100)

        // Don't award XP automatically - user must claim it from roadmap
        const result = await updateUserProgress(user.uid, courseId, {
          completedLessons: updatedCompletedLessons,
          progress,
        })

        // Check if module is now complete
        const module = course.modules[moduleIndex]
        if (module) {
          const moduleLessons = module.lessons
          const allModuleLessonsCompleted = moduleLessons.every((_, idx) => {
            const moduleLessonId = `${moduleIndex}-${idx}`
            return updatedCompletedLessons.includes(moduleLessonId)
          })

          if (allModuleLessonsCompleted) {
            const { recordModuleCompletion } = await import("@/lib/completion-utils")
            await recordModuleCompletion(user.uid, courseId, moduleIndex).catch((error) => {
              console.error("Error recording module completion:", error)
            })
            
            // Don't award XP automatically - user must claim it from roadmap
          }
        }
      }

      // Mark lesson as completed
      const progressLessonId = `${moduleIndex}-${lessonIndex}`
      const streamProgressRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
      await setDoc(streamProgressRef, {
        currentBlockIndex: currentBlockIndex,
        completed: true,
        completedAt: serverTimestamp(),
      }, { merge: true })

      // Check badges
      const { checkAndUpdateBadges } = await import("@/lib/badge-utils")
      await checkAndUpdateBadges(user.uid).catch((error) => {
        console.error("Error checking badges:", error)
      })

      setShowCompletion(true)
    } catch (error) {
      console.error("Error completing lesson:", error)
    }
  }

  const handleInteractionComplete = (blockIndex: number, correct: boolean, interactionData?: any) => {
    setInteractionResults(prev => ({ ...prev, [blockIndex]: correct }))
    
    // Only persist completed interaction data when the answer is correct
    // so that users can retry when they're wrong.
    if (correct && lessonStream && lessonStream.blocks[blockIndex]) {
      const block = lessonStream.blocks[blockIndex]
      if (block.type !== "text") {
        setCompletedInteractions(prev => {
          const interactionPayload: any = {
            ...block,
            result: correct,
            completedAt: Date.now(),
          }
          // Only store userData if it's defined to avoid Firestore undefined errors
          if (interactionData !== undefined) {
            interactionPayload.userData = interactionData
          }

          const updated = {
            ...prev,
            [blockIndex]: interactionPayload,
          }

          // Persist to lesson progress document so review works after refresh
          if (user) {
            const progressLessonId = `${moduleIndex}-${lessonIndex}`
            const progressDocRef = doc(db, "userLessonProgress", `${user.uid}-${courseId}-${progressLessonId}`)
            setDoc(
              progressDocRef,
              {
                completedInteractions: updated,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch((error) => {
              console.error("Error saving completed interactions:", error)
            })
          }

          return updated
        })
      }
    }
    
    if (!correct || !lessonStream) return

    const isLastBlockInStream = blockIndex === lessonStream.blocks.length - 1

    // Auto-advance after a short delay if correct
    if (!isLastBlockInStream) {
      setTimeout(() => {
        const nextIndex = blockIndex + 1
        setCurrentBlockIndex(nextIndex)
        saveBlockProgress(nextIndex)
      }, 1500)
    } else {
      // If this was the final block in the lesson, finish the lesson after a short delay
      setTimeout(() => {
        handleCompleteLesson()
      }, 1200)
    }
  }

  const handleContinue = () => {
    if (lessonStream && currentBlockIndex < lessonStream.blocks.length - 1) {
      const nextIndex = currentBlockIndex + 1
      setCurrentBlockIndex(nextIndex)
      saveBlockProgress(nextIndex)
    } else if (lessonStream && currentBlockIndex === lessonStream.blocks.length - 1) {
      handleCompleteLesson()
    }
  }

  // Set chatbot context with real-time lesson data
  useEffect(() => {
    if (!loading && !generating && course && lessonStream && user) {
      const module = course.modules[moduleIndex]
      const lesson = module?.lessons[lessonIndex]
      const currentBlock = lessonStream.blocks[currentBlockIndex]

      if (module && lesson && currentBlock) {
        // Calculate course progress
        const completedModules = course.modules.filter((m, mIdx) => {
          return m.lessons.every((l, lIdx) => {
            const lessonId = `${mIdx}-${lIdx}`
            return course.userProgress?.completedLessons?.includes(lessonId)
          })
        }).length

        // Calculate module progress
        const moduleCompletedLessons = module.lessons.filter((l, lIdx) => {
          const lessonId = `${moduleIndex}-${lIdx}`
          return course.userProgress?.completedLessons?.includes(lessonId)
        }).length

        setPageContext({
          title: `Studying: ${course.title} - ${module.title} - ${lesson.title}`,
          description: `The user is currently reading lesson "${lesson.title}" in module "${module.title}" of course "${course.title}".`,
          data: {
            courseId: course.id,
            courseTitle: course.title,
            courseDescription: course.description,
            courseDifficulty: course.difficulty,
            moduleIndex,
            moduleTitle: module.title,
            moduleDescription: module.description,
            moduleProgress: {
              completedLessons: moduleCompletedLessons,
              totalLessons: module.lessons.length,
              moduleQuizScore: course.userProgress?.moduleQuizScores?.[moduleIndex.toString()],
            },
            lessonIndex,
            lessonTitle: lesson.title,
            lessonContent: lesson.content || "",
            lessonDuration: lesson.duration,
            currentBlockIndex,
            currentBlock: (() => {
              const base = {
                index: currentBlockIndex,
                totalBlocks: lessonStream.blocks.length,
                type: currentBlock.type === "text" ? "text" : "interaction",
              }
              
              if (currentBlock.type === "text") {
                return {
                  ...base,
                  content: (currentBlock as TextBlock).content,
                }
              } else {
                // Interaction block - include all interaction data
                const interaction = currentBlock as any
                const interactionData: any = {
                  ...base,
                  interactionType: interaction.type,
                }
                
                // Common fields for most interactions
                if (interaction.question) interactionData.question = interaction.question
                if (interaction.explanation) interactionData.explanation = interaction.explanation
                
                // Type-specific fields
                switch (interaction.type) {
                  case "swipe":
                    interactionData.options = interaction.options?.map((opt: any) => ({
                      label: opt.label,
                      isCorrect: opt.isCorrect,
                    }))
                    break
                  case "reorder":
                    interactionData.items = interaction.items
                    interactionData.correctOrder = interaction.correctOrder
                    break
                  case "fill_blank":
                    interactionData.content = interaction.content
                    interactionData.options = interaction.options
                    interactionData.correctAnswer = interaction.correctAnswer
                    break
                  case "bug_hunter":
                    interactionData.lines = interaction.lines
                    interactionData.correctLineId = interaction.correctLineId
                    break
                  case "matching":
                    interactionData.pairs = interaction.pairs
                    break
                  case "chat_sim":
                    interactionData.scenario = interaction.scenario
                    interactionData.messages = interaction.messages
                    break
                }
                
                return interactionData
              }
            })(),
            lessonBlocks: lessonStream.blocks.map((block, idx) => {
              const base = {
                index: idx,
                type: block.type === "text" ? "text" : "interaction",
                isCompleted: idx < currentBlockIndex,
              }
              
              if (block.type === "text") {
                return {
                  ...base,
                  content: (block as TextBlock).content,
                }
              } else {
                // Include interaction data for all blocks
                const interaction = block as any
                const interactionData: any = {
                  ...base,
                  interactionType: interaction.type,
                }
                
                if (interaction.question) interactionData.question = interaction.question
                if (interaction.explanation) interactionData.explanation = interaction.explanation
                
                switch (interaction.type) {
                  case "swipe":
                    interactionData.options = interaction.options
                    break
                  case "reorder":
                    interactionData.items = interaction.items
                    interactionData.correctOrder = interaction.correctOrder
                    break
                  case "fill_blank":
                    interactionData.content = interaction.content
                    interactionData.options = interaction.options
                    interactionData.correctAnswer = interaction.correctAnswer
                    break
                  case "bug_hunter":
                    interactionData.lines = interaction.lines
                    interactionData.correctLineId = interaction.correctLineId
                    break
                  case "matching":
                    interactionData.pairs = interaction.pairs
                    break
                  case "chat_sim":
                    interactionData.scenario = interaction.scenario
                    interactionData.messages = interaction.messages
                    break
                }
                
                return interactionData
              }
            }),
            courseProgress: {
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
    }
  }, [course, lessonStream, currentBlockIndex, moduleIndex, lessonIndex, loading, generating, user, setPageContext])

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

  if (!course || !lessonStream || lessonStream.blocks.length === 0) {
    return null
  }

  // Use the module, lesson, and currentBlock already declared above
  const moduleForRender = course.modules[moduleIndex]
  const lessonForRender = moduleForRender?.lessons[lessonIndex]
  const currentBlockForRender = lessonStream.blocks[currentBlockIndex]
  const isLastBlock = currentBlockIndex === lessonStream.blocks.length - 1
  const canContinue = currentBlockForRender?.type === "text" || interactionResults[currentBlockIndex] !== undefined

  // Completion overlay
  if (showCompletion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-500/10 p-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Lesson Complete!</h2>
            <p className="text-muted-foreground">
              Great job! You've completed this lesson.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push(`/courses/${courseId}`)}>
                Back to Journey Map
              </Button>
              {lessonIndex < moduleForRender?.lessons.length - 1 ? (
                <Button onClick={() => router.push(`/courses/${courseId}/modules/${moduleIndex}/lessons/${lessonIndex + 1}`)}>
                  Next Lesson
                </Button>
              ) : (
                <Button onClick={() => router.push(`/journey/quiz/${courseId}/modules/${moduleIndex}/quiz`)}>
                  Proceed to Module Quiz
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        title={lessonForRender?.title}
        leftAction={
          <Link href={`/courses/${courseId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <main className="flex-1 overflow-y-auto">
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
                <span>{lessonForRender?.duration}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">{lessonForRender?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Module {moduleIndex + 1}: {moduleForRender?.title ? moduleForRender.title.replace(/^Module\s+\d+:\s*/i, "").trim() : ""}
            </p>
          </div>

          {/* Progress indicator */}
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <span>Block {currentBlockIndex + 1} of {lessonStream.blocks.length}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((currentBlockIndex + 1) / lessonStream.blocks.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Stream Blocks */}
          <div className="space-y-6">
            {lessonStream.blocks.slice(0, currentBlockIndex + 1).map((block, index) => {
              const isCompletedInteraction = completedInteractions[index]
              // Treat blocks with saved interaction data as "past" so they render in review mode,
              // even if they are at the current index (e.g. the last interaction block)
              const isPastBlock = index < currentBlockIndex || (!!isCompletedInteraction && index === currentBlockIndex)
              
              if (isPastBlock) {
                // Show previous blocks (read-only)
                if (block.type === "text") {
                  return (
                    <Card key={index} className="opacity-60">
                      <CardContent className="p-6">
                        <MarkdownRenderer content={(block as TextBlock).content} />
                      </CardContent>
                    </Card>
                  )
                }
                // Show completed interactions as read-only (keep them visible)
                if (isCompletedInteraction) {
                  return renderCompletedInteraction(index, isCompletedInteraction)
                }
                return null
              }

              // Current block
              if (block.type === "text") {
                return (
                  <Card key={index} className="border-2 border-primary">
                    <CardContent className="p-6">
                      <MarkdownRenderer content={(block as TextBlock).content} />
                      {canContinue && (
                        <div className="mt-4">
                          <Button onClick={handleContinue} className="w-full">
                            Continue
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              }

              // Interaction blocks
              const interaction = block as any
              switch (interaction.type) {
                case "swipe":
                  return (
                    <SwipeInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                case "reorder":
                  return (
                    <ReorderInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                case "fill_blank":
                  return (
                    <FillBlankInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                case "bug_hunter":
                  return (
                    <BugHunterInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                case "matching":
                  return (
                    <MatchingInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                case "chat_sim":
                  return (
                    <ChatSimInteractionComponent
                      key={index}
                      interaction={interaction}
                      onComplete={(correct) => handleInteractionComplete(index, correct)}
                    />
                  )
                default:
                  return null
              }
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      </main>
    </div>
  )
  
  // Helper function to render completed interactions in review mode
  function renderCompletedInteraction(index: number, completedInteraction: any) {
    const { result } = completedInteraction
    
    switch (completedInteraction.type) {
      case "swipe":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold break-words">{completedInteraction.question}</h3>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm break-words whitespace-pre-wrap">{completedInteraction.explanation}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case "reorder":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold break-words">{completedInteraction.question}</h3>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="space-y-2">
                  {completedInteraction.items.map((item: any, idx: number) => (
                    <div key={item.id} className="p-3 bg-muted rounded-lg">
                      <span className="break-words whitespace-normal">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case "matching":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Match the pairs:</h3>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Terms</h4>
                    {completedInteraction.pairs.map((pair: any) => (
                      <div key={pair.left} className="p-2 bg-muted rounded break-words">
                        {pair.left}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Definitions</h4>
                    {completedInteraction.pairs.map((pair: any) => (
                      <div key={pair.right} className="p-2 bg-muted rounded break-words">
                        {pair.right}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case "fill_blank":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-lg break-words whitespace-pre-wrap">
                    {completedInteraction.content.replace("[BLANK]", completedInteraction.correctAnswer)}
                  </div>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case "bug_hunter":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold break-words">{completedInteraction.question}</h3>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm break-words whitespace-pre-wrap">{completedInteraction.explanation}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case "chat_sim":
        return (
          <Card key={index} className="opacity-80 border-2">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Chat Simulation</h3>
                  {result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Scenario:</p>
                  <p className="text-sm break-words">{completedInteraction.scenario}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      default:
        return null
    }
  }
}
