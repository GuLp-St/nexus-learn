"use client"

import { useXP } from "./xp-context-provider"
import { LevelUpModal } from "./level-up-modal"

export function LevelUpModalWrapper() {
  const { levelUpModalOpen, levelUpResult, closeLevelUpModal } = useXP()

  if (!levelUpResult) return null

  return (
    <LevelUpModal
      open={levelUpModalOpen}
      onClose={closeLevelUpModal}
      result={levelUpResult}
    />
  )
}

