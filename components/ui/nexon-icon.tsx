import { cn } from "@/lib/utils"

/**
 * Custom stylized icon for Nexon currency
 */
export function NexonIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={cn("inline-block shrink-0", className)} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer Hexagon with depth */}
      <path 
        d="M12 2L20.6603 7V17L12 22L3.33975 17V7L12 2Z" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinejoin="round"
        className="text-primary"
      />
      {/* Inner Glow/Fill */}
      <path 
        d="M12 4L18.9282 8V16L12 20L5.0718 16V8L12 4Z" 
        fill="currentColor" 
        fillOpacity="0.1"
        className="text-primary"
      />
      {/* Stylized Core - Diamond/Star shape */}
      <path 
        d="M12 7L14.5 12L12 17L9.5 12L12 7Z" 
        fill="currentColor"
        className="text-primary"
      />
      {/* Highlight point */}
      <circle cx="12" cy="12" r="1" fill="currentColor" className="text-white opacity-80" />
    </svg>
  )
}

