"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, XCircle, ChevronRight, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import {
  getChallenge,
  acceptChallenge,
  recordChallengeResult,
  getChallengeQuestions,
  Challenge,
} from "@/lib/challenge-utils"
import {
  QuizQuestion,
  createQuizAttempt,
  saveQuizAttemptBasic,
} from "@/lib/quiz-utils"
import { evaluateSubjectiveAnswer, checkObjectiveAnswer } from "@/lib/quiz-generator"
import { doc, getDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useXP } from "@/components/xp-context-provider"
import { ChallengeReadyRoom } from "@/components/challenge/challenge-ready-room"
import { ChallengeQuizOverlay } from "@/components/challenge/challenge-quiz-overlay"
import { useChallengeQuizFx } from "@/hooks/use-challenge-quiz-fx"
import { calculatePerformanceScore } from "@/lib/challenge-scoring"
import { cn } from "@/lib/utils"

type Phase = "loading" | "ready" | "playing" | "results"

export default function ChallengeQuizPage() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [courseTitle, setCourseTitle] = useState("")
  const [friendNickname, setFriendNickname] = useState("Friend")
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number | boolean }>({})
  const [scores, setScores] = useState<{
    [questionId: string]: { correct: boolean; feedback?: string; marks?: number }
  }>({})
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finalTime, setFinalTime] = useState<number | null>(null)
  const [finalPerformance, setFinalPerformance] = useState<number | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [tabSwitchSubmitted, setTabSwitchSubmitted] = useState(false)

  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showXPAward } = useXP()
  const challengeId = params.challengeId as string

  const isChallenger = challenge?.challengerId === user?.uid
  const isChallenged = challenge?.challengedId === user?.uid

  const fx = useChallengeQuizFx(currentQuestionIndex, questions.length)

  const stateRef = useRef({
    answers,
    questions,
    submitting,
    phase,
    user,
    attemptId,
    challenge,
    quizStartTime,
    comboMultiplier: fx.comboMultiplier,
    tabSwitchSubmitted,
  })

  useEffect(() => {
    stateRef.current = {
      answers,
      questions,
      submitting,
      phase,
      user,
      attemptId,
      challenge,
      quizStartTime,
      comboMultiplier: fx.comboMultiplier,
      tabSwitchSubmitted,
    }
  }, [
    answers,
    questions,
    submitting,
    phase,
    user,
    attemptId,
    challenge,
    quizStartTime,
    fx.comboMultiplier,
    tabSwitchSubmitted,
  ])

  const loadChallengeMeta = useCallback(async () => {
    if (!user) return

    const challengeData = await getChallenge(challengeId)
    if (!challengeData) {
      router.push("/friends")
      return
    }

    const isC = challengeData.challengerId === user.uid
    const isD = challengeData.challengedId === user.uid
    if (!isC && !isD) {
      router.push("/friends")
      return
    }

    if (isC && challengeData.hasChallengerPlayed) {
      router.push("/friends")
      return
    }
    if (isD && challengeData.challengedScore !== null) {
      router.push("/friends")
      return
    }
    if (
      challengeData.status === "rejected" ||
      challengeData.status === "expired" ||
      challengeData.status === "completed"
    ) {
      router.push("/friends")
      return
    }

    const courseSnap = await getDoc(doc(db, "courses", challengeData.courseId))
    setCourseTitle(courseSnap.data()?.title || "Course")

    const opponentId = isC ? challengeData.challengedId : challengeData.challengerId
    const opponentSnap = await getDoc(doc(db, "users", opponentId))
    setFriendNickname(opponentSnap.data()?.nickname || "Friend")

    setChallenge(challengeData)
    setPhase("ready")
  }, [challengeId, router, user])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push("/auth")
      return
    }
    loadChallengeMeta().catch(() => router.push("/friends"))
  }, [authLoading, user, loadChallengeMeta, router])

  const beginQuiz = async () => {
    if (!user || !challenge) return
    setStarting(true)
    try {
      let activeChallenge = challenge
      if (isChallenged && activeChallenge.status === "pending") {
        await acceptChallenge(challengeId, user.uid)
        const refreshed = await getChallenge(challengeId)
        if (!refreshed) throw new Error("Challenge not found after accept")
        activeChallenge = refreshed
        setChallenge(refreshed)
      } else if (
        isChallenged &&
        activeChallenge.status !== "accepted" &&
        activeChallenge.status !== "pending"
      ) {
        throw new Error("Challenge is no longer available")
      }

      const challengeQuestions = await getChallengeQuestions(
        activeChallenge.courseId,
        activeChallenge.questionIds
      )
      if (challengeQuestions.length === 0) {
        throw new Error("Failed to load challenge questions")
      }

      const newAttemptId = await createQuizAttempt(
        user.uid,
        activeChallenge.courseId,
        activeChallenge.quizType,
        activeChallenge.questionIds,
        activeChallenge.moduleIndex,
        activeChallenge.lessonIndex,
        false,
        true
      )

      setQuestions(challengeQuestions)
      setAttemptId(newAttemptId)
      setQuizStartTime(Date.now())
      setPhase("playing")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not start challenge"
      alert(message)
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    if (phase !== "playing" || !quizStartTime) return
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, quizStartTime])

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      const currentAnswers = isAutoSubmit ? stateRef.current.answers : answers
      const currentQuestions = isAutoSubmit ? stateRef.current.questions : questions
      const currentUser = isAutoSubmit ? stateRef.current.user : user
      const currentAttemptId = isAutoSubmit ? stateRef.current.attemptId : attemptId
      const currentChallenge = isAutoSubmit ? stateRef.current.challenge : challenge
      const currentStartTime = isAutoSubmit ? stateRef.current.quizStartTime : quizStartTime
      const comboMult = isAutoSubmit
        ? stateRef.current.comboMultiplier
        : fx.comboMultiplier

      if (!currentUser || !currentAttemptId || !currentChallenge || !currentStartTime) return
      if (!isAutoSubmit && submitting) return
      if (isAutoSubmit && stateRef.current.tabSwitchSubmitted) return

      if (isAutoSubmit) setTabSwitchSubmitted(true)
      if (!isAutoSubmit) setSubmitting(true)

      try {
        const newScores: {
          [questionId: string]: { correct: boolean; feedback?: string; marks?: number }
        } = {}

        for (const question of currentQuestions) {
          const userAnswer = currentAnswers[question.questionId]
          if (question.type === "objective") {
            const correct = checkObjectiveAnswer(question, userAnswer)
            newScores[question.questionId] = { correct }
          } else if (userAnswer && typeof userAnswer === "string") {
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

        if (!isAutoSubmit) setScores(newScores)
        await saveQuizAttemptBasic(currentAttemptId, currentAnswers, newScores)

        const totalScore = Object.values(newScores).reduce((sum, s) => {
          if (s.marks !== undefined) return sum + s.marks
          return sum + (s.correct ? 1 : 0)
        }, 0)

        const timeTaken = Math.floor((Date.now() - currentStartTime) / 1000)
        setFinalTime(timeTaken)
        setFinalPerformance(calculatePerformanceScore(totalScore, comboMult, timeTaken))

        const { isCompleted, winnerId, isDraw, challengedXPAwardResult } =
          await recordChallengeResult(
            challengeId,
            currentUser.uid,
            currentAttemptId,
            totalScore,
            timeTaken,
            comboMult
          )

        if (isCompleted && !isDraw && winnerId === currentUser.uid && challengedXPAwardResult) {
          showXPAward(challengedXPAwardResult)
        }

        try {
          await deleteDoc(doc(db, "quizAttempts", currentAttemptId))
        } catch (error) {
          console.error("Error deleting challenge attempt record:", error)
        }

        fx.stopAmbientPulse()
        if (!isAutoSubmit) {
          setScores(newScores)
          setPhase("results")
        } else {
          router.push("/friends")
        }
      } catch (error) {
        console.error("Error submitting challenge quiz:", error)
        if (!isAutoSubmit) alert("Failed to submit challenge. Please try again.")
      } finally {
        if (!isAutoSubmit) setSubmitting(false)
      }
    },
    [
      answers,
      questions,
      user,
      attemptId,
      challenge,
      quizStartTime,
      fx,
      challengeId,
      showXPAward,
      submitting,
      router,
    ]
  )

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return
      if (stateRef.current.phase !== "playing") return
      if (stateRef.current.submitting || stateRef.current.tabSwitchSubmitted) return
      if (!stateRef.current.quizStartTime) return
      void handleSubmit(true)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [handleSubmit])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current.phase === "playing" && stateRef.current.quizStartTime) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    const performAutoSubmit = () => {
      if (
        stateRef.current.phase === "playing" &&
        !stateRef.current.submitting &&
        stateRef.current.quizStartTime &&
        stateRef.current.questions.length > 0
      ) {
        void handleSubmit(true)
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      performAutoSubmit()
    }
  }, [handleSubmit])

  const gradeAnswerForFx = (question: QuizQuestion, answer: string | number | boolean | undefined) => {
    if (answer === undefined || answer === "") return
    if (question.type === "objective") {
      if (checkObjectiveAnswer(question, answer)) fx.onCorrectAnswer()
      else fx.onWrongAnswer()
    }
  }

  const handleAnswerChange = (question: QuizQuestion, answer: string | number | boolean) => {
    setAnswers((prev) => ({ ...prev, [question.questionId]: answer }))
    if (question.type === "objective") {
      gradeAnswerForFx(question, answer)
    }
  }

  const handleNext = async () => {
    const q = questions[currentQuestionIndex]
    if (q?.type === "subjective") {
      const ans = answers[q.questionId]
      if (ans && typeof ans === "string") {
        const evaluation = await evaluateSubjectiveAnswer(
          q.question,
          ans,
          q.suggestedAnswer || ""
        )
        if (evaluation.correct || (evaluation.score ?? 0) >= 2) fx.onCorrectAnswer()
        else fx.onWrongAnswer()
      }
    }
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) setCurrentQuestionIndex(currentQuestionIndex - 1)
  }

  if (authLoading || phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Link href="/friends">
          <Button>Go to Friends</Button>
        </Link>
      </div>
    )
  }

  if (phase === "ready") {
    return (
      <ChallengeReadyRoom
        challenge={challenge}
        isChallenger={!!isChallenger}
        friendNickname={friendNickname}
        courseTitle={courseTitle}
        starting={starting}
        onStart={beginQuiz}
        onBack={() => router.push("/friends")}
      />
    )
  }

  if (phase === "results") {
    const totalScore = Object.values(scores).reduce((sum, s) => {
      if (s.marks !== undefined) return sum + s.marks
      return sum + (s.correct ? 1 : 0)
    }, 0)
    const maxScore = questions.reduce((sum, q) => {
      if (q.type === "subjective") return sum + 4
      return sum + 1
    }, 0)
    const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-3xl font-bold">Challenge Results</h1>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-8 text-center space-y-4">
                <div className="text-5xl font-bold text-primary">{scorePercentage}%</div>
                <p className="text-xl text-muted-foreground">
                  {totalScore} / {maxScore} points · Combo ×{fx.comboMultiplier.toFixed(1)}
                </p>
                {finalPerformance != null && (
                  <p className="text-sm text-muted-foreground">
                    Competitive score: <strong>{finalPerformance.toLocaleString()}</strong>
                  </p>
                )}
                <p className="text-muted-foreground">
                  Time: {Math.floor((finalTime || elapsedTime) / 60)}:
                  {((finalTime || elapsedTime) % 60).toString().padStart(2, "0")}
                </p>
                <Button onClick={() => router.push("/friends")}>Back to Social</Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100

  return (
    <div
      className={cn(
        "flex flex-col lg:flex-row min-h-screen bg-background relative",
        fx.answerFx === "correct" && "challenge-shake-correct",
        fx.answerFx === "wrong" && "challenge-shake-wrong"
      )}
    >
      <ChallengeQuizOverlay
        answerFx={fx.answerFx}
        comboStreak={fx.comboStreak}
        comboMultiplier={fx.comboMultiplier}
        comboTimeLeft={fx.comboTimeLeft}
        timerPulse={fx.timerPulse}
        elapsedTime={elapsedTime}
      />
      <SidebarNav currentPath="/friends" />
      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/friends">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Challenge Quiz</h1>
                <p className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </p>
              </div>
            </div>

            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <Card>
              <CardContent className="p-6 space-y-6">
                <h2 className="text-xl font-semibold">{currentQuestion.question}</h2>

                {currentQuestion.type === "objective" && currentQuestion.options && (
                  <RadioGroup
                    value={answers[currentQuestion.questionId]?.toString() || ""}
                    onValueChange={(value) => handleAnswerChange(currentQuestion, value)}
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
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [currentQuestion.questionId]: e.target.value,
                      }))
                    }
                    placeholder="Type your answer here..."
                    className="min-h-32"
                  />
                )}

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentQuestionIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  {currentQuestionIndex === questions.length - 1 ? (
                    <Button onClick={() => handleSubmit(false)} disabled={submitting}>
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
