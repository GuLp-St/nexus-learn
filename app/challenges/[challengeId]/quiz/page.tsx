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
import { useChatContext } from "@/context/ChatContext"
import {
  getChallenge,
  acceptChallenge,
  recordChallengeResult,
  getChallengeQuestions,
  subscribeToChallenge,
  markChallengeReady,
  scheduleLiveMatchStart,
  updateChallengeLiveProgress,
  useChallengePowerAction,
  updateChallengeComboStreak,
  isPoweredChallenge,
  normalizeChallengeSettings,
  CHALLENGE_ACTIONS_PER_PLAYER,
  Challenge,
} from "@/lib/challenge-utils"
import { applyPowerEffectsToQuestion } from "@/lib/challenge-powered-actions"
import type { PowerActionType } from "@/lib/challenge-powered-actions"
import { ChallengeActionsPanel } from "@/components/challenge/challenge-actions-panel"
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
import { useQuizLeaveWarning } from "@/hooks/use-quiz-leave-warning"
import { useChallengeActionFx } from "@/hooks/use-challenge-action-fx"
import { toast } from "sonner"
import { Eye } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [questionShake, setQuestionShake] = useState(false)
  const liveStartTriggeredRef = useRef(false)
  const prevOppEffectsRef = useRef<string>("")
  const prevSelfEffectsRef = useRef<string>("")

  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatContext()
  const { showXPAward } = useXP()
  const challengeId = params.challengeId as string

  const isChallenger = challenge?.challengerId === user?.uid
  const isChallenged = challenge?.challengedId === user?.uid
  const challengeSettings = normalizeChallengeSettings(challenge?.settings)
  const isPowered = isPoweredChallenge(challengeSettings)
  const actionsLeft = isChallenger
    ? (challenge?.challengerActionsLeft ?? CHALLENGE_ACTIONS_PER_PLAYER)
    : (challenge?.challengedActionsLeft ?? CHALLENGE_ACTIONS_PER_PLAYER)

  const selfEffects = isChallenger
    ? challenge?.challengerEffects
    : challenge?.challengedEffects

  const opponentEffects = isChallenger
    ? challenge?.challengedEffects
    : challenge?.challengerEffects

  const liveComboStreak = isChallenger
    ? challenge?.challengerComboStreak
    : challenge?.challengedComboStreak

  const opponentLiveIndex = isChallenger
    ? challenge?.challengedLiveIndex
    : challenge?.challengerLiveIndex

  const sabotageActive =
    isPowered &&
    !!challenge?.sabotageUntil &&
    challenge.sabotageUntil.toMillis() > Date.now() &&
    challenge.sabotageBy !== user?.uid

  const fx = useChallengeQuizFx(
    currentQuestionIndex,
    questions.length,
    challengeSettings?.bpm !== false
  )
  const actionFx = useChallengeActionFx()
  const tabAwayDeadlineRef = useRef<number | null>(null)
  const submitLockRef = useRef(false)
  const phaseRef = useRef(phase)
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (phase !== "playing" || questions.length === 0) {
      setPageContext(null)
      return
    }
    const q = questions[currentQuestionIndex]
    const chips: string[] = []
    if (fx.comboStreak >= 3) {
      chips.push("What happens if I lose my combo?")
    } else {
      chips.push("Help me understand this question")
    }
    setPageContext({
      title: `Challenge Quiz vs ${friendNickname}`,
      description: `1v1 challenge quiz. Peak combo ×${fx.peakComboMultiplier.toFixed(1)}, current streak ${fx.comboStreak}.`,
      suggestedChips: chips,
      activeFocus: q
        ? { type: "quiz-question", id: q.questionId, content: q.question }
        : null,
      pageData: {
        challengeId,
        currentQuestionIndex,
        totalQuestions: questions.length,
        comboStreak: fx.comboStreak,
        peakComboMultiplier: fx.peakComboMultiplier,
        currentQuestion: q
          ? {
              questionId: q.questionId,
              question: q.question,
              type: q.type,
              options: q.options,
            }
          : undefined,
      },
    })
    return () => setPageContext(null)
  }, [
    phase,
    questions,
    currentQuestionIndex,
    friendNickname,
    challengeId,
    fx.comboStreak,
    fx.peakComboMultiplier,
    setPageContext,
  ])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push("/auth")
      return
    }

    const unsub = subscribeToChallenge(challengeId, (data) => {
      if (!data) {
        router.push("/friends")
        return
      }

      const isC = data.challengerId === user.uid
      const isD = data.challengedId === user.uid
      if (!isC && !isD) {
        router.push("/friends")
        return
      }

      if (isC && data.hasChallengerPlayed) {
        router.push("/friends")
        return
      }
      if (isD && data.challengedScore !== null) {
        router.push("/friends")
        return
      }
      if (data.status === "rejected" || data.status === "expired" || data.status === "completed") {
        router.push("/friends")
        return
      }

      setChallenge(data)

      if (phaseRef.current === "loading") {
        void (async () => {
          const courseSnap = await getDoc(doc(db, "courses", data.courseId))
          setCourseTitle(courseSnap.data()?.title || "Course")
          const opponentId = isC ? data.challengedId : data.challengerId
          const opponentSnap = await getDoc(doc(db, "users", opponentId))
          setFriendNickname(opponentSnap.data()?.nickname || "Friend")
          setPhase("ready")
        })()
      }
    })

    return () => unsub()
  }, [authLoading, user, challengeId, router])

  const beginQuiz = async () => {
    if (!user || !challenge) return
    if (isPowered) {
      if (challenge.status !== "accepted") {
        setStartError("Waiting for your opponent to accept the challenge.")
        return
      }
      if (!challenge.challengerReady || !challenge.challengedReady) {
        setStartError("Both players must mark ready before the duel starts.")
        return
      }
      const startMs = challenge.liveStartAt?.toMillis()
      if (startMs && Date.now() < startMs) {
        setStartError("Match has not started yet.")
        return
      }
    }

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

  const handleMarkReady = async () => {
    if (!user) return
    try {
      await markChallengeReady(challengeId, user.uid)
      await scheduleLiveMatchStart(challengeId)
      toast.success("You're ready!")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not mark ready")
    }
  }

  const handleAcceptInLobby = async () => {
    if (!user) return
    setAccepting(true)
    setStartError(null)
    try {
      await acceptChallenge(challengeId, user.uid)
      toast.success("Challenge accepted!")
    } catch (error: unknown) {
      setStartError(error instanceof Error ? error.message : "Could not accept")
    } finally {
      setAccepting(false)
    }
  }

  useEffect(() => {
    if (!challenge || !isPowered || phase !== "ready") return
    if (
      challenge.status === "accepted" &&
      challenge.challengerReady &&
      challenge.challengedReady
    ) {
      void scheduleLiveMatchStart(challengeId)
    }
  }, [challenge, isPowered, phase, challengeId])

  useEffect(() => {
    if (!challenge?.liveStartAt || phase !== "ready" || !isPowered) {
      setLiveCountdown(null)
      return
    }

    const tick = () => {
      const msLeft = challenge.liveStartAt!.toMillis() - Date.now()
      if (msLeft <= 0) {
        setLiveCountdown(0)
        if (!liveStartTriggeredRef.current) {
          liveStartTriggeredRef.current = true
          void beginQuiz()
        }
        return
      }
      setLiveCountdown(Math.ceil(msLeft / 1000))
    }

    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [challenge?.liveStartAt, phase, isPowered])

  useEffect(() => {
    if (phase !== "playing" || !isPowered || !user) return
    void updateChallengeLiveProgress(challengeId, user.uid, currentQuestionIndex)
  }, [phase, isPowered, user, challengeId, currentQuestionIndex])

  useEffect(() => {
    if (phase !== "playing" || !quizStartTime) return
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, quizStartTime])

  const applyQuestionFeedback = useCallback(
    async (score: QuestionScore, questionId: string) => {
      if (challengeSettings?.immediateFeedback === false) return
      const isCorrect =
        score.correct || (score.marks !== undefined && score.marks >= 2)
      if (isCorrect) {
        if (challengeSettings?.combo !== false) {
          const nextStreak = fx.comboStreak + 1
          fx.onCorrectAnswer()
          if (isPowered && user) {
            void updateChallengeComboStreak(challengeId, user.uid, nextStreak)
          }
        }
      } else if (selfEffects?.comboShield) {
        const ref = doc(db, "challenges", challengeId)
        const key = isChallenger ? "challengerEffects" : "challengedEffects"
        const { updateDoc: firestoreUpdate } = await import("firebase/firestore")
        await firestoreUpdate(ref, {
          [key]: { ...selfEffects, comboShield: false },
        })
        toast.message("Combo shield blocked the break!")
      } else {
        fx.onWrongAnswer()
        if (isPowered && user) {
          void updateChallengeComboStreak(challengeId, user.uid, 0)
        }
      }
    },
    [fx, challengeSettings, isPowered, user, challengeId, isChallenger, selfEffects]
  )

  useEffect(() => {
    if (!isPowered || liveComboStreak === undefined) return
    if (liveComboStreak === 0 && fx.comboStreak > 0) {
      fx.resetActiveCombo()
    }
  }, [liveComboStreak, isPowered, fx])

  useEffect(() => {
    const activeQ = questions[currentQuestionIndex]
    if (!isPowered || phase !== "playing" || !activeQ) return
    const serialized = JSON.stringify(opponentEffects ?? {})
    if (prevOppEffectsRef.current === serialized) return

    const prev = prevOppEffectsRef.current
      ? (JSON.parse(prevOppEffectsRef.current) as typeof opponentEffects)
      : null
    prevOppEffectsRef.current = serialized

    if (!prev) return
    const qid = activeQ.questionId

    if (
      opponentEffects?.tfExpandedByQuestionId?.[qid] &&
      !prev.tfExpandedByQuestionId?.[qid]
    ) {
      actionFx.triggerActionFx("incoming_false_answers")
      setQuestionShake(true)
      setTimeout(() => setQuestionShake(false), 500)
    } else if (
      opponentEffects?.extraOptionsByQuestionId?.[qid] &&
      !prev.extraOptionsByQuestionId?.[qid]
    ) {
      actionFx.triggerActionFx("incoming_false_answers")
      setQuestionShake(true)
      setTimeout(() => setQuestionShake(false), 500)
    }

    if (
      opponentEffects?.swappedQuestionByQuestionId?.[qid] === "hard" &&
      prev.swappedQuestionByQuestionId?.[qid] !== "hard"
    ) {
      actionFx.triggerActionFx("incoming_harder")
      setQuestionShake(true)
      setTimeout(() => setQuestionShake(false), 500)
    }
  }, [opponentEffects, isPowered, phase, questions, currentQuestionIndex, actionFx])

  const prevSabotageRef = useRef(false)
  useEffect(() => {
    if (sabotageActive && !prevSabotageRef.current) {
      actionFx.triggerActionFx("incoming_sabotage", 10000)
    }
    prevSabotageRef.current = !!sabotageActive
  }, [sabotageActive, actionFx])

  useEffect(() => {
    const activeQ = questions[currentQuestionIndex]
    if (!isPowered || phase !== "playing" || !activeQ) return
    const serialized = JSON.stringify(selfEffects ?? {})
    if (prevSelfEffectsRef.current === serialized) return

    const prev = prevSelfEffectsRef.current
      ? (JSON.parse(prevSelfEffectsRef.current) as typeof selfEffects)
      : null
    prevSelfEffectsRef.current = serialized

    if (!prev) return
    const qid = activeQ.questionId
    if (
      selfEffects?.removedWrongByQuestionId?.[qid] &&
      !prev.removedWrongByQuestionId?.[qid]
    ) {
      actionFx.triggerActionFx("incoming_halve")
    }
  }, [selfEffects, isPowered, phase, questions, currentQuestionIndex, actionFx])

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

  useQuizLeaveWarning({
    active: phase === "playing" && questions.length > 0,
    message: LEAVE_CONFIRM_MESSAGE,
    onLeave: () => handleSubmitRef.current(),
  })

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

  const handlePowerAction = async (action: PowerActionType) => {
    if (!user || !challenge) return
    const raw = questions[currentQuestionIndex]
    if (!raw) return

    const oppIdx = opponentLiveIndex ?? 0
    const targetQ = questions[oppIdx]
    setActionBusy(true)
    try {
      const displayQ = applyPowerEffectsToQuestion(raw, selfEffects)
      await useChallengePowerAction(challengeId, user.uid, action, {
        currentQuestionId: raw.questionId,
        opponentQuestionIndex: oppIdx,
        questionIds: questions.map((q) => q.questionId),
        extraOptions: targetQ?.extraOptions,
        targetOptions: targetQ?.options,
        targetCorrectAnswer: targetQ?.correctAnswer,
        selfOptions: displayQ.options,
        selfCorrectAnswer: displayQ.correctAnswer,
        isTrueFalse: targetQ?.objectiveType === "true-false",
        hasTfExpanded: !!targetQ?.tfExpandedVariant,
      })
      actionFx.triggerActionFx(action)
      if (action === "remove_wrong") {
        setQuestionShake(true)
        setTimeout(() => setQuestionShake(false), 500)
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Action failed")
    } finally {
      setActionBusy(false)
    }
  }

  const handleNext = async () => {
    const q = questions[currentQuestionIndex]
    if (!q || gradingNext || submitting) return
    const displayQ = applyPowerEffectsToQuestion(q, selfEffects)

    const userAnswer = answers[q.questionId]
    if (userAnswer === undefined || userAnswer === "") {
      toast.error("Select or enter an answer before continuing.")
      return
    }

    setGradingNext(true)
    try {
      const graded = await gradeQuestion(displayQ)
      if (!graded) {
        toast.error("Select or enter an answer before continuing.")
        return
      }

      setScores((prev) => ({ ...prev, [q.questionId]: graded }))
      void applyQuestionFeedback(graded, q.questionId)

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
    const displayQ = applyPowerEffectsToQuestion(q, selfEffects)

    const userAnswer = answers[q.questionId]
    if (userAnswer === undefined || userAnswer === "") {
      toast.error("Select or enter an answer before submitting.")
      return
    }

    if (!scores[q.questionId]) {
      setGradingNext(true)
      try {
        const graded = await gradeQuestion(displayQ)
        if (!graded) {
          toast.error("Select or enter an answer before submitting.")
          return
        }
        setScores((prev) => ({ ...prev, [q.questionId]: graded }))
        void applyQuestionFeedback(graded, q.questionId)
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
        liveCountdown={liveCountdown}
        onStart={beginQuiz}
        onMarkReady={handleMarkReady}
        onAccept={handleAcceptInLobby}
        accepting={accepting}
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

  const rawQuestion = questions[currentQuestionIndex]
  const currentQuestion = rawQuestion
    ? applyPowerEffectsToQuestion(rawQuestion, selfEffects)
    : null
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100
  const isLastQuestion = currentQuestionIndex === questions.length - 1

  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background relative">
      <ChallengeTabAwayModal open={tabAwayOpen} secondsLeft={tabAwaySeconds} />
      <ChallengeQuizOverlay
        answerFx={fx.answerFx}
        actionFx={actionFx.actionFx}
        comboStreak={fx.comboStreak}
        comboMultiplier={fx.comboMultiplier}
        peakComboMultiplier={fx.peakComboMultiplier}
        comboTimeLeft={fx.comboTimeLeft}
        showCombo={challengeSettings?.combo !== false}
        showFlash={challengeSettings?.immediateFeedback !== false}
        sabotageActive={sabotageActive}
      />
      <SidebarNav currentPath="/friends" />
      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
                onClick={() => void confirmAndLeave("/friends")}
                aria-label="Leave challenge"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold">Challenge Quiz</h1>
                <p className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {questions.length} — answers lock when
                  you press Next
                </p>
              </div>
              {isPowered && (
                <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-1.5 text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-end gap-1">
                    <Eye className="h-3 w-3" />
                    {friendNickname}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    Q{(opponentLiveIndex ?? 0) + 1}/{questions.length}
                  </p>
                </div>
              )}
            </div>

            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <Card className={cn(questionShake && "challenge-question-shake")}>
              <CardContent className="p-4 sm:p-5 space-y-4">
                <h2 className="text-lg sm:text-xl font-semibold">{currentQuestion.question}</h2>

                {currentQuestion.type === "objective" && currentQuestion.options && (
                  <RadioGroup
                    value={answers[currentQuestion.questionId]?.toString() || ""}
                    onValueChange={(value) =>
                      handleAnswerChange(currentQuestion.questionId, value)
                    }
                    className="space-y-2"
                  >
                    {currentQuestion.options.map((option, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <RadioGroupItem value={option} id={`option-${idx}`} />
                        <Label htmlFor={`option-${idx}`} className="cursor-pointer flex-1 text-sm">
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {currentQuestion.type === "subjective" && (
                  <p className="text-sm text-muted-foreground">
                    Subjective questions are not used in challenges.
                  </p>
                )}

                <div className="flex justify-end">
                  {isLastQuestion ? (
                    <Button
                      size="sm"
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
                    <Button
                      size="sm"
                      onClick={() => void handleNext()}
                      disabled={gradingNext || submitting}
                    >
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

            {isPowered && (
              <ChallengeActionsPanel
                actionsLeft={actionsLeft}
                disabled={actionBusy}
                onAction={handlePowerAction}
              />
            )}

            {challengeSettings?.timer !== false && (
              <div
                className={cn(
                  "flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-muted/60 border mx-auto w-fit",
                  fx.timerPulse && "challenge-timer-flash"
                )}
              >
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Time</span>
                <span className="font-mono text-lg font-bold tabular-nums">
                  {Math.floor(elapsedTime / 60)}:
                  {(elapsedTime % 60).toString().padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
