"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Star, Play, Clock, FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { QuizQuestion, QuizAttempt, fetchQuizQuestions, fetchQuizQuestionsByIds, saveQuizQuestions, selectRandomQuestions, createQuizAttempt, saveQuizAttempt, saveQuizAttemptAnswers, getActiveQuiz } from "@/lib/quiz-utils"
import { generateCourseQuizQuestions, evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
import { useActivityTracking } from "@/hooks/use-activity-tracking"
import { useXP } from "@/components/xp-context-provider"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function CourseQuizPage() {
  const params = useParams()
  const courseId = params.courseId as string

  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number | boolean }>({})
  const [scores, setScores] = useState<{ [questionId: string]: { correct: boolean; feedback?: string; marks?: number } }>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [challengeFriendId, setChallengeFriendId] = useState<string | null>(null)
  const [challengeBetAmount, setChallengeBetAmount] = useState<number>(0)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const quizStartTimeRef = useRef<number | null>(null)
  const isChallengeMode = challengeFriendId !== null
  const quizStartedRef = useRef(false) // Prevent double start
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatContext()
  const { showXPAward } = useXP()
  const [error, setError] = useState<string | null>(null) // Track errors

  // Set chatbot context with real-time quiz data
  useEffect(() => {
    if (course && user) {
      const totalScore = showResults && Object.keys(scores).length > 0
        ? Object.values(scores).reduce((sum, s) => {
            if (s.marks !== undefined) return sum + s.marks
            return sum + (s.correct ? 1 : 0)
          }, 0)
        : 0
      const maxScore = showResults && questions.length > 0
        ? questions.reduce((sum, q) => sum + (q.type === "subjective" ? 4 : 1), 0)
        : 0
      const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

      setPageContext({
        title: showResults && course
          ? `Quiz Results: ${course.title} - ${scorePercentage}%`
          : course
          ? `Taking Quiz: ${course.title}`
          : "Quiz",
        description: showResults
          ? `The user just completed the final quiz for "${course.title}" with a score of ${scorePercentage}%.`
          : `The user is taking the final quiz for "${course.title}".`,
        data: {
          courseId: course.id,
          courseTitle: course.title,
          courseDescription: course.description,
          quizType: "course",
          // Quiz questions and answers (when showing results)
          ...(showResults && questions.length > 0 ? {
            score: {
              correct: totalScore,
              total: maxScore,
              percentage: scorePercentage,
            },
            questions: questions.map((question) => {
              const userAnswer = answers[question.questionId]
              const score = scores[question.questionId]
              return {
                questionId: question.questionId,
                question: question.question,
                type: question.type,
                options: question.options,
                userAnswer: userAnswer ?? "",
                correctAnswer: question.correctAnswer,
                isCorrect: score?.correct || false,
                marks: score?.marks || 0,
                feedback: score?.feedback,
              }
            }),
          } : {
            // When taking quiz, include question count
            totalQuestions: questions.length,
            currentQuestion: questions[currentQuestionIndex] ? {
              questionId: questions[currentQuestionIndex].questionId,
              question: questions[currentQuestionIndex].question,
              type: questions[currentQuestionIndex].type,
              options: questions[currentQuestionIndex].options,
            } : undefined,
          }),
        },
      })
    }
  }, [course, user, showResults, questions, scores, answers, currentQuestionIndex, setPageContext])

  const FINAL_QUIZ_COUNT = 20 // 18 objective + 2 subjective

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search)
      const challengeParam = searchParams.get("challenge")
      const betParam = searchParams.get("bet")
      
      if (challengeParam) {
        setChallengeFriendId(challengeParam)
        setChallengeBetAmount(betParam ? parseInt(betParam) || 0 : 0)
      }
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    const loadCourse = async () => {
      if (quizStartedRef.current) return
      
      try {
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
        if (!courseWithProgress) {
          router.push("/journey")
          return
        }

        setCourse(courseWithProgress)
        
        // Check if course is 100% complete (skip in challenge mode)
        if ((courseWithProgress.userProgress?.progress || 0) < 100 && !isChallengeMode) {
          router.push(`/journey/${courseId}`)
          return
        }

        // Check for active quiz
        if (!isChallengeMode) {
          const activeQuiz = await getActiveQuiz(user.uid)
          
          // If active quiz exists but doesn't match this quiz, redirect to it
          if (activeQuiz && (activeQuiz.courseId !== courseId || activeQuiz.quizType !== "course")) {
            if (activeQuiz.quizType === "course") {
              router.push(`/journey/quiz/${activeQuiz.courseId}/quiz`)
            } else if (activeQuiz.quizType === "module" && activeQuiz.moduleIndex !== null) {
              router.push(`/journey/quiz/${activeQuiz.courseId}/modules/${activeQuiz.moduleIndex}/quiz`)
            }
            return
          }
        }

        quizStartedRef.current = true
        await handleStartQuiz(undefined, courseWithProgress)

      } catch (error) {
        console.error("Error fetching course:", error)
        setError("Failed to load course data.")
        setLoading(false)
      }
    }

    if (user) {
      loadCourse()
    }
  }, [courseId, router, user, authLoading])

  // Auto-start quiz in challenge mode or direct start from roadmap
  useEffect(() => {
    if (isChallengeMode && course && !loading && !generating && !questions.length && user && !quizStartedRef.current) {
      // Delay slightly to ensure all state is properly set
      const timeout = setTimeout(() => {
        if (quizStartedRef.current) return
        quizStartedRef.current = true
        handleStartQuiz(undefined, course)
      }, 200)
      return () => clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChallengeMode, course, loading, generating, questions.length, user])

  const handleStartQuiz = async (retakeOption?: "same" | "new", courseData?: CourseWithProgress) => {
    const finalCourseData = courseData || course
    if (!user || !finalCourseData) return

    setLoading(true)
    setError(null)

    try {
      // Check for active quiz (for resume) - skip in challenge mode
      if (!isChallengeMode) {
        const activeQuiz = await getActiveQuiz(user.uid)

        // If active quiz exists and matches this quiz, resume it
        if (activeQuiz && activeQuiz.id && activeQuiz.courseId === courseId && activeQuiz.quizType === "course") {
          // Restore from active quiz
          const restoredQuestions = await fetchQuizQuestionsByIds(courseId, activeQuiz.questionIds)

          if (restoredQuestions.length > 0) {
            setQuestions(restoredQuestions)
            setAnswers(activeQuiz.answers || {})
            setAttemptId(activeQuiz.id)
            
            // Resume from saved question index (exactly where user left off)
            if (activeQuiz.currentQuestionIndex !== undefined && activeQuiz.currentQuestionIndex !== null && activeQuiz.currentQuestionIndex >= 0) {
              setCurrentQuestionIndex(Math.min(activeQuiz.currentQuestionIndex, restoredQuestions.length - 1))
            } else {
              // Fallback: find first unanswered question
              const firstUnansweredIndex = restoredQuestions.findIndex(q => !activeQuiz.answers?.[q.questionId])
              if (firstUnansweredIndex >= 0) {
                setCurrentQuestionIndex(firstUnansweredIndex)
              } else {
                // All questions answered, start from last question
                setCurrentQuestionIndex(restoredQuestions.length - 1)
              }
            }
            
            setLoading(false)
            return
          }
        }
      }

      // Always generate new questions for each quiz attempt
      setGenerating(true)
      
      // Set minimum loading time to 30 seconds for optimistic loading
      const minLoadingTime = 30000
      const startTime = Date.now()
      
      let generatedQuestions: QuizQuestion[] | null = null
      try {
        generatedQuestions = await generateCourseQuizQuestions(
          finalCourseData,
          courseId,
          FINAL_QUIZ_COUNT
        )
      } catch (err: any) {
        // If timeout or error, wait 2 seconds then check Firestore
        if (err.message?.includes("timeout") || err.message?.includes("Generation timeout")) {
          console.log("Generation timeout, checking Firestore...")
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Double-check: Try to load from Firestore using question IDs from attempt
          // For now, we'll just throw the error since questions aren't saved until after generation
          // In a real scenario, you might want to check for recently saved questions
          const elapsed = Date.now() - startTime
          const remaining = Math.max(0, minLoadingTime - elapsed)
          if (remaining > 0) {
            await new Promise(resolve => setTimeout(resolve, remaining))
          }
          throw new Error("Generation timed out. Please try again.")
        } else {
          throw err
        }
      }
      
      // Ensure minimum loading time
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, minLoadingTime - elapsed)
      if (remaining > 0 && generatedQuestions) {
        await new Promise(resolve => setTimeout(resolve, remaining))
      }

      if (generatedQuestions) {
        let selectedQuestions: QuizQuestion[]
        // In challenge mode or new quiz, always use new random questions
        // For final quiz: ensure we have 18 objective + 2 subjective
        const objectiveQuestions = generatedQuestions.filter(q => q.type === "objective")
        const subjectiveQuestions = generatedQuestions.filter(q => q.type === "subjective")
        const selectedObjective = selectRandomQuestions(objectiveQuestions, 18)
        const selectedSubjective = selectRandomQuestions(subjectiveQuestions, 2)
        selectedQuestions = [...selectedObjective, ...selectedSubjective].sort(() => Math.random() - 0.5)

        if (selectedQuestions.length === 0) {
          throw new Error("No questions available")
        }

        // Save questions to database so history works
        await saveQuizQuestions(selectedQuestions)

        setQuestions(selectedQuestions)

        // Track start time for challenge mode
        if (isChallengeMode) {
            const startTime = Date.now()
            setQuizStartTime(startTime)
            quizStartTimeRef.current = startTime
        }

        const newAttemptId = await createQuizAttempt(
          user.uid,
          courseId,
          "course",
          selectedQuestions.map(q => q.questionId),
          null,
          null,
          false // isRetake - always false for new attempts
        )
        setAttemptId(newAttemptId)
      }

    } catch (error) {
      console.error("Error loading quiz:", error)
      setError(error instanceof Error ? error.message : "Failed to load quiz questions.")
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  const handleAnswerChange = async (questionId: string, answer: string | number | boolean) => {
    const newAnswers = {
      ...answers,
      [questionId]: answer,
    }
    setAnswers(newAnswers)
    
    // Auto-save answer
    if (attemptId) {
      await saveQuizAttemptAnswers(attemptId, newAnswers, currentQuestionIndex)
    }
  }

  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      const newIndex = currentQuestionIndex + 1
      setCurrentQuestionIndex(newIndex)
      
      // Auto-save current question index
      if (attemptId) {
        await saveQuizAttemptAnswers(attemptId, answers, newIndex)
      }
    }
  }

  const handlePrevious = async () => {
    if (currentQuestionIndex > 0) {
      const newIndex = currentQuestionIndex - 1
      setCurrentQuestionIndex(newIndex)
      
      // Auto-save current question index
      if (attemptId) {
        await saveQuizAttemptAnswers(attemptId, answers, newIndex)
      }
    }
  }

  const handleSubmit = async () => {
    if (!user || !attemptId) return

    setSubmitting(true)

    try {
      const newScores: { [questionId: string]: { correct: boolean; feedback?: string; marks?: number } } = {}

      for (const question of questions) {
        const userAnswer = answers[question.questionId]

        if (question.type === "objective") {
          const correct = checkObjectiveAnswer(question, userAnswer)
          newScores[question.questionId] = { correct }
        } else {
          if (userAnswer && typeof userAnswer === "string") {
            const evaluation = await evaluateSubjectiveAnswer(
              question.question,
              userAnswer,
              question.suggestedAnswer || ""
            )
            newScores[question.questionId] = {
              correct: evaluation.correct,
              feedback: evaluation.feedback,
              marks: evaluation.score, // Score is now marks (2-4)
            }
          } else {
            newScores[question.questionId] = { correct: false, feedback: "No answer provided" }
          }
        }
      }

      setScores(newScores)
      
      // Get attempt data to pass to saveQuizAttempt
      if (attemptId && user) {
        const { doc, getDoc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const attemptDoc = await getDoc(doc(db, "quizAttempts", attemptId))
        if (attemptDoc.exists()) {
          const attemptData = attemptDoc.data()
          const questionIds = questions.map((q) => q.questionId)
          
          // Challenge mode handling will be updated to use challengeId from URL
          // For now, treat as normal quiz
          {
            // Normal quiz mode - save attempt but don't award rewards automatically (claimable from roadmap)
            const { saveQuizAttemptBasic } = await import("@/lib/quiz-utils")
            await saveQuizAttemptBasic(attemptId, answers, newScores)
            
            // Update tracking metrics
            const { updateUserTrackingMetrics } = await import("@/lib/tracking-utils")
            await updateUserTrackingMetrics(user.uid).catch((error) => {
              console.error("Error updating tracking metrics:", error)
            })

                // Save highest score to course progress
                const totalScore = Object.values(newScores).reduce((sum, s) => {
                  if (s.marks !== undefined) {
                    return sum + s.marks
                  }
                  return sum + (s.correct ? 1 : 0)
                }, 0)
                const maxScore = Object.values(newScores).reduce((sum, s) => {
                  if (s.marks !== undefined) {
                    return sum + 4 // Subjective max 4 marks
                  }
                  return sum + 1 // Objective 1 mark each
                }, 0)
                const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

                // Update final quiz score in user progress
                const { doc, updateDoc, getDoc } = await import("firebase/firestore")
                const { db } = await import("@/lib/firebase")
                const progressRef = doc(db, "userCourseProgress", `${user.uid}-${courseId}`)
                const progressDoc = await getDoc(progressRef)
                if (progressDoc.exists()) {
                  const currentData = progressDoc.data()
                  const currentHighest = currentData.finalQuizScore || 0
                  
                  if (scorePercentage > currentHighest) {
                    await updateDoc(progressRef, {
                      finalQuizScore: scorePercentage,
                    })
                  }
                }
          }
        } else {
          // Fallback: save without XP if attempt doc not found
          const { saveQuizAttemptBasic } = await import("@/lib/quiz-utils")
          await saveQuizAttemptBasic(attemptId, answers, newScores)
        }
      }
      
      // Only show results if not in challenge mode (challenge mode redirects above)
      if (!challengeFriendId) {
        setShowResults(true)
      }
    } catch (error) {
      console.error("Error submitting quiz:", error)
    } finally {
      setSubmitting(false)
    }
  }

  if (generating) {
    return <LoadingScreen />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">
            Loading quiz...
          </p>
        </div>
      </div>
    )
  }


  if (showResults) {
    // Calculate score correctly: sum marks if available, otherwise count correct answers
    const totalScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + s.marks
      }
      return sum + (s.correct ? 1 : 0)
    }, 0)
    // Max score: count questions, but subjective questions count as 4 marks max
    const maxScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) {
        return sum + 4 // Subjective questions max 4 marks
      }
      return sum + 1 // Objective questions 1 mark each
    }, 0)
    const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

    return (
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav 
          currentPath="/journey" 
          title="Quiz Results"
          leftAction={
            <Link href={`/journey/${courseId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          }
        />

        <main className="flex-1">
          <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
            <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
              <Link href={`/journey/${courseId}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Course Journey</span>
                </Button>
              </Link>
            </div>
          </header>

          <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
            <div className="space-y-8">
              <div className="text-center">
                <h1 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">Your Score</h1>
                <div className="flex items-center justify-center gap-4 text-6xl font-bold text-foreground lg:text-7xl">
                  <span className="text-primary">{totalScore}/{maxScore}</span>
                  {(() => {
                    const grade = scorePercentage >= 100 ? "S" 
                      : scorePercentage >= 80 ? "A"
                      : scorePercentage >= 60 ? "B"
                      : scorePercentage >= 40 ? "C"
                      : "F"
                    const gradeColor = grade === "S" ? "text-yellow-500"
                      : grade === "A" ? "text-green-500"
                      : grade === "B" ? "text-blue-500"
                      : grade === "C" ? "text-orange-500"
                      : "text-red-500"
                    return (
                      <span className={gradeColor}>
                        {grade}
                      </span>
                    )
                  })()}
                </div>
                <p className="mt-4 text-lg text-muted-foreground">
                  {scorePercentage >= 80 ? "Excellent work!" : scorePercentage >= 60 ? "Good job!" : "Keep practicing!"}
                </p>
              </div>

              <div className="space-y-4">
                {questions.map((question, index) => {
                  const score = scores[question.questionId]
                  const userAnswer = answers[question.questionId]
                  const isCorrect = score?.correct || false

                  return (
                    <Card key={question.questionId} className={isCorrect ? "border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20"}>
                      <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                          {isCorrect ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 space-y-3">
                            <div>
                              <h3 className="font-semibold text-foreground">Question {index + 1}</h3>
                              <p className="text-foreground mt-1">{question.question}</p>
                            </div>
                            {question.type === "objective" ? (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Your answer:</p>
                                <p className="text-foreground">
                                  {question.options && typeof userAnswer === "number" 
                                    ? question.options[userAnswer] 
                                    : String(userAnswer)}
                                </p>
                                {!isCorrect && question.correctAnswer !== undefined && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Correct answer: {
                                      question.options && typeof question.correctAnswer === "number"
                                        ? question.options[question.correctAnswer]
                                        : String(question.correctAnswer)
                                    }
                                  </p>
                                )}
                                {/* Citations - Only show if facts are found */}
                                {(() => {
                                  const factIds = (question.sourceFactIds || [question.sourceFactId]).filter(Boolean)
                                  if (!factIds.length || !course) return null
                                  
                                  const foundFacts = factIds.map((factId) => {
                                    // Find fact across all modules
                                    for (let i = 0; i < course.modules.length; i++) {
                                      const module = course.modules[i]
                                      const found = (module as any).accumulatedContext?.find((f: any) => f.id === factId)
                                      if (found) return found
                                    }
                                    return null
                                  }).filter(Boolean)
                                  
                                  if (foundFacts.length === 0) return null
                                  
                                  return (
                                    <div className="mt-3 pt-3 border-t border-border">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Learn more:</p>
                                      <div className="space-y-1">
                                        {foundFacts.map((fact: any, idx: number) => {
                                          const [courseIdPart, modIdx, lessonIdx] = fact.sourceLessonId.split("-").slice(-3).map(Number)
                                          return (
                                            <Link
                                              key={idx}
                                              href={`/journey/${courseId}/modules/${modIdx}/lessons/${lessonIdx}`}
                                              className="text-xs text-primary hover:underline flex items-center gap-1"
                                            >
                                              <span>→ {fact.sourceLessonTitle}</span>
                                            </Link>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Your answer:</p>
                                <p className="text-foreground">{String(userAnswer)}</p>
                                {score?.feedback && (
                                  <div className="mt-2 p-3 rounded-md bg-background/50">
                                    <p className="text-sm text-foreground">{score.feedback}</p>
                                  </div>
                                )}
                                {/* Citations for subjective - Only show if facts are found */}
                                {(() => {
                                  const factIds = question.sourceFactIds?.filter(Boolean) || []
                                  if (!factIds.length || !course) return null
                                  
                                  const foundFacts = factIds.map((factId) => {
                                    // Find fact across all modules
                                    for (let i = 0; i < course.modules.length; i++) {
                                      const module = course.modules[i]
                                      const found = (module as any).accumulatedContext?.find((f: any) => f.id === factId)
                                      if (found) return found
                                    }
                                    return null
                                  }).filter(Boolean)
                                  
                                  if (foundFacts.length === 0) return null
                                  
                                  return (
                                    <div className="mt-3 pt-3 border-t border-border">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Learn more:</p>
                                      <div className="space-y-1">
                                        {foundFacts.map((fact: any, idx: number) => {
                                          const [courseIdPart, modIdx, lessonIdx] = fact.sourceLessonId.split("-").slice(-3).map(Number)
                                          return (
                                            <Link
                                              key={idx}
                                              href={`/journey/${courseId}/modules/${modIdx}/lessons/${lessonIdx}`}
                                              className="text-xs text-primary hover:underline flex items-center gap-1"
                                            >
                                              <span>→ {fact.sourceLessonTitle}</span>
                                            </Link>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Loading states
  if (loading || generating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">
            {generating ? "Generating questions..." : "Loading quiz..."}
          </p>
          {error && <p className="text-destructive text-sm mt-2">{error}</p>}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 px-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Error Loading Quiz</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
          <Link href={`/journey/${courseId}`} className="block">
            <Button variant="outline">Back to Course</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Loading course...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        currentPath="/journey" 
        title="Quiz"
        leftAction={
          <Link href={`/journey/${courseId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <main className="flex-1">
        <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
          <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
            <Link href={`/journey/${courseId}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Course</span>
              </Button>
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Quiz Progress</span>
                <span className="font-semibold text-primary">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <Card>
              <CardContent className="space-y-6 p-6 lg:p-8">
                <div className="space-y-4">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
                    {currentQuestion.question}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {currentQuestion.type === "objective" ? "Select the correct answer." : "Write your answer in detail. The AI will evaluate your response."}
                  </p>
                </div>

                {currentQuestion.type === "objective" ? (
                  <div className="space-y-4">
                    {currentQuestion.objectiveType === "true-false" ? (
                      <div className="flex gap-4">
                        <Button
                          variant={answers[currentQuestion.questionId] === true ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => handleAnswerChange(currentQuestion.questionId, true)}
                        >
                          True
                        </Button>
                        <Button
                          variant={answers[currentQuestion.questionId] === false ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => handleAnswerChange(currentQuestion.questionId, false)}
                        >
                          False
                        </Button>
                      </div>
                    ) : (
                      <RadioGroup
                        value={String(answers[currentQuestion.questionId] ?? "")}
                        onValueChange={(value) => handleAnswerChange(currentQuestion.questionId, parseInt(value))}
                      >
                        {currentQuestion.options?.map((option, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <RadioGroupItem value={String(index)} id={`option-${index}`} />
                            <Label htmlFor={`option-${index}`} className="font-normal cursor-pointer flex-1">
                              {option}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="answer" className="text-sm font-medium text-foreground">
                      Your Answer
                    </Label>
                    <Textarea
                      id="answer"
                      placeholder="Type your answer here..."
                      className="min-h-[200px] text-base leading-relaxed"
                      value={String(answers[currentQuestion.questionId] || "")}
                      onChange={(e) => handleAnswerChange(currentQuestion.questionId, e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {String(answers[currentQuestion.questionId] || "").length} characters
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentQuestionIndex === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  {currentQuestionIndex === questions.length - 1 ? (
                    <Button
                      size="lg"
                      onClick={handleSubmit}
                      disabled={submitting || answers[currentQuestion.questionId] === undefined || answers[currentQuestion.questionId] === null || (currentQuestion.type === "subjective" && String(answers[currentQuestion.questionId] || "").trim() === "")}
                      className="gap-2"
                    >
                      {submitting ? (
                        <>
                          <Spinner className="h-4 w-4" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Submit Quiz
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button onClick={handleNext} className="gap-2">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

