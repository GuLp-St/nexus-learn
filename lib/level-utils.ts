/**
 * Level system utilities for XP-based leveling
 * Uses exponential progression: each level requires roughly double the XP of the previous level range
 */

export interface LevelProgress {
  currentLevel: number
  xpInCurrentLevel: number // XP earned in current level
  xpNeededForNext: number // Total XP needed to reach next level
  xpProgressToNext: number // XP progress within current level
  progressPercentage: number // Percentage progress to next level (0-100)
  xpAtCurrentLevelStart: number // Starting XP for current level
}

/**
 * Level thresholds (cumulative XP required):
 * Level 1: 0-99 XP
 * Level 2: 100-249 XP
 * Level 3: 250-499 XP
 * Level 4: 500-999 XP
 * Level 5: 1000-1999 XP
 * Level 6: 2000-3999 XP
 * Level 7: 4000-7999 XP
 * Level 8: 8000-15999 XP
 * Level 9: 16000-31999 XP
 * Level 10: 32000-63999 XP
 * ... (continues doubling)
 */
function getLevelThresholds(): number[] {
  const thresholds = [0] // Level 1 starts at 0 XP
  
  let threshold = 100 // Level 2 starts at 100 XP
  for (let level = 2; level <= 100; level++) {
    thresholds.push(threshold)
    
    // Double the XP requirement each time, but round to nice numbers
    if (level === 2) {
      threshold = 250 // Level 3
    } else if (level === 3) {
      threshold = 500 // Level 4
    } else if (level === 4) {
      threshold = 1000 // Level 5
    } else {
      // From level 5 onwards, double the range
      const previousThreshold = thresholds[thresholds.length - 2]
      const currentRange = threshold - previousThreshold
      threshold = threshold + currentRange * 2
    }
  }
  
  return thresholds
}

/**
 * Calculate current level based on XP
 */
export function calculateLevel(xp: number): number {
  const thresholds = getLevelThresholds()
  
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      return i + 1
    }
  }
  
  return 1
}

/**
 * Get detailed level progress information
 */
export function getLevelProgress(xp: number): LevelProgress {
  const thresholds = getLevelThresholds()
  const currentLevel = calculateLevel(xp)
  
  // Find the XP threshold for current level (level - 1 because array is 0-indexed)
  const xpAtCurrentLevelStart = thresholds[currentLevel - 1] || 0
  
  // Find the XP threshold for next level
  const xpNeededForNext = thresholds[currentLevel] || thresholds[thresholds.length - 1]
  
  // Calculate progress within current level
  const xpInCurrentLevel = xp - xpAtCurrentLevelStart
  const xpProgressToNext = xpNeededForNext - xp
  
  // Calculate percentage (how much of current level range is completed)
  const levelRange = xpNeededForNext - xpAtCurrentLevelStart
  const progressPercentage = levelRange > 0 
    ? Math.min(100, Math.max(0, (xpInCurrentLevel / levelRange) * 100))
    : 100
  
  return {
    currentLevel,
    xpInCurrentLevel,
    xpNeededForNext,
    xpProgressToNext,
    progressPercentage: Math.round(progressPercentage * 100) / 100, // Round to 2 decimals
    xpAtCurrentLevelStart,
  }
}

/**
 * Get XP required for a specific level
 */
export function getXPForLevel(level: number): number {
  const thresholds = getLevelThresholds()
  if (level <= 1) return 0
  if (level > thresholds.length) return thresholds[thresholds.length - 1]
  return thresholds[level - 1]
}

/**
 * Get level display name (optional: can add special names for high levels)
 */
export function getLevelName(level: number): string {
  return `Level ${level}`
}

