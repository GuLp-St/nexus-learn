"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Lightbulb, Star, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Clock, FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { QuizQuestion, fetchQuizQuestions, saveQuizQuestions, selectRandomQuestions, createQuizAttempt, saveQuizAttempt, saveQuizAttemptAnswers, getMostRecentQuizAttempt, getIncompleteQuizAttempt, getAnyIncompleteQuizAttempt, abandonQuizAttempt, QuizAttempt } from "@/lib/quiz-utils"
import { generateLessonQuizQuestions, evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
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

export default function LessonQuizPage() {
  const params = useParams()
  const courseId = params.courseId as string
  const moduleIndex = parseInt(params.moduleIndex as string)
  const lessonIndex = parseInt(params.lessonIndex as string)

  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number | boolean }>({})
  const [scores, setScores] = useState<{ [questionId: string]: { correct: boolean; feedback?: string } }>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [otherQuizInProgress, setOtherQuizInProgress] = useState<(QuizAttempt & { courseTitle?: string }) | null>(null)
  const [abandonDialogOpen, setAbandonDialogOpen] = useState(false)
  const [challengeFriendId, setChallengeFriendId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const quizStartTimeRef = useRef<number | null>(null)
  const isChallengeMode = challengeFriendId !== null
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()
  const { showXPAward } = useXP()

  // Set chatbot context when showing results
  useEffect(() => {
    if (showResults && course && questions.length > 0 && Object.keys(scores).length > 0) {
      const totalScore = Object.values(scores).filter((s) => s.correct).length
      const maxScore = questions.length
      const scorePercentage = Math.round((totalScore / maxScore) * 100)

      const contextQuestions = questions.map((question) => {
        const userAnswer = answers[question.questionId]
        const score = scores[question.questionId]
        const isCorrect = score?.correct || false

        return {
          questionId: question.questionId,
          question: question.question,
          type: question.type,
          options: question.options,
          userAnswer: userAnswer ?? "",
          correctAnswer: question.correctAnswer,
          isCorrect,
        }
      })

      setPageContext({
        type: "quiz-result",
        courseTitle: course.title,
        quizType: "lesson",
        moduleIndex: moduleIndex,
        lessonIndex: lessonIndex,
        questions: contextQuestions,
        score: {
          correct: totalScore,
          total: maxScore,
          percentage: scorePercentage,
        },
      })
    } else if (!showResults) {
      setPageContext(null)
    }

    return () => {
      if (showResults) {
        setPageContext(null)
      }
    }
  }, [showResults, course, questions, scores, answers, moduleIndex, lessonIndex, setPageContext])

  const QUIZ_COUNT = 3

  // Check for challenge param in URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search)
      const challengeParam = searchParams.get("challenge")
      if (challengeParam) {
        setChallengeFriendId(challengeParam)
      }
    }
  }, [])

  // Track activity on quiz page
  useActivityTracking({
    userId: user?.uid || null,
    pageType: "quiz",
    courseId,
    moduleIndex,
    lessonIndex,
    enabled: !!user && !!course,
  })

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    const loadQuiz = async () => {
      try {
        // Check for challenge mode from URL (don't rely on state which might not be set yet)
        const searchParams = new URLSearchParams(window.location.search)
        const challengeParam = searchParams.get("challenge")
        const isInChallengeMode = !!challengeParam
        
        // Track start time for challenge mode (set early before any early returns)
        if (isInChallengeMode && !quizStartTimeRef.current) {
          const startTime = Date.now()
          setQuizStartTime(startTime)
          quizStartTimeRef.current = startTime
          if (challengeParam) {
            setChallengeFriendId(challengeParam)
          }
        }
        
        // Fetch course data
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
        if (!courseWithProgress) {
          router.push("/quizzes")
          return
        }

        setCourse(courseWithProgress)

        const module = courseWithProgress.modules[moduleIndex]
        const lesson = module?.lessons[lessonIndex]

        if (!module || !lesson) {
          router.push(`/quizzes/${courseId}`)
          return
        }

        // Check if lesson is completed (skip check in challenge mode)
        const lessonKey = `${moduleIndex}-${lessonIndex}`
        const isCompleted = courseWithProgress.userProgress?.completedLessons?.includes(lessonKey) || false
        
        if (!isCompleted && !isInChallengeMode) {
          router.push(`/courses/${courseId}/modules/${moduleIndex}/lessons/${lessonIndex}`)
          return
        }

        // Check for ANY incomplete quiz first (limit to 1 quiz in progress)

        // Check URL params for retake option (skip in challenge mode)
        // Note: searchParams already retrieved earlier, reuse it
        const retake = !isInChallengeMode ? searchParams.get("retake") : null

        // Check for incomplete attempt first (for resume) - skip in challenge mode
        const { getIncompleteQuizAttempt } = await import("@/lib/quiz-utils")
        const incompleteAttempt = !isInChallengeMode ? await getIncompleteQuizAttempt(user.uid, courseId, "lesson", moduleIndex, lessonIndex) : null

        if (incompleteAttempt && incompleteAttempt.questionIds.length > 0 && !isInChallengeMode) {
          // Resume incomplete quiz
          const availableQuestions = await fetchQuizQuestions(courseId, "lesson", moduleIndex, lessonIndex)
          const questionMap = new Map(availableQuestions.map(q => [q.questionId, q]))
          const restoredQuestions = incompleteAttempt.questionIds
            .map(id => questionMap.get(id))
            .filter((q): q is QuizQuestion => q !== undefined)

          if (restoredQuestions.length > 0 && incompleteAttempt.id) {
            setQuestions(restoredQuestions)
            setAttemptId(incompleteAttempt.id)
            // Restore answers
            setAnswers(incompleteAttempt.answers || {})
            // Resume from saved question index, or find first unanswered question
            if (incompleteAttempt.currentQuestionIndex !== undefined && incompleteAttempt.currentQuestionIndex !== null && incompleteAttempt.currentQuestionIndex >= 0) {
              setCurrentQuestionIndex(Math.min(incompleteAttempt.currentQuestionIndex, restoredQuestions.length - 1))
            } else {
              // Fallback: find first unanswered question
              const firstUnansweredIndex = restoredQuestions.findIndex(q => !incompleteAttempt.answers?.[q.questionId])
              if (firstUnansweredIndex >= 0) {
                setCurrentQuestionIndex(firstUnansweredIndex)
              } else {
                setCurrentQuestionIndex(0)
              }
            }
            setLoading(false)
            return
          }
        }

        // Check for completed attempt (for retake)
        const recentAttempt = await getMostRecentQuizAttempt(user.uid, courseId, "lesson", moduleIndex, lessonIndex)

        // Fetch available questions
        let availableQuestions = await fetchQuizQuestions(courseId, "lesson", moduleIndex, lessonIndex)

        // If not enough questions, generate more
        if (availableQuestions.length < QUIZ_COUNT) {
          setGenerating(true)
          const generatedQuestions = await generateLessonQuizQuestions(
            courseWithProgress.title,
            module.title,
            lesson.title,
            lesson.content,
            courseId,
            moduleIndex,
            lessonIndex,
            QUIZ_COUNT * 2 // Generate more to have a pool
          )
          await saveQuizQuestions(generatedQuestions)
          availableQuestions = await fetchQuizQuestions(courseId, "lesson", moduleIndex, lessonIndex)
        }

        // Select questions based on retake option
        let selectedQuestions: QuizQuestion[]
        if (!isInChallengeMode && retake === "same" && recentAttempt && recentAttempt.questionIds.length > 0) {
          // Retake same questions
          const questionMap = new Map(availableQuestions.map(q => [q.questionId, q]))
          selectedQuestions = recentAttempt.questionIds
            .map(id => questionMap.get(id))
            .filter((q): q is QuizQuestion => q !== undefined)
        } else {
          // New set: randomly select (always in challenge mode)
          selectedQuestions = selectRandomQuestions(availableQuestions, QUIZ_COUNT)
        }

        if (selectedQuestions.length === 0) {
          throw new Error("No questions available")
        }

        setQuestions(selectedQuestions)

        // Track start time for challenge mode (fallback if not set earlier)
        if (isInChallengeMode && !quizStartTimeRef.current) {
          const startTime = Date.now()
          setQuizStartTime(startTime)
          quizStartTimeRef.current = startTime
        }

        // Create quiz attempt
        const newAttemptId = await createQuizAttempt(
          user.uid,
          courseId,
          "lesson",
          selectedQuestions.map(q => q.questionId),
          moduleIndex,
          lessonIndex,
          !isInChallengeMode && retake === "same"
        )
        setAttemptId(newAttemptId)

      } catch (error) {
        console.error("Error loading quiz:", error)
      } finally {
        setLoading(false)
        setGenerating(false)
      }
    }

    if (user) {
      loadQuiz()
    }
  }, [courseId, moduleIndex, lessonIndex, router, user, authLoading])

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
      const newScores: { [questionId: string]: { correct: boolean; feedback?: string } } = {}

      // Evaluate all answers
      for (const question of questions) {
        const userAnswer = answers[question.questionId]

        if (question.type === "objective") {
          const correct = checkObjectiveAnswer(question, userAnswer || "")
          newScores[question.questionId] = { correct }
        } else {
          // Subjective: evaluate with AI
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

      // Save attempt with XP awards
      if (attemptId && user && course) {
        const { doc, getDoc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const attemptDoc = await getDoc(doc(db, "quizAttempts", attemptId))
        if (attemptDoc.exists()) {
          const attemptData = attemptDoc.data()
          const questionIds = questions.map((q) => q.questionId)
          
          // In challenge mode, save without XP (will be awarded later based on challenge result)
          if (challengeFriendId) {
            // Use ref as fallback if state is not set (can happen during rapid state updates)
            const startTime = quizStartTime || quizStartTimeRef.current
            if (!startTime) {
              console.error("quizStartTime not set in challenge mode", { quizStartTime, ref: quizStartTimeRef.current })
              throw new Error("Quiz start time not recorded")
            }
            const { saveQuizAttemptBasic } = await import("@/lib/quiz-utils")
            await saveQuizAttemptBasic(attemptId, answers, newScores)
            
            // Calculate score and time
            const totalScore = Object.values(newScores).filter((s) => s.correct).length
            const timeTaken = Math.floor((Date.now() - startTime) / 1000) // seconds
            
            // Create challenge document
            const { createChallenge } = await import("@/lib/challenge-utils")
            const challengeId = await createChallenge(
              user.uid,
              challengeFriendId,
              course.id,
              "lesson",
              moduleIndex,
              lessonIndex,
              questionIds,
              attemptId,
              totalScore,
              timeTaken
            )
            
            // Create notification/chat message for challenged user
            const { sendMessage } = await import("@/lib/chat-utils")
            await sendMessage(user.uid, challengeFriendId, "I challenged you to a quiz!", "challenge", challengeId)
            
            // Redirect to waiting page immediately
            setSubmitting(false)
            router.push(`/challenges/${challengeId}/waiting`)
            return
          } else {
            // Normal quiz mode - award XP
            const result = await saveQuizAttempt(
              attemptId,
              answers,
              newScores,
              user.uid,
              course.id,
              "lesson",
              moduleIndex,
              lessonIndex,
              questionIds,
              attemptData.isRetake || false
            )

            if (result) {
              showXPAward(result)
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

  if (loading || generating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">
            {generating ? "Generating questions..." : "Loading quiz..."}
          </p>
        </div>
      </div>
    )
  }

  if (otherQuizInProgress) {
    return (
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav currentPath="/quizzes" title="Quiz in Progress" />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-6">
              <div className="rounded-full bg-yellow-500/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Quiz in Progress</h2>
                <div className="bg-muted p-3 rounded-md text-sm text-left border border-border mt-4">
                  <p className="font-semibold text-foreground truncate">
                    {otherQuizInProgress.courseTitle}
                  </p>
                  <p className="text-muted-foreground capitalize">
                    Type: {otherQuizInProgress.quizType}
                  </p>
                </div>
                <p className="text-muted-foreground text-sm mt-4">
                  You can only have one active quiz at a time.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full" 
                  onClick={() => {
                    const { courseId, quizType, moduleIndex, lessonIndex } = otherQuizInProgress
                    let url = `/quizzes/${courseId}`
                    if (quizType === "lesson") url += `/modules/${moduleIndex}/lessons/${lessonIndex}/quiz`
                    else if (quizType === "module") url += `/modules/${moduleIndex}/quiz`
                    else url += `/quiz`
                    router.push(url)
                  }}
                >
                  Continue Existing Quiz
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-destructive hover:bg-destructive/10"
                  onClick={() => setAbandonDialogOpen(true)}
                >
                  End and Start New
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => router.push('/quizzes')}>
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>

        <Dialog open={abandonDialogOpen} onOpenChange={setAbandonDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>End Quiz Attempt?</DialogTitle>
              <DialogDescription>
                Are you sure? This will clear your current progress for that quiz and allow you to start a new one.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setAbandonDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={async () => {
                  if (otherQuizInProgress?.id) {
                    setLoading(true)
                    await abandonQuizAttempt(otherQuizInProgress.id)
                    setAbandonDialogOpen(false)
                    setOtherQuizInProgress(null)
                    window.location.reload()
                  }
                }}
              >
                End and Start New
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (!course || questions.length === 0) {
    return null
  }

  const currentQuestion = questions[currentQuestionIndex]
  const module = course.modules[moduleIndex]
  const lesson = module?.lessons[lessonIndex]
  const totalScore = Object.values(scores).filter((s) => s.correct).length
  const maxScore = questions.length
  const scorePercentage = Math.round((totalScore / maxScore) * 100)

  if (showResults) {
    return (
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav 
          currentPath="/quizzes" 
          title="Quiz Results"
          leftAction={
            <Link href={`/quizzes/${courseId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          }
        />

        <main className="flex-1">
          <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
            <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
              <Link href={`/quizzes/${courseId}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Quizzes</span>
                </Button>
              </Link>
            </div>
          </header>

          <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
            <div className="space-y-8">
              {/* Score Display */}
              <div className="text-center">
                <h1 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">Your Score</h1>
                <div className="flex items-center justify-center gap-2 text-6xl font-bold text-foreground lg:text-7xl">
                  <span className="text-primary">{totalScore}/{maxScore}</span>
                  <div className="flex gap-1">
                    {questions.map((_, i) => (
                      <Star
                        key={i}
                        className={`h-10 w-10 lg:h-12 lg:w-12 ${
                          i < totalScore ? "fill-primary text-primary" : "text-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-lg text-muted-foreground">
                  {scorePercentage >= 80 ? "Excellent work!" : scorePercentage >= 60 ? "Good job!" : "Keep practicing!"}
                </p>
              </div>

              {/* Question Review */}
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

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav 
        currentPath="/quizzes" 
        title="Quiz"
        leftAction={
          <Link href={`/quizzes/${courseId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <main className="flex-1">
        <header className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:block">
          <div className="mx-auto max-w-4xl px-4 py-4 lg:px-8">
            <Link href={`/quizzes/${courseId}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Quizzes</span>
              </Button>
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="space-y-8">
            {/* Progress Bar */}
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

            {/* Question Card */}
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

                {/* Answer Input */}
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

                {/* Navigation */}
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

