"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
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
import { ChallengeTabAwayModal } from "@/components/challenge/challenge-tab-away-modal"
import { useChallengeQuizFx } from "@/hooks/use-challenge-quiz-fx"
import { calculatePerformanceScore } from "@/lib/challenge-scoring"
import { toast } from "sonner"

const TAB_AWAY_GRACE_MS = 5000
const LEAVE_CONFIRM_MESSAGE =
  "Leaving will auto-submit your challenge with your current answers. Continue?"

type Phase = "loading" | "ready" | "playing" | "results"

type QuestionScore = { correct: boolean; feedback?: string; marks?: number }

export default function ChallengeQuizPage() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [courseTitle, setCourseTitle] = useState("")
  const [friendNickname, setFriendNickname] = useState("Friend")
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number | boolean }>({})
  const [scores, setScores] = useState<{ [questionId: string]: QuestionScore }>({})
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [gradingNext, setGradingNext] = useState(false)
  const [finalTime, setFinalTime] = useState<number | null>(null)
  const [finalPerformance, setFinalPerformance] = useState<number | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [tabAwayOpen, setTabAwayOpen] = useState(false)
  const [tabAwaySeconds, setTabAwaySeconds] = useState(5)

  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showXPAward } = useXP()
  const challengeId = params.challengeId as string

  const isChallenger = challenge?.challengerId === user?.uid
  const isChallenged = challenge?.challengedId === user?.uid

  const fx = useChallengeQuizFx(currentQuestionIndex, questions.length)
  const tabAwayDeadlineRef = useRef<number | null>(null)
  const submitLockRef = useRef(false)
  const phaseRef = useRef(phase)
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

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
    setStartError(null)
    submitLockRef.current = false
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

      const challengeQuestions = await getChallengeQuestions(activeChallenge)
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
      setAnswers({})
      setScores({})
      setCurrentQuestionIndex(0)
      setAttemptId(newAttemptId)
      setQuizStartTime(Date.now())
      setPhase("playing")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not start challenge"
      setStartError(message)
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

  const applyQuestionFeedback = useCallback(
    (score: QuestionScore) => {
      const isCorrect =
        score.correct || (score.marks !== undefined && score.marks >= 2)
      if (isCorrect) fx.onCorrectAnswer()
      else fx.onWrongAnswer()
    },
    [fx]
  )

  const gradeQuestion = useCallback(
    async (question: QuizQuestion): Promise<QuestionScore | null> => {
      const userAnswer = answers[question.questionId]
      if (userAnswer === undefined || userAnswer === "") return null

      if (question.type === "objective") {
        return { correct: checkObjectiveAnswer(question, userAnswer) }
      }

      if (typeof userAnswer === "string" && userAnswer.trim()) {
        const evaluation = await evaluateSubjectiveAnswer(
          question.question,
          userAnswer,
          question.suggestedAnswer || ""
        )
        return {
          correct: evaluation.correct,
          feedback: evaluation.feedback,
          marks: evaluation.score,
        }
      }

      return { correct: false, feedback: "No answer provided" }
    },
    [answers]
  )

  const handleSubmit = useCallback(async () => {
    if (!user || !attemptId || !challenge || !quizStartTime) return
    if (submitLockRef.current || submitting) return
    submitLockRef.current = true
    setSubmitting(true)
    setTabAwayOpen(false)
    tabAwayDeadlineRef.current = null

    try {
      const newScores: { [questionId: string]: QuestionScore } = { ...scores }

      for (const question of questions) {
        if (newScores[question.questionId]) continue
        const graded = await gradeQuestion(question)
        if (graded) {
          newScores[question.questionId] = graded
        } else {
          newScores[question.questionId] = { correct: false, feedback: "No answer provided" }
        }
      }

      setScores(newScores)
      await saveQuizAttemptBasic(attemptId, answers, newScores)

      const totalScore = Object.values(newScores).reduce((sum, s) => {
        if (s.marks !== undefined) return sum + s.marks
        return sum + (s.correct ? 1 : 0)
      }, 0)

      const timeTaken = Math.floor((Date.now() - quizStartTime) / 1000)
      setFinalTime(timeTaken)
      const peakCombo = fx.peakComboMultiplier
      setFinalPerformance(calculatePerformanceScore(totalScore, peakCombo, timeTaken))

      const { isCompleted, winnerId, isDraw, challengedXPAwardResult } =
        await recordChallengeResult(
          challengeId,
          user.uid,
          attemptId,
          totalScore,
          timeTaken,
          peakCombo
        )

      if (isCompleted && !isDraw && winnerId === user.uid && challengedXPAwardResult) {
        showXPAward(challengedXPAwardResult)
      }

      try {
        await deleteDoc(doc(db, "quizAttempts", attemptId))
      } catch (error) {
        console.error("Error deleting challenge attempt record:", error)
      }

      fx.stopAmbientPulse()
      setPhase("results")
    } catch (error) {
      console.error("Error submitting challenge quiz:", error)
      submitLockRef.current = false
      alert("Failed to submit challenge. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }, [
    answers,
    questions,
    scores,
    user,
    attemptId,
    challenge,
    quizStartTime,
    fx,
    challengeId,
    showXPAward,
    submitting,
    gradeQuestion,
  ])

  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  }, [handleSubmit])

  const confirmAndLeave = useCallback(
    async (href: string) => {
      if (!window.confirm(LEAVE_CONFIRM_MESSAGE)) return
      setTabAwayOpen(false)
      tabAwayDeadlineRef.current = null
      await handleSubmitRef.current()
      router.push(href)
    },
    [router]
  )

  useEffect(() => {
    if (phase !== "playing") return

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        tabAwayDeadlineRef.current = Date.now() + TAB_AWAY_GRACE_MS
        setTabAwaySeconds(5)
        setTabAwayOpen(true)
        return
      }

      if (tabAwayDeadlineRef.current && Date.now() < tabAwayDeadlineRef.current) {
        tabAwayDeadlineRef.current = null
        setTabAwayOpen(false)
      }
    }

    const onPageHide = () => {
      if (phaseRef.current === "playing" && !submitLockRef.current) {
        void handleSubmitRef.current()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", onPageHide)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [phase])

  useEffect(() => {
    if (!tabAwayOpen || !tabAwayDeadlineRef.current) return

    const tick = () => {
      const deadline = tabAwayDeadlineRef.current
      if (!deadline) return

      const msLeft = deadline - Date.now()
      if (msLeft <= 0) {
        tabAwayDeadlineRef.current = null
        setTabAwayOpen(false)
        void handleSubmitRef.current()
        return
      }
      setTabAwaySeconds(Math.max(1, Math.ceil(msLeft / 1000)))
    }

    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [tabAwayOpen])

  useEffect(() => {
    if (phase !== "playing" || submitting) return

    const onCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
      if (href.includes(`/challenges/${challengeId}`)) return

      e.preventDefault()
      e.stopPropagation()
      void confirmAndLeave(href)
    }

    document.addEventListener("click", onCaptureClick, true)
    return () => document.removeEventListener("click", onCaptureClick, true)
  }, [phase, submitting, challengeId, confirmAndLeave])

  const handleAnswerChange = (questionId: string, answer: string | number | boolean) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  const handleNext = async () => {
    const q = questions[currentQuestionIndex]
    if (!q || gradingNext || submitting) return

    const userAnswer = answers[q.questionId]
    if (userAnswer === undefined || userAnswer === "") {
      toast.error("Select or enter an answer before continuing.")
      return
    }

    setGradingNext(true)
    try {
      const graded = await gradeQuestion(q)
      if (!graded) {
        toast.error("Select or enter an answer before continuing.")
        return
      }

      setScores((prev) => ({ ...prev, [q.questionId]: graded }))
      applyQuestionFeedback(graded)

      await new Promise((r) => setTimeout(r, 400))

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1)
      }
    } finally {
      setGradingNext(false)
    }
  }

  const handleFinalSubmit = async () => {
    const q = questions[currentQuestionIndex]
    if (!q || gradingNext || submitting) return

    const userAnswer = answers[q.questionId]
    if (userAnswer === undefined || userAnswer === "") {
      toast.error("Select or enter an answer before submitting.")
      return
    }

    if (!scores[q.questionId]) {
      setGradingNext(true)
      try {
        const graded = await gradeQuestion(q)
        if (!graded) {
          toast.error("Select or enter an answer before submitting.")
          return
        }
        setScores((prev) => ({ ...prev, [q.questionId]: graded }))
        applyQuestionFeedback(graded)
        await new Promise((r) => setTimeout(r, 400))
      } finally {
        setGradingNext(false)
      }
    }

    await handleSubmit()
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
        <Button onClick={() => router.push("/friends")}>Go to Friends</Button>
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
        startError={startError}
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
                  {totalScore} / {maxScore} points · Peak combo ×{fx.peakComboMultiplier.toFixed(1)}
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
  const isLastQuestion = currentQuestionIndex === questions.length - 1

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background relative">
      <ChallengeTabAwayModal open={tabAwayOpen} secondsLeft={tabAwaySeconds} />
      <ChallengeQuizOverlay
        answerFx={fx.answerFx}
        comboStreak={fx.comboStreak}
        comboMultiplier={fx.comboMultiplier}
        peakComboMultiplier={fx.peakComboMultiplier}
        comboTimeLeft={fx.comboTimeLeft}
        timerPulse={fx.timerPulse}
        elapsedTime={elapsedTime}
      />
      <SidebarNav currentPath="/friends" />
      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void confirmAndLeave("/friends")}
                aria-label="Leave challenge"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Challenge Quiz</h1>
                <p className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {questions.length} — answers lock when
                  you press Next
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
                    onValueChange={(value) =>
                      handleAnswerChange(currentQuestion.questionId, value)
                    }
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
                      handleAnswerChange(currentQuestion.questionId, e.target.value)
                    }
                    placeholder="Type your answer here..."
                    className="min-h-32"
                  />
                )}

                <div className="flex justify-end">
                  {isLastQuestion ? (
                    <Button
                      onClick={() => void handleFinalSubmit()}
                      disabled={submitting || gradingNext}
                    >
                      {submitting
                        ? "Submitting..."
                        : gradingNext
                          ? "Checking..."
                          : "Submit Challenge"}
                    </Button>
                  ) : (
                    <Button onClick={() => void handleNext()} disabled={gradingNext || submitting}>
                      {gradingNext ? (
                        <>
                          <Spinner className="h-4 w-4 mr-2" />
                          Checking...
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </>
                      )}
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
