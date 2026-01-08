"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { getChallenge, acceptChallenge, recordChallengeResult, getChallengeQuestions, Challenge } from "@/lib/challenge-utils"
import { QuizQuestion, createQuizAttempt, saveQuizAttemptBasic, abandonQuizAttempt } from "@/lib/quiz-utils"
import { evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
import { doc, getDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useXP } from "@/components/xp-context-provider"

export default function ChallengeQuizPage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number | boolean }>({})
  const [scores, setScores] = useState<{ [questionId: string]: { correct: boolean; feedback?: string } }>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [finalTime, setFinalTime] = useState<number | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState<number>(0)
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showXPAward } = useXP()
  const challengeId = params.challengeId as string

  // Refs for auto-submission on leave
  const stateRef = useRef({
    answers,
    questions,
    submitting,
    showResults,
    user,
    attemptId,
    challenge,
    quizStartTime
  })

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = {
      answers,
      questions,
      submitting,
      showResults,
      user,
      attemptId,
      challenge,
      quizStartTime
    }
  }, [answers, questions, submitting, showResults, user, attemptId, challenge, quizStartTime])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    const loadChallenge = async () => {
      try {
        const challengeData = await getChallenge(challengeId)
        if (!challengeData) {
          router.push("/friends")
          return
        }

        // Verify user is part of this challenge
        const isChallenger = challengeData.challengerId === user.uid
        const isChallenged = challengeData.challengedId === user.uid

        if (!isChallenger && !isChallenged) {
          router.push("/friends")
          return
        }

        // Check permissions and status
        if (isChallenged) {
          // Challenged user must accept first if not already accepted
          if (challengeData.status === "pending") {
            await acceptChallenge(challengeId, user.uid)
          } else if (challengeData.status !== "accepted") {
            router.push(`/friends`)
            return
          }
        } else if (isChallenger) {
          // Challenger can only play if they haven't already
          if (challengeData.hasChallengerPlayed) {
            router.push(`/friends`)
            return
          }
        }

        setChallenge(challengeData)

        // Fetch questions (exact same questions for both players)
        const challengeQuestions = await getChallengeQuestions(
          challengeData.courseId,
          challengeData.questionIds
        )

        if (challengeQuestions.length === 0) {
          throw new Error("Failed to load challenge questions")
        }

        setQuestions(challengeQuestions)

        // Create quiz attempt
        const newAttemptId = await createQuizAttempt(
          user.uid,
          challengeData.courseId,
          challengeData.quizType,
          challengeData.questionIds,
          challengeData.moduleIndex,
          challengeData.lessonIndex,
          false, // Not a retake
          true // It IS a challenge!
        )
        setAttemptId(newAttemptId)
        setQuizStartTime(Date.now())
        setLoading(false)
      } catch (error) {
        console.error("Error loading challenge:", error)
        router.push("/friends")
      }
    }

    if (user) {
      loadChallenge()
    }
  }, [challengeId, router, user, authLoading])

  // Timer effect
  useEffect(() => {
    if (!quizStartTime || showResults) return

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizStartTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [quizStartTime, showResults])

  // Auto-submit on leave
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!stateRef.current.showResults && stateRef.current.quizStartTime && !stateRef.current.submitting) {
        // Warn the user that leaving will submit their current progress
        e.preventDefault()
        e.returnValue = ""
      }
    }

    const performAutoSubmit = async () => {
      const { showResults, submitting, quizStartTime, questions } = stateRef.current
      if (!showResults && !submitting && quizStartTime && questions.length > 0) {
        console.log("Auto-submitting challenge quiz due to navigation/leave...")
        // Call handleSubmit with autoSubmit flag
        await handleSubmit(true)
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      // Trigger auto-submit when user navigates away within the app
      performAutoSubmit()
    }
  }, [])

  // Navigation warning for client-side links (Sidebar, etc.)
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      // Don't warn if quiz is not loaded, is being submitted, or results are already shown
      if (!stateRef.current.quizStartTime || stateRef.current.showResults || stateRef.current.submitting) {
        return
      }

      const target = e.target as HTMLElement
      const anchor = target.closest("a")

      if (anchor) {
        // Only warn for internal links that would cause navigation away
        const href = anchor.getAttribute("href")
        if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.includes(challengeId)) {
          if (!window.confirm("Are you sure you want to leave? Your progress will be automatically submitted.")) {
            e.preventDefault()
            e.stopImmediatePropagation()
          }
        }
      }
    }

    // Use capturing phase to intercept before Next.js Link handles it
    document.addEventListener("click", handleAnchorClick, true)
    return () => document.removeEventListener("click", handleAnchorClick, true)
  }, [challengeId])

  const handleAnswerChange = (questionId: string, answer: string | number | boolean) => {
    setAnswers({
      ...answers,
      [questionId]: answer,
    })
  }

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  const handleSubmit = async (isAutoSubmit = false) => {
    // Use either current state or ref state for auto-submit
    const currentAnswers = isAutoSubmit ? stateRef.current.answers : answers
    const currentQuestions = isAutoSubmit ? stateRef.current.questions : questions
    const currentUser = isAutoSubmit ? stateRef.current.user : user
    const currentAttemptId = isAutoSubmit ? stateRef.current.attemptId : attemptId
    const currentChallenge = isAutoSubmit ? stateRef.current.challenge : challenge
    const currentStartTime = isAutoSubmit ? stateRef.current.quizStartTime : quizStartTime

    if (!currentUser || !currentAttemptId || !currentChallenge || !currentStartTime) return
    if (!isAutoSubmit && submitting) return

    if (!isAutoSubmit) setSubmitting(true)

    try {
      const newScores: { [questionId: string]: { correct: boolean; feedback?: string; marks?: number } } = {}

      for (const question of currentQuestions) {
        const userAnswer = currentAnswers[question.questionId]

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
              marks: evaluation.score,
            }
          } else {
            newScores[question.questionId] = { correct: false, feedback: "No answer provided" }
          }
        }
      }

      if (!isAutoSubmit) setScores(newScores)

      // Save quiz attempt basic data first (so other functions can read it if needed)
      await saveQuizAttemptBasic(currentAttemptId, currentAnswers, newScores)

      // Calculate score and time
      const totalScore = Object.values(newScores).reduce((sum, s) => {
        if (s.marks !== undefined) return sum + s.marks
        return sum + (s.correct ? 1 : 0)
      }, 0)
      
      const timeTaken = Math.floor((Date.now() - currentStartTime) / 1000) // seconds
      setFinalTime(timeTaken)

      // Record results and check for completion
      const { isCompleted, winnerId, challengedXPAwardResult } = await recordChallengeResult(
        challengeId,
        currentUser.uid,
        currentAttemptId,
        totalScore,
        timeTaken
      )

      // Show XP award if challenge completed and user won
      if (isCompleted && winnerId === currentUser.uid && challengedXPAwardResult) {
        showXPAward(challengedXPAwardResult)
      }

      // Delete the attempt record from quizAttempts collection as requested
      try {
        await deleteDoc(doc(db, "quizAttempts", currentAttemptId))
      } catch (error) {
        console.error("Error deleting challenge attempt record:", error)
      }

      // Show local results briefly or redirect
      if (!isAutoSubmit) setShowResults(true)
    } catch (error) {
      console.error("Error submitting challenge quiz:", error)
      if (!isAutoSubmit) alert("Failed to submit challenge. Please try again.")
    } finally {
      if (!isAutoSubmit) setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading challenge...</p>
        </div>
      </div>
    )
  }

  if (!challenge || questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Challenge not found</p>
          <Link href="/friends">
            <Button>Go to Friends</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (showResults) {
    const totalScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) return sum + s.marks
      return sum + (s.correct ? 1 : 0)
    }, 0)
    const maxScore = questions.reduce((sum, q) => {
      if (q.type === "subjective") return sum + 4
      return sum + 1
    }, 0)
    const scorePercentage = Math.round((totalScore / maxScore) * 100)

    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-3xl font-bold">Quiz Results</h1>
            
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-8 text-center space-y-4">
                <div className="text-5xl font-bold text-primary">{scorePercentage}%</div>
                <p className="text-xl text-muted-foreground">
                  You scored {totalScore} out of {maxScore} points
                </p>
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Clock className="h-5 w-5" />
                  <span>Time taken: {Math.floor((finalTime || elapsedTime) / 60)}:{((finalTime || elapsedTime) % 60).toString().padStart(2, "0")}</span>
                </div>
                <Button 
                  className="mt-4" 
                  onClick={() => router.push(`/friends`)}
                >
                  Continue to Social
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Question Review</h2>
              {questions.map((q, idx) => {
                const score = scores[q.questionId]
                const answer = answers[q.questionId]
                return (
                  <Card key={q.questionId} className={score?.correct ? "border-green-500/50" : "border-red-500/50"}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <p className="font-medium">
                          {idx + 1}. {q.question}
                        </p>
                        {score?.correct ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="text-muted-foreground">Your Answer: </span>
                          <span className={score?.correct ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {String(answer || "No answer")}
                          </span>
                        </p>
                        {!score?.correct && q.type === "objective" && (
                          <p>
                            <span className="text-muted-foreground">Correct Answer: </span>
                            <span className="text-green-600 dark:text-green-400">
                              {q.objectiveType === "multiple-choice" && q.options && typeof q.correctAnswer === "number"
                                ? q.options[q.correctAnswer]
                                : String(q.correctAnswer)}
                            </span>
                          </p>
                        )}
                        {q.type === "subjective" && (
                          <>
                            <p className="text-muted-foreground mt-2">Feedback:</p>
                            <p className="p-2 bg-muted rounded italic">{score?.feedback || "No feedback provided."}</p>
                            <p className="font-semibold mt-1 text-primary">Points: {score?.marks || 0}/4</p>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </main>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length
  const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <SidebarNav currentPath="/friends" />
      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Link href="/friends">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Challenge Quiz</h1>
                <p className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </p>
              </div>
              {quizStartTime && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="font-mono font-semibold text-lg">
                    {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Question Card */}
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">{currentQuestion.question}</h2>

                  {currentQuestion.type === "objective" && currentQuestion.options && (
                    <RadioGroup
                      value={answers[currentQuestion.questionId]?.toString() || ""}
                      onValueChange={(value) => handleAnswerChange(currentQuestion.questionId, value)}
                    >
                      {currentQuestion.options.map((option, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <RadioGroupItem value={option} id={`option-${idx}`} />
                          <Label htmlFor={`option-${idx}`} className="cursor-pointer flex-1">
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {currentQuestion.type === "subjective" && (
                    <Textarea
                      value={answers[currentQuestion.questionId]?.toString() || ""}
                      onChange={(e) => handleAnswerChange(currentQuestion.questionId, e.target.value)}
                      placeholder="Type your answer here..."
                      className="min-h-32"
                    />
                  )}
                </div>

                {/* Navigation */}
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentQuestionIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  {currentQuestionIndex === totalQuestions - 1 ? (
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit Challenge"}
                    </Button>
                  ) : (
                    <Button onClick={handleNext}>
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
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

