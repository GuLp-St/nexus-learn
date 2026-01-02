"use client"

import { createContext, useContext, ReactNode } from "react"
import { XPAwardResult } from "@/lib/xp-utils"
import { showXPToast } from "./xp-toast"
import { LevelUpModal } from "./level-up-modal"
import { useState } from "react"

interface XPContextType {
  showXPAward: (result: XPAwardResult) => void
}

const XPContext = createContext<XPContextType | undefined>(undefined)

export function XPContextProvider({ children }: { children: ReactNode }) {
  const [levelUpModalOpen, setLevelUpModalOpen] = useState(false)
  const [levelUpResult, setLevelUpResult] = useState<XPAwardResult | null>(null)

  const showXPAward = (result: XPAwardResult) => {
    if (result.leveledUp) {
      // Show level-up modal
      setLevelUpResult(result)
      setLevelUpModalOpen(true)
    } else {
      // Show XP toast
      showXPToast(result)
    }
  }

  return (
    <XPContext.Provider value={{ showXPAward }}>
      {children}
      {levelUpResult && (
        <LevelUpModal
          open={levelUpModalOpen}
          onClose={() => {
            setLevelUpModalOpen(false)
            setLevelUpResult(null)
          }}
          result={levelUpResult}
        />
      )}
    </XPContext.Provider>
  )
}

export function useXP() {
  const context = useContext(XPContext)
  if (context === undefined) {
    throw new Error("useXP must be used within an XPContextProvider")
  }
  return context
}

