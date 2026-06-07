"use client"

/**
 * Self-contained RGB theme preview — each element animates its own color
 * (no CSS variables or parent filter required).
 */
export function RgbThemePreviewDemo() {
  return (
    <div className="w-full overflow-hidden rounded-xl border-2 border-border/60 bg-background p-6">
      <style>{`
        @keyframes rgb-el-1 {
          0%, 100% { background-color: #ef4444; border-color: #ef4444; stroke: #ef4444; }
          25% { background-color: #eab308; border-color: #eab308; stroke: #eab308; }
          50% { background-color: #22c55e; border-color: #22c55e; stroke: #22c55e; }
          75% { background-color: #3b82f6; border-color: #3b82f6; stroke: #3b82f6; }
        }
        @keyframes rgb-el-2 {
          0%, 100% { background-color: #3b82f6; border-color: #3b82f6; }
          25% { background-color: #ef4444; border-color: #ef4444; }
          50% { background-color: #eab308; border-color: #eab308; }
          75% { background-color: #22c55e; border-color: #22c55e; }
        }
        @keyframes rgb-bar {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .rgb-demo-bar {
          background: linear-gradient(90deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444);
          background-size: 200% 100%;
          animation: rgb-bar 3s linear infinite;
        }
        .rgb-demo-circle {
          animation: rgb-el-1 4s linear infinite;
        }
        .rgb-demo-btn {
          animation: rgb-el-1 4s linear infinite;
        }
        .rgb-demo-dot {
          animation: rgb-el-2 4s linear infinite;
        }
        .rgb-demo-ring {
          animation: rgb-el-1 4s linear infinite;
        }
      `}</style>

      {/* Full-width rainbow strip — always visible proof the preview works */}
      <div className="rgb-demo-bar mb-5 h-2 w-full rounded-full shadow-md" />

      <p className="mb-4 text-center text-sm text-muted-foreground">
        Accent colors cycle through the full spectrum in real time
      </p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative h-28 w-28">
          <svg className="absolute inset-0 h-28 w-28 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="50" stroke="#e5e7eb" strokeWidth="3" fill="none" className="opacity-30" />
            <circle
              className="rgb-demo-ring"
              cx="56"
              cy="56"
              r="50"
              stroke="#ef4444"
              strokeWidth="5"
              fill="none"
              strokeDasharray="314"
              strokeDashoffset="78"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rgb-demo-circle h-16 w-16 rounded-full border-2 shadow-lg" />
          </div>
          <div className="rgb-demo-btn absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold text-white shadow">
            Lv 10
          </div>
        </div>

        <button type="button" className="rgb-demo-btn rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-md">
          Accent button
        </button>

        <div className="flex gap-3">
          <span className="rgb-demo-dot h-4 w-4 rounded-full" />
          <span className="rgb-demo-dot h-4 w-4 rounded-full opacity-80" style={{ animationDelay: "0.5s" }} />
          <span className="rgb-demo-dot h-4 w-4 rounded-full opacity-60" style={{ animationDelay: "1s" }} />
        </div>
      </div>
    </div>
  )
}
