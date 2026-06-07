let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function playTick(ctx: AudioContext, time: number, frequency: number, volume: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.001), time + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(time)
  osc.stop(time + 0.05)
}

/**
 * Tick rate matches wheel deceleration: fast clicks early, slow clicks as it stops.
 * Mirrors cubic-bezier(0.12, 0.8, 0.2, 1) over the spin duration.
 */
export function playSpinSound(durationMs = 4200) {
  const ctx = getCtx()
  if (!ctx) return

  const start = ctx.currentTime
  const durationSec = durationMs / 1000
  const minGap = 0.045
  const maxGap = 0.38

  let elapsed = 0
  let tickIndex = 0

  while (elapsed < durationSec - 0.05) {
    const progress = elapsed / durationSec
    // ease-out cubic — same feel as the wheel slowing down
    const eased = 1 - Math.pow(1 - progress, 3)
    const gap = minGap + (maxGap - minGap) * eased
    const pitch = 720 + eased * 480

    playTick(ctx, start + elapsed, pitch, 0.11 - progress * 0.05)

    elapsed += gap
    tickIndex++
    if (tickIndex > 120) break
  }
}

/** Short celebratory fanfare on win */
export function playWinSound() {
  const ctx = getCtx()
  if (!ctx) return

  const notes = [523.25, 659.25, 783.99, 1046.5]
  const start = ctx.currentTime

  notes.forEach((freq, i) => {
    const t = start + i * 0.1
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "triangle"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
  })
}

/** Lower tone for duplicate / low-tier (still a win) */
export function playRevealSound(rarity: string) {
  if (rarity === "legendary" || rarity === "unique" || rarity === "epic") {
    playWinSound()
    return
  }
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(440, t)
  osc.frequency.exponentialRampToValueAtTime(660, t + 0.15)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.35)
}
