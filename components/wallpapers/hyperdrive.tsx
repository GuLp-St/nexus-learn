"use client"

import { useEffect, useRef } from "react"

interface HyperdriveProps {
  className?: string
}

interface Star {
  x: number
  y: number
  speed: number
  trailLength: number
}

export function Hyperdrive({ className = "" }: HyperdriveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const starsRef = useRef<Star[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Initialize stars
    const starCount = 200
    const stars: Star[] = []

    const initStars = () => {
      stars.length = 0
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          speed: 0.5 + Math.random() * 4, // Varying speeds (0.5 to 4.5)
          trailLength: 5 + Math.random() * 20, // Trail length based on speed
        })
      }
    }

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      initStars()
    }

    // Initial setup
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas.parentElement || canvas)
    handleResize()

    window.addEventListener("resize", handleResize)

    // Animation loop
    const animate = () => {
      // Clear canvas with black background
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i]

        // Move star from right to left
        star.x -= star.speed

        // Reset star to right edge when it hits left edge
        if (star.x < 0) {
          star.x = canvas.width
          star.y = Math.random() * canvas.height
        }

        // Calculate trail length based on speed (faster = longer)
        const trailLen = star.speed * 8

        // Draw trail (streak)
        const gradient = ctx.createLinearGradient(
          star.x + trailLen,
          star.y,
          star.x,
          star.y
        )
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)")
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)")
        gradient.addColorStop(1, "rgba(255, 255, 255, 1)")

        ctx.strokeStyle = gradient
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(star.x + trailLen, star.y)
        ctx.lineTo(star.x, star.y)
        ctx.stroke()

        // Draw star (bright point at the end)
        ctx.fillStyle = "#FFFFFF"
        ctx.beginPath()
        ctx.arc(star.x, star.y, 1, 0, Math.PI * 2)
        ctx.fill()
      }

      starsRef.current = stars
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

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
      style={{ background: "#000000" }}
    />
  )
}

