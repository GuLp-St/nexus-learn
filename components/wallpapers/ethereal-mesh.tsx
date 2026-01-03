"use client"

interface EtherealMeshProps {
  className?: string
}

export function EtherealMesh({ className = "" }: EtherealMeshProps) {
  return (
    <div className={`absolute inset-0 w-full h-full ${className}`}>
      <div className="w-full h-full bg-[length:400%_400%] animate-[breathe_10s_ease-in-out_infinite] bg-gradient-to-r from-indigo-900 via-purple-900 to-teal-900" />
      <div className="absolute inset-0 backdrop-blur-3xl bg-black/20" />
    </div>
  )
}

