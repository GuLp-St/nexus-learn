"use client"

import { useEffect, useRef } from "react"

interface CorePulseProps {
  className?: string
}

export function CorePulse({ className = "" }: CorePulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const timeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    // Initial resize
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas.parentElement || canvas)
    handleResize()
    
    window.addEventListener("resize", handleResize)

    // Draw hex grid pattern (static background)
    const drawHexGrid = () => {
      const hexSize = 30
      const hexWidth = hexSize * Math.sqrt(3)
      const hexHeight = hexSize * 2

      ctx.strokeStyle = "rgba(34, 211, 238, 0.1)" // Faint cyan
      ctx.lineWidth = 1

      for (let y = 0; y < canvas.height + hexHeight; y += hexHeight * 0.75) {
        for (let x = 0; x < canvas.width + hexWidth; x += hexWidth) {
          const offsetX = (y / (hexHeight * 0.75)) % 2 === 0 ? 0 : hexWidth / 2

          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i
            const hx = x + offsetX + hexSize * Math.cos(angle)
            const hy = y + hexSize * Math.sin(angle)
            if (i === 0) {
              ctx.moveTo(hx, hy)
            } else {
              ctx.lineTo(hx, hy)
            }
          }
          ctx.closePath()
          ctx.stroke()
        }
      }
    }

    // Animation loop
    const animate = (timestamp: number) => {
      if (timeRef.current === 0) {
        timeRef.current = timestamp
      }
      const elapsed = (timestamp - timeRef.current) * 0.001 // Convert to seconds

      // Clear canvas
      ctx.fillStyle = "#0f172a" // Deep Slate background
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw static hex grid
      drawHexGrid()

      // Center point (can be adjusted: 0.2 for avatar position or 0.5 for center)
      const centerX = canvas.width * 0.5
      const centerY = canvas.height * 0.5

      // Calculate rings based on screen size - ensure they cover the whole screen
      const maxDimension = Math.max(canvas.width, canvas.height)
      const baseRadius = 60
      // Calculate how many rings we need to cover the screen
      // Each ring is baseRadius * ringIndex, and we want the largest ring to be at least maxDimension/2
      const maxRingIndex = Math.ceil((maxDimension / 2) / baseRadius)
      const ringCount = Math.max(4, maxRingIndex) // At least 4 rings, but more if needed

      // Draw pulsing rings
      for (let i = 0; i < ringCount; i++) {
        const ringIndex = i + 1
        const speed = 0.5 + i * 0.2 // Different speeds for each ring

        // Breathing effect using sine wave
        const scale = 1 + Math.sin(elapsed * speed) * 0.15 // Scale up/down slightly

        // Opacity based on sine wave (glow gets brighter/dimmer)
        const opacity = 0.3 + Math.sin(elapsed * speed + i) * 0.2

        // Rotation (alternating directions)
        const rotation = elapsed * (i % 2 === 0 ? 0.1 : -0.1)

        const radius = baseRadius * ringIndex * scale

        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(rotation)

        // Draw hexagon
        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})` // Cyan/Electric Blue
        ctx.lineWidth = 2
        ctx.shadowBlur = 15
        ctx.shadowColor = `rgba(34, 211, 238, ${opacity * 0.5})`

        ctx.beginPath()
        for (let j = 0; j < 6; j++) {
          const angle = (Math.PI / 3) * j
          const x = radius * Math.cos(angle)
          const y = radius * Math.sin(angle)
          if (j === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: "#0f172a" }}
    />
  )
}

