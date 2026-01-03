"use client"

import { useEffect, useRef } from "react"

interface MatrixRainProps {
  className?: string
}

export function MatrixRain({ className = "" }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Characters: Japanese Katakana, Kanji, and numbers
    const chars = "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789"
    const charArray = chars.split("")

    // Column configuration - revert to original font size
    const fontSize = 14
    let columns = 0
    const drops: number[] = []
    const trailLength = 20 // Number of characters in each trail

    // Initialize drops function
    const initDrops = () => {
      const rect = canvas.getBoundingClientRect()
      columns = Math.floor(rect.width / fontSize)
      drops.length = 0
      for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100
      }
    }

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      const newColumns = Math.floor(canvas.width / fontSize)
      while (drops.length < newColumns) {
        drops.push(Math.random() * -100)
      }
      drops.splice(newColumns)
      columns = newColumns
    }

    // Initial setup
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas.parentElement || canvas)
    handleResize()
    initDrops()
    
    window.addEventListener("resize", handleResize)

    // Animation loop
    const animate = () => {
      // Fade effect - draw semi-transparent black rectangle
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw characters
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const x = i * fontSize
        
        // Draw trail of characters (longer line)
        for (let j = 0; j < trailLength; j++) {
          const trailY = (drops[i] - j) * fontSize
          
          // Only draw if within canvas bounds
          if (trailY > -fontSize && trailY < canvas.height + fontSize) {
            // Random character
            const text = charArray[Math.floor(Math.random() * charArray.length)]
            
            // Leading character is white/lighter, rest fade to green
            if (j === 0) {
              ctx.fillStyle = "#FFFFFF"
            } else {
              // Fade effect - closer to head = brighter
              const opacity = Math.max(0.1, 1 - (j / trailLength))
              ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`
            }

            ctx.fillText(text, x, trailY)
          }
        }

        // Reset drop to top randomly
        const y = drops[i] * fontSize
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }

        // Move drop down (slower - every other frame)
        drops[i] += 0.5
      }

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

