"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PowerActionType } from "@/lib/challenge-powered-actions"

export type ActionFxType =
  | PowerActionType
  | "incoming_sabotage"
  | "incoming_harder"
  | "incoming_false_answers"
  | "incoming_halve"
  | null

export function useChallengeActionFx() {
  const [actionFx, setActionFx] = useState<ActionFxType>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const getAudio = useCallback(() => {
    if (typeof window === "undefined") return null
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = "sine", volume = 0.1) => {
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

  const playActionSound = useCallback(
    (action: ActionFxType) => {
      switch (action) {
        case "add_more_answers":
        case "incoming_false_answers":
          playTone(320, 0.08, "square", 0.07)
          setTimeout(() => playTone(420, 0.08, "square", 0.06), 90)
          break
        case "swap_harder":
        case "incoming_harder":
          playTone(180, 0.15, "sawtooth", 0.08)
          setTimeout(() => playTone(120, 0.2, "sawtooth", 0.06), 120)
          break
        case "distort_screen":
        case "incoming_sabotage":
          playTone(90, 0.25, "triangle", 0.09)
          setTimeout(() => playTone(70, 0.3, "sine", 0.07), 150)
          break
        case "remove_wrong":
        case "incoming_halve":
          playTone(520, 0.1, "triangle", 0.08)
          break
        case "combo_breaker":
          playTone(200, 0.12, "square", 0.07)
          setTimeout(() => playTone(150, 0.18, "sawtooth", 0.05), 100)
          break
        case "combo_shield":
          playTone(440, 0.12, "sine", 0.08)
          setTimeout(() => playTone(660, 0.1, "sine", 0.06), 100)
          break
        case "swap_easier":
          playTone(600, 0.1, "triangle", 0.07)
          break
        case "combo_switcher":
          playTone(300, 0.08, "square", 0.07)
          setTimeout(() => playTone(500, 0.08, "square", 0.07), 80)
          break
        default:
          break
      }
    },
    [playTone]
  )

  const triggerActionFx = useCallback(
    (action: ActionFxType, durationMs = 900) => {
      if (!action) return
      setActionFx(action)
      playActionSound(action)
      setTimeout(() => setActionFx(null), durationMs)
    },
    [playActionSound]
  )

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  return { actionFx, triggerActionFx }
}
