"use client"

import { useEffect, useRef, useState } from "react"

interface CorePulseProps {
  className?: string
  reducedQuality?: boolean
}

export function CorePulse({ className = "", reducedQuality }: CorePulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const timeRef = useRef<number>(0)
  const [isLowPower, setIsLowPower] = useState(reducedQuality ?? false)

  useEffect(() => {
    if (reducedQuality !== undefined) {
      setIsLowPower(reducedQuality)
      return
    }
    const check = () => {
      const mobile = window.innerWidth < 768
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      setIsLowPower(mobile || reducedMotion)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [reducedQuality])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = isLowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2)

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas.parentElement || canvas)
    handleResize()
    window.addEventListener("resize", handleResize)

    const drawHexGrid = (width: number, height: number) => {
      if (isLowPower) return
      const hexSize = 30
      const hexWidth = hexSize * Math.sqrt(3)
      const hexHeight = hexSize * 2
      ctx.strokeStyle = "rgba(34, 211, 238, 0.08)"
      ctx.lineWidth = 1
      for (let y = 0; y < height + hexHeight; y += hexHeight * 0.75) {
        for (let x = 0; x < width + hexWidth; x += hexWidth) {
          const offsetX = (y / (hexHeight * 0.75)) % 2 === 0 ? 0 : hexWidth / 2
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i
            const hx = x + offsetX + hexSize * Math.cos(angle)
            const hy = y + hexSize * Math.sin(angle)
            if (i === 0) ctx.moveTo(hx, hy)
            else ctx.lineTo(hx, hy)
          }
          ctx.closePath()
          ctx.stroke()
        }
      }
    }

    let frameSkip = 0

    const animate = (timestamp: number) => {
      if (isLowPower) {
        frameSkip++
        if (frameSkip % 2 !== 0) {
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }
      }

      if (timeRef.current === 0) timeRef.current = timestamp
      const elapsed = (timestamp - timeRef.current) * 0.001

      const width = canvas.width / dpr
      const height = canvas.height / dpr

      ctx.fillStyle = "#0f172a"
      ctx.fillRect(0, 0, width, height)
      drawHexGrid(width, height)

      const centerX = width * 0.5
      const centerY = height * 0.5
      const maxDimension = Math.max(width, height)
      const baseRadius = isLowPower ? 80 : 60
      const maxRingIndex = Math.ceil((maxDimension / 2) / baseRadius)
      const ringCount = isLowPower
        ? Math.min(3, maxRingIndex)
        : Math.max(4, maxRingIndex)

      for (let i = 0; i < ringCount; i++) {
        const ringIndex = i + 1
        const speed = 0.5 + i * 0.2
        const scale = 1 + Math.sin(elapsed * speed) * (isLowPower ? 0.08 : 0.15)
        const opacity = 0.3 + Math.sin(elapsed * speed + i) * 0.2
        const rotation = elapsed * (i % 2 === 0 ? 0.1 : -0.1)
        const radius = baseRadius * ringIndex * scale

        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(rotation)
        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})`
        ctx.lineWidth = isLowPower ? 1.5 : 2
        if (!isLowPower) {
          ctx.shadowBlur = 15
          ctx.shadowColor = `rgba(34, 211, 238, ${opacity * 0.5})`
        }

        ctx.beginPath()
        for (let j = 0; j < 6; j++) {
          const angle = (Math.PI / 3) * j
          const x = radius * Math.cos(angle)
          const y = radius * Math.sin(angle)
          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("resize", handleResize)
      resizeObserver.disconnect()
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isLowPower])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: "#0f172a" }}
    />
  )
}
