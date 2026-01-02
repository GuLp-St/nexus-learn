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
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { QuizQuestion, QuizAttempt, fetchQuizQuestions, saveQuizQuestions, selectRandomQuestions, createQuizAttempt, saveQuizAttempt, saveQuizAttemptAnswers, getMostRecentQuizAttempt, getIncompleteQuizAttempt, getAnyIncompleteQuizAttempt, abandonQuizAttempt } from "@/lib/quiz-utils"
import { generateCourseQuizQuestions, evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
import { QuizRetakeModal } from "@/components/quiz-retake-modal"
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
  const [scores, setScores] = useState<{ [questionId: string]: { correct: boolean; feedback?: string } }>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(true)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [retakeModal, setRetakeModal] = useState<{ open: boolean } | null>(null)
  const [otherQuizInProgress, setOtherQuizInProgress] = useState<(QuizAttempt & { courseTitle?: string }) | null>(null)
  const [abandonDialogOpen, setAbandonDialogOpen] = useState(false)
  const [challengeFriendId, setChallengeFriendId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const quizStartTimeRef = useRef<number | null>(null)
  const isChallengeMode = challengeFriendId !== null
  const [hasPreviousAttempts, setHasPreviousAttempts] = useState(false)
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
        quizType: "course",
        moduleIndex: null,
        lessonIndex: null,
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
  }, [showResults, course, questions, scores, answers, setPageContext])

  const QUIZ_COUNT = 18

  // Check for challenge param in URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search)
      const challengeParam = searchParams.get("challenge")
      if (challengeParam) {
        setChallengeFriendId(challengeParam)
        // In challenge mode, auto-start quiz
        setShowConfirmation(false)
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
      try {
        const courseWithProgress = await getCourseWithProgress(courseId, user.uid)
        if (!courseWithProgress) {
          router.push("/quizzes")
          return
        }

        setCourse(courseWithProgress)
        
        // Check if course is 100% complete (skip in challenge mode)
        if ((courseWithProgress.userProgress?.progress || 0) < 100 && !isChallengeMode) {
          router.push(`/quizzes/${courseId}`)
          return
        }

        // Check for ANY incomplete quiz first (limit to 1 quiz in progress)
        const anyIncomplete = await getAnyIncompleteQuizAttempt(user.uid)
        
        // If there's an incomplete quiz that isn't THIS course quiz, we'll show the blocker
        if (anyIncomplete && (anyIncomplete.courseId !== courseId || anyIncomplete.quizType !== "course")) {
          setOtherQuizInProgress(anyIncomplete)
          setLoading(false)
          return
        }

        // Check if user has previous quiz attempts
        const { getQuizAttempts } = await import("@/lib/quiz-utils")
        const previousAttempts = await getQuizAttempts(user.uid, courseId)
        const hasCourseAttempts = previousAttempts.some(attempt => 
          attempt.quizType === "course" && attempt.completedAt
        )
        setHasPreviousAttempts(hasCourseAttempts)

        setLoading(false) // Set loading to false so confirmation can show
      } catch (error) {
        console.error("Error fetching course:", error)
        router.push("/quizzes")
      }
    }

    if (user) {
      loadCourse()
    }
  }, [courseId, router, user, authLoading])

  // Auto-start quiz in challenge mode
  useEffect(() => {
    if (isChallengeMode && course && !loading && !generating && !questions.length && user && !showConfirmation) {
      // Delay slightly to ensure all state is properly set
      const timeout = setTimeout(() => {
        handleStartQuiz()
      }, 200)
      return () => clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChallengeMode, course, loading, generating, questions.length, user, showConfirmation])

  const handleStartQuiz = async (retakeOption?: "same" | "new") => {
    if (!user || !course) return

    setShowConfirmation(false)
    setRetakeModal(null)
    setLoading(true)

    try {
      // Check URL params for retake option if not provided
      let retake: "same" | "new" | undefined = retakeOption
      if (!retake && !isChallengeMode) {
        // Track start time for challenge mode (set early before any early returns)
        if (isChallengeMode && !quizStartTimeRef.current) {
          const startTime = Date.now()
          setQuizStartTime(startTime)
          quizStartTimeRef.current = startTime
        }

        const searchParams = new URLSearchParams(window.location.search)
        const retakeParam = searchParams.get("retake")
        if (retakeParam === "same" || retakeParam === "new") {
          retake = retakeParam
        }
      }

      // Check for incomplete attempt first (for resume) - skip in challenge mode
      const incompleteAttempt = !isChallengeMode ? await getIncompleteQuizAttempt(user.uid, courseId, "course", null, null) : null

      // If incomplete attempt exists and user didn't explicitly request retake, resume it
      if (incompleteAttempt && incompleteAttempt.id && !incompleteAttempt.completedAt && !retake && !isChallengeMode) {
        // Restore from incomplete attempt
        const questionMap = new Map((await fetchQuizQuestions(courseId, "course", null, null)).map(q => [q.questionId, q]))
        const restoredQuestions = incompleteAttempt.questionIds
          .map(id => questionMap.get(id))
          .filter((q): q is QuizQuestion => q !== undefined)

        if (restoredQuestions.length > 0) {
          setQuestions(restoredQuestions)
          setAnswers(incompleteAttempt.answers || {})
          setAttemptId(incompleteAttempt.id)
          
          // Resume from saved question index (exactly where user left off)
          if (incompleteAttempt.currentQuestionIndex !== undefined && incompleteAttempt.currentQuestionIndex !== null && incompleteAttempt.currentQuestionIndex >= 0) {
            setCurrentQuestionIndex(Math.min(incompleteAttempt.currentQuestionIndex, restoredQuestions.length - 1))
          } else {
            // Fallback: find first unanswered question
            const firstUnansweredIndex = restoredQuestions.findIndex(q => !incompleteAttempt.answers?.[q.questionId])
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

      // Check for completed attempt (for retake)
      const recentAttempt = await getMostRecentQuizAttempt(user.uid, courseId, "course", null, null)

      let availableQuestions = await fetchQuizQuestions(courseId, "course", null, null)

      if (availableQuestions.length < QUIZ_COUNT) {
        setGenerating(true)
        const generatedQuestions = await generateCourseQuizQuestions(
          course,
          courseId,
          QUIZ_COUNT * 2
        )
        await saveQuizQuestions(generatedQuestions)
        availableQuestions = await fetchQuizQuestions(courseId, "course", null, null)
      }

      let selectedQuestions: QuizQuestion[]
      if (!isChallengeMode && retake === "same" && recentAttempt && recentAttempt.questionIds.length > 0) {
        const questionMap = new Map(availableQuestions.map(q => [q.questionId, q]))
        selectedQuestions = recentAttempt.questionIds
          .map(id => questionMap.get(id))
          .filter((q): q is QuizQuestion => q !== undefined)
      } else {
        // In challenge mode, always select new random questions
        selectedQuestions = selectRandomQuestions(availableQuestions, QUIZ_COUNT)
      }

      if (selectedQuestions.length === 0) {
        throw new Error("No questions available")
      }

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
        !isChallengeMode && retake === "same"
      )
      setAttemptId(newAttemptId)

    } catch (error) {
      console.error("Error loading quiz:", error)
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
          const correct = checkObjectiveAnswer(question, userAnswer || "")
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
              courseId,
              "course",
              null,
              null,
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
                  courseId,
                  "course",
                  null,
                  null,
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
                    setLoading(true) // Show loading state
                    await abandonQuizAttempt(otherQuizInProgress.id)
                    setAbandonDialogOpen(false)
                    setOtherQuizInProgress(null)
                    // Use router.push to current URL to trigger a clean re-run of logic
                    // This is safer than reload in some Next.js environments
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

  // Show confirmation dialog before starting quiz (must check this first)
  if (showConfirmation && course) {
    const handleConfirmationStart = async () => {
      if (!user) return
      
      // Check for incomplete attempt first (for resume)
      const incompleteAttempt = await getIncompleteQuizAttempt(user.uid, courseId, "course", null, null)
      if (incompleteAttempt && incompleteAttempt.id && !incompleteAttempt.completedAt) {
        // Resume incomplete quiz
        await handleStartQuiz()
        return
      }
      
      // Check for completed attempt (for retake)
      const recentAttempt = await getMostRecentQuizAttempt(user.uid, courseId, "course", null, null)
      if (recentAttempt && recentAttempt.completedAt) {
        // Show retake modal
        setRetakeModal({ open: true })
        return
      }
      
      // Start new quiz
      await handleStartQuiz()
    }

    return (
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav 
          currentPath="/quizzes" 
          title="Quiz Preview"
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
                  <span>Back to Quiz Selection</span>
                </Button>
              </Link>
            </div>
          </header>

          <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
            <Card>
              <CardContent className="p-8">
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">{course.title} - Course Quiz</h1>
                    <p className="text-muted-foreground">{course.description}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-lg">
                      <span className="font-semibold text-foreground">Questions:</span>
                      <span className="text-muted-foreground">{QUIZ_COUNT}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-lg">
                      <span className="font-semibold text-foreground">Estimated Time:</span>
                      <span className="text-muted-foreground">20-30 minutes</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-4">
                    <div className="flex gap-4 justify-center">
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/quizzes/${courseId}`)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="lg"
                        onClick={handleConfirmationStart}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start Quiz
                      </Button>
                    </div>
                    {hasPreviousAttempts && (
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/quizzes/${courseId}/history`)}
                        className="w-full"
                      >
                        <FileQuestion className="mr-2 h-4 w-4" />
                        Review Past Quiz
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {retakeModal && (
          <QuizRetakeModal
            open={retakeModal.open}
            onClose={() => setRetakeModal(null)}
            onRetakeSame={() => handleStartQuiz("same")}
            onNewQuestions={() => handleStartQuiz("new")}
            quizTitle={`${course.title} - Course Quiz`}
            onReviewPast={() => {
              setRetakeModal(null)
              router.push(`/quizzes/${courseId}/history`)
            }}
          />
        )}
      </div>
    )
  }

  if (showResults) {
    const totalScore = Object.values(scores).filter((s) => s.correct).length
    const maxScore = questions.length
    const scorePercentage = Math.round((totalScore / maxScore) * 100)

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
              <div className="text-center">
                <h1 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">Your Score</h1>
                <div className="flex items-center justify-center gap-2 text-6xl font-bold text-foreground lg:text-7xl">
                  <span className="text-primary">{totalScore}/{maxScore}</span>
                  <div className="flex gap-1">
                    {questions.slice(0, 10).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-8 w-8 lg:h-10 lg:w-10 ${
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

  // Loading states
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
