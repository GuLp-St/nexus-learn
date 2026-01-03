"use client"

import { useEffect, useRef } from "react"

interface NexusConstellationProps {
  className?: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
}

export function NexusConstellation({ className = "" }: NexusConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const connectionDistanceRef = useRef<number>(100)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Initialize particles - adjust count and connection distance based on canvas size
    const getParticleCount = () => {
      // For small previews (like store), use fewer particles
      const area = canvas.width * canvas.height
      if (area < 50000) return 30 // Small preview
      return 80 // Full screen
    }
    
    const getConnectionDistance = () => {
      const area = canvas.width * canvas.height
      if (area < 50000) return 50 // Smaller distance for previews
      return 100 // Full distance for full screen
    }

    const particles: Particle[] = []

    const initParticles = () => {
      const particleCount = getParticleCount()
      connectionDistanceRef.current = getConnectionDistance()
      particles.length = 0
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5, // Slow random drift
          vy: (Math.random() - 0.5) * 0.5,
        })
      }
    }

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      initParticles()
    }

    // Initial resize
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas.parentElement || canvas)
    handleResize()
    
    window.addEventListener("resize", handleResize)

    // Animation loop
    const animate = () => {
      // Clear canvas with background color
      ctx.fillStyle = "#0f172a" // Deep Slate
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]

        // Update position
        particle.x += particle.vx
        particle.y += particle.vy

        // Bounce off edges
        if (particle.x < 0 || particle.x > canvas.width) {
          particle.vx *= -1
          particle.x = Math.max(0, Math.min(canvas.width, particle.x))
        }
        if (particle.y < 0 || particle.y > canvas.height) {
          particle.vy *= -1
          particle.y = Math.max(0, Math.min(canvas.height, particle.y))
        }
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistanceRef.current) {
            // Calculate opacity based on distance (closer = more opaque)
            const opacity = (1 - distance / connectionDistanceRef.current) * 0.5 // 0.0 to 0.5

            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})` // White/Teal mix
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      ctx.fillStyle = "#22d3ee" // Cyan
      for (let i = 0; i < particles.length; i++) {
        ctx.beginPath()
        ctx.arc(particles[i].x, particles[i].y, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      particlesRef.current = particles
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
      style={{ background: "#0f172a" }}
    />
  )
}

