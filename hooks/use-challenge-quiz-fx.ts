"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  COMBO_TIMEOUT_MS,
  comboMultiplierFromStreak,
} from "@/lib/challenge-scoring"

export type AnswerFx = "correct" | "wrong" | null
export type ComboVisualFx = "none" | "self-reset" | "opponent-break" | "shield-shatter"

export function useChallengeQuizFx(
  questionIndex: number,
  totalQuestions: number,
  bpmEnabled = true
) {
  const [comboStreak, setComboStreak] = useState(0)
  const [comboMultiplier, setComboMultiplier] = useState(1)
  const [peakComboMultiplier, setPeakComboMultiplier] = useState(1)
  const [comboTimeLeft, setComboTimeLeft] = useState(0)
  const [answerFx, setAnswerFx] = useState<AnswerFx>(null)
  const [timerPulse, setTimerPulse] = useState(false)
  const [comboVisualFx, setComboVisualFx] = useState<ComboVisualFx>("none")

  const comboDeadlineRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pulseOscRef = useRef<OscillatorNode | null>(null)
  const pulseGainRef = useRef<GainNode | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getAudio = useCallback(() => {
    if (typeof window === "undefined") return null
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = "sine", volume = 0.08) => {
      const ctx = getAudio()
      if (!ctx) return
      if (ctx.state === "suspended") void ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.value = volume
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.stop(ctx.currentTime + duration)
    },
    [getAudio]
  )

  const startAmbientPulse = useCallback(() => {
    const ctx = getAudio()
    if (!ctx || pulseOscRef.current) return
    if (ctx.state === "suspended") void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 55
    gain.gain.value = 0.02
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    pulseOscRef.current = osc
    pulseGainRef.current = gain
  }, [getAudio])

  const stopAmbientPulse = useCallback(() => {
    try {
      pulseOscRef.current?.stop()
    } catch {
      /* already stopped */
    }
    pulseOscRef.current = null
    pulseGainRef.current = null
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
  }, [])

  const resetActiveCombo = useCallback(() => {
    comboDeadlineRef.current = null
    setComboStreak(0)
    setComboMultiplier(1)
    setComboTimeLeft(0)
  }, [])

  const syncComboFromRemote = useCallback((streak: number) => {
    const mult = comboMultiplierFromStreak(streak)
    setComboStreak(streak)
    setComboMultiplier(mult)
    setPeakComboMultiplier((peak) => Math.max(peak, mult))
    if (streak > 0) {
      comboDeadlineRef.current = Date.now() + COMBO_TIMEOUT_MS
      setComboTimeLeft(COMBO_TIMEOUT_MS)
    } else {
      comboDeadlineRef.current = null
      setComboTimeLeft(0)
    }
  }, [])

  const triggerOpponentComboBreak = useCallback(() => {
    setComboVisualFx("opponent-break")
    resetActiveCombo()
    playTone(120, 0.25, "sawtooth", 0.08)
    setTimeout(() => setComboVisualFx("none"), 850)
  }, [resetActiveCombo, playTone])

  const triggerSelfComboReset = useCallback(() => {
    setComboVisualFx("self-reset")
    resetActiveCombo()
    playTone(140, 0.22, "sawtooth", 0.06)
    setTimeout(() => setComboVisualFx("none"), 650)
  }, [resetActiveCombo, playTone])

  const triggerShieldShatter = useCallback(() => {
    setComboVisualFx("shield-shatter")
    playTone(280, 0.1, "triangle", 0.09)
    setTimeout(() => playTone(180, 0.15, "sawtooth", 0.07), 90)
    setTimeout(() => setComboVisualFx("none"), 750)
  }, [playTone])

  const onCorrectAnswer = useCallback(() => {
    setAnswerFx("correct")
    setComboStreak((prev) => {
      const next = prev + 1
      const mult = comboMultiplierFromStreak(next)
      setComboMultiplier(mult)
      setPeakComboMultiplier((peak) => Math.max(peak, mult))
      comboDeadlineRef.current = Date.now() + COMBO_TIMEOUT_MS
      setComboTimeLeft(COMBO_TIMEOUT_MS)
      return next
    })
    playTone(660, 0.14, "triangle", 0.09)
    setTimeout(() => setAnswerFx(null), 580)
  }, [playTone])

  const onWrongAnswer = useCallback(() => {
    setAnswerFx("wrong")
    triggerSelfComboReset()
    setTimeout(() => setAnswerFx(null), 580)
  }, [triggerSelfComboReset])

  useEffect(() => {
    const id = setInterval(() => {
      if (!comboDeadlineRef.current) {
        setComboTimeLeft(0)
        return
      }
      const left = comboDeadlineRef.current - Date.now()
      if (left <= 0) {
        resetActiveCombo()
        return
      }
      setComboTimeLeft(left)
    }, 50)
    return () => clearInterval(id)
  }, [resetActiveCombo])

  useEffect(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }

    if (!bpmEnabled) {
      if (pulseGainRef.current) pulseGainRef.current.gain.value = 0.02
      return
    }

    const progress = totalQuestions > 0 ? (questionIndex + 1) / totalQuestions : 0
    const bpm = 60 + Math.floor(progress * 100)
    const intervalMs = Math.max(250, Math.round(60000 / bpm))

    tickIntervalRef.current = setInterval(() => {
      playTone(800 + progress * 400, 0.04, "square", 0.03)
      setTimerPulse(true)
      setTimeout(() => setTimerPulse(false), 80)
    }, intervalMs)

    if (pulseGainRef.current) {
      pulseGainRef.current.gain.value = 0.015 + progress * 0.025
    }
    if (pulseOscRef.current) {
      pulseOscRef.current.frequency.value = 50 + progress * 30
    }

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current)
        tickIntervalRef.current = null
      }
    }
  }, [questionIndex, totalQuestions, playTone, bpmEnabled])

  useEffect(() => {
    startAmbientPulse()
    return () => {
      stopAmbientPulse()
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [startAmbientPulse, stopAmbientPulse])

  return {
    comboStreak,
    comboMultiplier,
    peakComboMultiplier,
    comboTimeLeft,
    comboVisualFx,
    answerFx,
    timerPulse,
    onCorrectAnswer,
    onWrongAnswer,
    resetActiveCombo,
    syncComboFromRemote,
    triggerOpponentComboBreak,
    triggerSelfComboReset,
    triggerShieldShatter,
    stopAmbientPulse,
  }
}
