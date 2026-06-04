import { cn } from "@/lib/utils"

/** Arc-style spinner with a visible gap (not a full ring). */
export function ProcessingSpinner({
  className,
  size = "lg",
}: {
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const dim = size === "sm" ? 20 : size === "md" ? 32 : 48
  const stroke = size === "sm" ? 2.5 : size === "md" ? 3 : 3.5
  const r = (dim - stroke) / 2
  const circumference = 2 * Math.PI * r
  // ~72% visible arc, ~28% gap
  const dash = circumference * 0.72
  const gap = circumference - dash

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("mx-auto text-primary", className)}
      style={{ width: dim, height: dim }}
    >
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="animate-spin"
        style={{ animationDuration: "0.85s" }}
      >
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  )
}
