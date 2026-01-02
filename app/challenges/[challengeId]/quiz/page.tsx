"use client"

import { useState, useEffect } from "react"
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
import { getChallenge, acceptChallenge, completeChallenge, getChallengeQuestions, Challenge } from "@/lib/challenge-utils"
import { QuizQuestion, createQuizAttempt, saveQuizAttemptBasic } from "@/lib/quiz-utils"
import { evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
import { doc, getDoc } from "firebase/firestore"
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
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showXPAward } = useXP()

  const challengeId = params.challengeId as string

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

        // Verify this challenge is for the current user
        if (challengeData.challengedId !== user.uid) {
          router.push("/friends")
          return
        }

        // Check if already accepted/completed
        if (challengeData.status !== "pending") {
          router.push(`/challenges/${challengeId}/waiting`)
          return
        }

        setChallenge(challengeData)

        // Accept challenge
        await acceptChallenge(challengeId)

        // Fetch questions (exact same questions as challenger)
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
          false // Not a retake
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

  const handleSubmit = async () => {
    if (!user || !attemptId || !challenge || !quizStartTime) return

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

      // Save quiz attempt (without XP - will be awarded based on challenge result)
      await saveQuizAttemptBasic(attemptId, answers, newScores)

      // Calculate score and time
      const totalScore = Object.values(newScores).filter((s) => s.correct).length
      const timeTaken = Math.floor((Date.now() - quizStartTime) / 1000) // seconds

      // Complete challenge and determine winner
      const { winnerId, challengedXP } = await completeChallenge(challengeId, attemptId, totalScore, timeTaken)

      // Show XP award if user won
      if (winnerId === user.uid && challengedXP > 0) {
        // We'll call a dummy awardXP(0) to get the latest levels and XP totals for the UI
        const { awardXP } = await import("@/lib/xp-utils")
        const xpResult = await awardXP(user.uid, 0, "Challenge Win").then(res => ({
          ...res,
          amount: challengedXP
        }))
        showXPAward(xpResult)
      }

      // Redirect to waiting page to see results
      router.push(`/challenges/${challengeId}/waiting`)
    } catch (error) {
      console.error("Error submitting challenge quiz:", error)
      alert("Failed to submit challenge. Please try again.")
    } finally {
      setSubmitting(false)
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

