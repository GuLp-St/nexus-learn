"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Lock, CheckCircle2, Play, BookOpen, GraduationCap, Castle, Flag, XCircle, RotateCcw, Eye, Gift, FileQuestion, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { CourseWithProgress } from "@/lib/course-utils"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { useAuth } from "@/components/auth-provider"
import { getQuizAttempts, QuizAttempt, getActiveQuiz, abandonQuizAttempt, getMostRecentQuizAttempt, getQuizCooldownRemaining, formatCooldownTime } from "@/lib/quiz-utils"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getAvailableTiers, hasClaimedReward, claimReward, type RewardTier } from "@/lib/reward-utils"
import { useXP } from "@/components/xp-context-provider"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { getUserNexon, spendNexon } from "@/lib/nexon-utils"
import { db } from "@/lib/firebase"
import { doc, updateDoc } from "firebase/firestore"

interface CourseRoadmapProps {
  course: CourseWithProgress
  onRefresh?: () => void
}

const MODULE_CARD_HEIGHT = 200
const LESSON_NODE_SIZE = 32
const QUIZ_NODE_SIZE = 40
const FINAL_NODE_SIZE = 56
const FINAL_CARD_MIN_HEIGHT = MODULE_CARD_HEIGHT + 80
const LESSON_SPACING = 100

// Module colors
const MODULE_COLORS = [
  { fill: "#10b981", stroke: "#059669", name: "Emerald" },
  { fill: "#3b82f6", stroke: "#2563eb", name: "Blue" },
  { fill: "#8b5cf6", stroke: "#7c3aed", name: "Purple" },
  { fill: "#f59e0b", stroke: "#d97706", name: "Amber" },
  { fill: "#ef4444", stroke: "#dc2626", name: "Red" },
  { fill: "#ec4899", stroke: "#db2777", name: "Pink" },
]

// Calculate grade from percentage
function getGradeFromScore(score: number): string {
  if (score >= 95) return "S"
  if (score >= 85) return "A"
  if (score >= 75) return "B"
  if (score >= 65) return "C"
  return "D"
}

// Generate sine wave path points within card bounds
function generateWavePath(lessonCount: number, nodePositions: Array<{ x: number; y: number }>): string {
  if (lessonCount === 0 || nodePositions.length === 0) return ""
  
  let path = ""
  for (let i = 0; i < lessonCount; i++) {
    const { x, y } = nodePositions[i]
    
    if (i === 0) {
      path += `M ${x} ${y}`
    } else {
      const prev = nodePositions[i - 1]
      const midX = (prev.x + x) / 2
      path += ` Q ${midX} ${prev.y}, ${midX} ${(prev.y + y) / 2} Q ${midX} ${y}, ${x} ${y}`
    }
  }
  
  // Add connector line to quiz node at the end
  if (lessonCount > 0) {
    const last = nodePositions[lessonCount - 1]
    const quizX = last.x + 12 // % offset
    const quizY = last.y + 15 // % offset
    
    // Make the final line squiggly too
    const midX = (last.x + quizX) / 2
    path += ` Q ${midX} ${last.y}, ${midX} ${(last.y + quizY) / 2} Q ${midX} ${quizY}, ${quizX} ${quizY}`
  }
  
  return path
}

// Generate node positions along the wave (in percentages 0-100)
function generateNodePositions(lessonCount: number): Array<{ x: number; y: number }> {
  if (lessonCount === 0) return []
  
  const paddingLeft = 8 // %
  const usableWidth = 75 // %
  const amplitude = 25 // %
  const baseY = 50 // %
  
  const spacing = lessonCount > 1 ? usableWidth / (lessonCount - 1) : 0
  
  const positions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < lessonCount; i++) {
    const x = paddingLeft + i * spacing
    const y = baseY + Math.sin(i * 0.8) * amplitude
    positions.push({ x, y })
  }
  
  return positions
}

interface ModuleLevelCardProps {
  moduleIndex: number
  module: CourseWithProgress["modules"][0]
  course: CourseWithProgress
  quizAttempts: QuizAttempt[]
  isLocked: boolean
  isActive: boolean
  previousModulePassed: boolean
  currentLessonIndex?: number
  incompleteAttempt: (QuizAttempt & { courseTitle?: string }) | null
  onRefresh?: () => void
}

function ModuleLevelCard({
  moduleIndex,
  module,
  course,
  quizAttempts,
  isLocked,
  isActive,
  previousModulePassed,
  currentLessonIndex,
  incompleteAttempt,
  onRefresh,
}: ModuleLevelCardProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { showXPAward } = useXP()
  const cardRef = useRef<HTMLDivElement>(null)
  const moduleColor = MODULE_COLORS[moduleIndex % MODULE_COLORS.length]
  const [selectedLesson, setSelectedLesson] = useState<{ index: number; lesson: any } | null>(null)
  const [showQuizModal, setShowQuizModal] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [quizRewardTiers, setQuizRewardTiers] = useState<Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }>>([])
  const [claiming, setClaiming] = useState<string | null>(null)
  const [hasUnclaimedRewards, setHasUnclaimedRewards] = useState(false)
  const [lastModuleAttempt, setLastModuleAttempt] = useState<QuizAttempt | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [showBypassConfirm, setShowBypassConfirm] = useState(false)
  const [nexonBalance, setNexonBalance] = useState(0)

  if (!course.userProgress) return null

  const completedLessons = new Set(course.userProgress.completedLessons || [])
  const lastModule = course.userProgress.lastAccessedModule ?? 0
  const lastLesson = course.userProgress.lastAccessedLesson ?? 0
  
  // Calculate module quiz score
  const moduleAttempts = quizAttempts.filter(
    (a) => a.quizType === "module" && a.moduleIndex === moduleIndex
  )
  const bestAttempt = moduleAttempts
    .filter((a) => a.completedAt && !(a as any).abandoned)
    .sort((a, b) => {
      const aScore = a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0
      const bScore = b.maxScore > 0 ? (b.totalScore / b.maxScore) * 100 : 0
      return bScore - aScore
    })[0]
  
  const bestScore = bestAttempt && bestAttempt.maxScore > 0
    ? Math.round((bestAttempt.totalScore / bestAttempt.maxScore) * 100)
    : course.userProgress?.moduleQuizScores?.[moduleIndex.toString()]
  
  const isModulePassed = bestScore !== undefined && bestScore >= 50
  
  // Check if all lessons in this module are completed
  const allLessonsCompleted = module.lessons.every((_, lessonIndex) => {
    const lessonId = `${moduleIndex}-${lessonIndex}`
    return completedLessons.has(lessonId)
  })
  
  const isQuizLocked = !allLessonsCompleted || isLocked

  const isOngoingThisQuiz = 
    incompleteAttempt && 
    incompleteAttempt.courseId === course.id && 
    incompleteAttempt.quizType === "module" && 
    Number(incompleteAttempt.moduleIndex) === moduleIndex;

  // Load last module attempt and calculate cooldown
  useEffect(() => {
    const loadLastAttempt = async () => {
      if (!user) return
      try {
        const [attempt, nexon, activeQuiz] = await Promise.all([
          getMostRecentQuizAttempt(user.uid, course.id, "module", moduleIndex, null),
          getUserNexon(user.uid),
          getActiveQuiz(user.uid)
        ])
        setLastModuleAttempt(attempt)
        setNexonBalance(nexon)
        // Only calculate cooldown if there's no active incomplete quiz for this specific quiz
        if (attempt && (!activeQuiz || activeQuiz.courseId !== course.id || activeQuiz.quizType !== "module" || Number(activeQuiz.moduleIndex) !== moduleIndex)) {
          const remaining = getQuizCooldownRemaining(attempt, "module")
          setCooldownRemaining(remaining)
        } else {
          setCooldownRemaining(0)
        }
      } catch (error) {
        console.error("Error loading module quiz attempt:", error)
      }
    }
    loadLastAttempt()
  }, [user, course.id, moduleIndex, incompleteAttempt?.id])

  // Update cooldown timer every second
  useEffect(() => {
    if (cooldownRemaining <= 0 || isOngoingThisQuiz) return
    
    const interval = setInterval(() => {
      if (lastModuleAttempt && !isOngoingThisQuiz) {
        const remaining = getQuizCooldownRemaining(lastModuleAttempt, "module")
        setCooldownRemaining(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cooldownRemaining, lastModuleAttempt, isOngoingThisQuiz])

  // Load ALL reward tiers and claimed status for this module quiz (show all tiers regardless of score)
  useEffect(() => {
    const loadRewards = async () => {
      if (!user) {
        setQuizRewardTiers([])
        return
      }
      // Always show all 4 tiers: >50%, >70%, >90%, 100%
      const allTiers: RewardTier[] = [">50%", ">70%", ">90%", "100%"]
      const results: Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }> = []
      const currentScore = bestScore || 0
      for (const tier of allTiers) {
        const claimed = await hasClaimedReward(user.uid, course.id, "moduleQuiz", moduleIndex.toString(), tier)
        // Check if user has reached this tier score
        const tierThreshold = tier === ">50%" ? 50 : tier === ">70%" ? 70 : tier === ">90%" ? 90 : 100
        const canClaim = !claimed && currentScore >= tierThreshold
        results.push({ tier, claimed, canClaim })
      }
      setQuizRewardTiers(results)
      // Check if there are any unclaimed rewards
      const hasUnclaimed = results.some(r => r.canClaim)
      setHasUnclaimedRewards(hasUnclaimed)
    }
    loadRewards().catch((err) => console.error("Error loading module quiz rewards:", err))
  }, [user, course.id, moduleIndex, bestScore])

  const handleClaimReward = async (tier: RewardTier) => {
    if (!user || claiming) return
    try {
      setClaiming(tier)
      const xpMultiplier = course.difficulty === "expert" ? 1.5 : course.difficulty === "intermediate" ? 1.25 : 1.0
      const result = await claimReward(user.uid, course.id, "moduleQuiz", moduleIndex.toString(), tier, xpMultiplier)
      if (result.xpAwarded) {
        showXPAward(result.xpAwarded)
      }
      // Reload rewards to update UI
      const allTiers: RewardTier[] = [">50%", ">70%", ">90%", "100%"]
      const results: Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }> = []
      const currentScore = bestScore || 0
      for (const t of allTiers) {
        const claimed = await hasClaimedReward(user.uid, course.id, "moduleQuiz", moduleIndex.toString(), t)
        const tierThreshold = t === ">50%" ? 50 : t === ">70%" ? 70 : t === ">90%" ? 90 : 100
        const canClaim = !claimed && currentScore >= tierThreshold
        results.push({ tier: t, claimed, canClaim })
      }
      setQuizRewardTiers(results)
      // Update unclaimed rewards status
      const hasUnclaimed = results.some(r => r.canClaim)
      setHasUnclaimedRewards(hasUnclaimed)
    } catch (error) {
      console.error("Error claiming reward:", error)
      toast.error("Failed to claim reward. Please try again.")
    } finally {
      setClaiming(null)
    }
  }
  
  const nodePositions = generateNodePositions(module.lessons.length)
  const wavePath = generateWavePath(module.lessons.length, nodePositions)
  const minWidth = (module.lessons.length * 60) + 120 // Safety min-width in pixels to prevent overlap
  
  const handleCardClick = () => {
    if (isLocked) {
      toast.error("Complete the previous module first!")
      return
    }
  }
  
  const handleLessonClick = (lessonIndex: number) => {
    if (isLocked) {
      toast.error("Complete the previous module first!")
      return
    }
    
    const lessonId = `${moduleIndex}-${lessonIndex}`
    const isCompleted = completedLessons.has(lessonId)
    
    // Check if previous lesson is completed
    const prevLessonId = lessonIndex > 0 ? `${moduleIndex}-${lessonIndex - 1}` : null
    const isLockedLesson = prevLessonId ? !completedLessons.has(prevLessonId) : false
    
    if (isLockedLesson) {
      toast.error("Finish previous lesson first.")
      return
    }
    
    // Show modal for unlocked lessons
    const lesson = module.lessons[lessonIndex]
    setSelectedLesson({ index: lessonIndex, lesson })
  }
  
  const handleStartLesson = (reset: boolean = false) => {
    if (!selectedLesson) return
    const url = `/journey/${course.id}/modules/${moduleIndex}/lessons/${selectedLesson.index}`
    if (reset) {
      router.push(`${url}?reset=true`)
    } else {
      router.push(url)
    }
    setSelectedLesson(null)
  }

  const handleQuizClick = () => {
    if (isLocked) {
      toast.error("Complete the previous module first!")
      return
    }
    
    if (!allLessonsCompleted) {
      toast.error("Complete all lessons in this module first!")
      return
    }

    // Always show quiz info modal when clicking quiz point
    setShowQuizModal(true)
  }

  const handleStartQuiz = () => {
    // If this quiz is active, go directly to resume
    if (isOngoingThisQuiz) {
      router.push(`/journey/quiz/${course.id}/modules/${moduleIndex}/quiz`)
      return
    }

    // If another quiz is active, show conflict modal
    if (incompleteAttempt && !isOngoingThisQuiz) {
      setShowConflictModal(true)
      return
    }

    // Check cooldown
    if (cooldownRemaining > 0) {
      toast.error(`Quiz is on cooldown. Please wait ${formatCooldownTime(cooldownRemaining)}`)
      return
    }

    // Otherwise, start the quiz
    router.push(`/journey/quiz/${course.id}/modules/${moduleIndex}/quiz`)
  }

    return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-xl border-2 p-6 backdrop-blur-md bg-background/80 shadow-lg transition-all ${
        isLocked
          ? "border-muted cursor-not-allowed"
          : isActive
          ? "border-primary shadow-primary/20"
          : "border-border hover:border-primary/50"
      }`}
      onClick={handleCardClick}
    >
      {/* Content wrapper with blur when locked */}
      <div className={`${isLocked ? "blur-sm opacity-60 pointer-events-none" : ""} overflow-x-auto pb-4`}>
        {/* Module Header */}
        <div className="mb-4 flex items-center justify-between min-w-[300px]">
          <div>
            <h3 className="text-xl font-bold text-foreground">Module {moduleIndex + 1}</h3>
            <p className="text-sm text-muted-foreground">{module.title}</p>
          </div>
          {bestScore !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Best Score:</span>
              <span
                className={`text-lg font-bold ${
                  bestScore >= 95 ? "text-yellow-500" : bestScore >= 85 ? "text-blue-500" : "text-green-500"
                }`}
              >
                {bestScore}% (Grade {getGradeFromScore(bestScore)})
              </span>
            </div>
          )}
        </div>
      
      {/* SVG Path Layer */}
      <div className="relative w-full" style={{ height: `${MODULE_CARD_HEIGHT}px`, minWidth: `${minWidth}px` }}>
        <svg
          width="100%"
          height={MODULE_CARD_HEIGHT}
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Path border */}
          <path
            d={wavePath}
            fill="none"
            stroke="rgba(0, 0, 0, 0.2)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Main path */}
          <motion.path
            d={wavePath}
            fill="none"
            stroke={moduleColor.stroke}
            strokeWidth="0.5"
            strokeDasharray="2,1"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </svg>
        
        {/* Node Layer */}
        <div className="absolute inset-0 w-full h-full">
          {module.lessons.map((lesson, lessonIndex) => {
            const position = nodePositions[lessonIndex]
            if (!position) return null
            
            const lessonId = `${moduleIndex}-${lessonIndex}`
            const isCompleted = completedLessons.has(lessonId)
            const isCurrent = moduleIndex === lastModule && lessonIndex === lastLesson
            const prevLessonId = lessonIndex > 0 ? `${moduleIndex}-${lessonIndex - 1}` : null
            const isLockedLesson = prevLessonId ? !completedLessons.has(prevLessonId) : false
            
            let nodeColor = moduleColor.fill
            let borderColor = moduleColor.stroke
            
            if (isLockedLesson || isLocked) {
              nodeColor = "#6b7280"
              borderColor = "#4b5563"
            } else if (isCompleted) {
              nodeColor = "#10b981"
              borderColor = "#059669"
            } else if (isCurrent) {
              nodeColor = "#fbbf24"
              borderColor = "#f59e0b"
            }
            
            return (
              <div
                key={lessonIndex}
                className="absolute cursor-pointer group"
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleLessonClick(lessonIndex)
                }}
              >
                {/* Node circle wrapper with pulsing ring - relative container with flex centering */}
                <div className="relative flex items-center justify-center">
                  {/* Pulsing ring for current/unlocked (not completed) - perfectly centered */}
                  {isCurrent && !isCompleted && (
                    <motion.div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 pointer-events-none z-0"
                      style={{
                        borderColor: nodeColor,
                        width: `${LESSON_NODE_SIZE + 8}px`,
                        height: `${LESSON_NODE_SIZE + 8}px`,
                      }}
                      animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                  
                  {/* Node circle - sits on top of ring */}
                  <div
                    className="relative z-10 rounded-full border-2 shadow-lg flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      width: `${LESSON_NODE_SIZE}px`,
                      height: `${LESSON_NODE_SIZE}px`,
                      backgroundColor: nodeColor,
                      borderColor: borderColor,
                    }}
                  >
                  {isLockedLesson || isLocked ? (
                    <Lock className="h-4 w-4 text-white" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  ) : isCurrent ? (
                    <Play className="h-4 w-4 text-orange-900" />
                  ) : (
                    <BookOpen className="h-4 w-4 text-white" />
                  )}
                  </div>
                </div>
                
                {/* Avatar on current node */}
                {isCurrent && user && isActive && (
                  <motion.div
                    className="absolute -top-10 left-1/2 -translate-x-1/2 z-30"
                    animate={{
                      y: [0, -10, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <div className="relative">
                      <AvatarWithCosmetics userId={user.uid} nickname={null} size="md" />
                    </div>
                  </motion.div>
                )}
              </div>
            )
          })}
          
          {/* Quiz Node at the end - separate final point */}
          {module.lessons.length > 0 && nodePositions.length > 0 && (
            <div
              className={`absolute group ${
                isQuizLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
              style={{
                left: `${nodePositions[nodePositions.length - 1].x + 12}%`,
                top: `${nodePositions[nodePositions.length - 1].y + 15}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isQuizLocked) {
                  handleQuizClick()
                } else if (!allLessonsCompleted) {
                  toast.error("Complete all lessons in this module first!")
                }
              }}
            >
              <div className="relative transition-transform group-hover:scale-110">
                {isQuizLocked && !allLessonsCompleted ? (
                  // Hexagon lock when locked
                  <svg
                    width={QUIZ_NODE_SIZE}
                    height={QUIZ_NODE_SIZE}
                    className="drop-shadow-lg"
                    viewBox="0 0 24 24"
                  >
                    {/* Hexagon shape */}
                    <polygon
                      points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7"
                      fill="#6b7280"
                      stroke="#4b5563"
                      strokeWidth="2"
                    />
                    {/* Lock icon inside hexagon */}
                    <rect x="9" y="11" width="6" height="5" rx="1" fill="white" />
                    <path d="M10 11V9C10 7.89543 10.8954 7 12 7C13.1046 7 14 7.89543 14 9V11" stroke="white" strokeWidth="1.5" fill="none" />
                  </svg>
                ) : (
                  // Regular hexagon with sword when unlocked
                  <>
                    <svg
                      width={QUIZ_NODE_SIZE}
                      height={QUIZ_NODE_SIZE}
                      className="drop-shadow-lg"
                      viewBox={`0 0 ${QUIZ_NODE_SIZE} ${QUIZ_NODE_SIZE}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <polygon
                        points={`${QUIZ_NODE_SIZE / 2},${QUIZ_NODE_SIZE * 0.1} ${QUIZ_NODE_SIZE * 0.9},${QUIZ_NODE_SIZE * 0.3} ${QUIZ_NODE_SIZE * 0.9},${QUIZ_NODE_SIZE * 0.7} ${QUIZ_NODE_SIZE / 2},${QUIZ_NODE_SIZE * 0.9} ${QUIZ_NODE_SIZE * 0.1},${QUIZ_NODE_SIZE * 0.7} ${QUIZ_NODE_SIZE * 0.1},${QUIZ_NODE_SIZE * 0.3}`}
                        fill={isModulePassed ? moduleColor.fill : "#ef4444"}
                        stroke={isModulePassed ? moduleColor.stroke : "#dc2626"}
                        strokeWidth="3"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <GraduationCap className="h-5 w-5 text-white" />
                    </div>
                    {/* Cooldown timer overlay */}
                    {cooldownRemaining > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full z-30">
                        <div className="text-white text-xs font-bold text-center">
                          {formatCooldownTime(cooldownRemaining)}
                        </div>
                      </div>
                    )}
                    {/* Grey out icon when on cooldown */}
                    {cooldownRemaining > 0 && (
                      <div className="absolute inset-0 bg-gray-500/50 rounded-full z-20 pointer-events-none" />
                    )}
                    {bestScore !== undefined && (
                      <div
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold shadow-lg z-10"
                        style={{
                          backgroundColor: bestScore >= 95 ? "#fbbf24" : bestScore >= 85 ? "#3b82f6" : "#10b981",
                          color: "#ffffff",
                        }}
                      >
                        {getGradeFromScore(bestScore)}
                      </div>
                    )}
                    {/* Reward notification badge */}
                    {hasUnclaimedRewards && (
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-500 border-2 border-white shadow-lg flex items-center justify-center z-20 animate-pulse">
                        <Gift className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      
      {/* Module Quiz Info Modal */}
      <Dialog open={showQuizModal} onOpenChange={(open) => !open && setShowQuizModal(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Module {moduleIndex + 1} Quiz
            </DialogTitle>
            <DialogDescription>
              Test your understanding of all lessons in this module. Your best score will determine whether the next
              module unlocks.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {bestScore !== undefined && (
              <p className="text-sm text-muted-foreground">
                <strong>Best Score:</strong> {bestScore}% (Grade {getGradeFromScore(bestScore)})
              </p>
            )}
            {!allLessonsCompleted && (
              <p className="text-sm text-red-500">
                Complete all lessons in this module before attempting the quiz.
              </p>
            )}
            {quizRewardTiers.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rewards up for grabs
                </p>
                <div className="space-y-2">
                  {quizRewardTiers.map(({ tier, claimed, canClaim }) => {
                    const tierThreshold = tier === ">50%" ? 50 : tier === ">70%" ? 70 : tier === ">90%" ? 90 : 100
                    const xpAmount = tier === ">50%" ? 10 : tier === ">70%" ? 20 : tier === ">90%" ? 30 : 50
                    const nexonAmount = tier === "100%" ? 25 : 0
                    const xpMultiplier = course.difficulty === "expert" ? 1.5 : course.difficulty === "intermediate" ? 1.25 : 1.0
                    const finalXP = Math.round(xpAmount * xpMultiplier)
                    const finalNexon = Math.round(nexonAmount * xpMultiplier)
                    const currentScore = bestScore || 0
                    const isUnlocked = currentScore >= tierThreshold
                    
                    return (
                      <div key={tier} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 flex-1">
                          {claimed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${isUnlocked ? "border-primary" : "border-muted-foreground/40"}`} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{tier} score</span>
                              {!isUnlocked && (
                                <span className="text-xs text-muted-foreground">({currentScore}% reached)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-medium text-foreground">+{finalXP} XP</span>
                              {finalNexon > 0 && (
                                <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                                  <span>+{finalNexon}</span>
                                  <NexonIcon className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {!claimed && canClaim && (
                          <Button
                            size="sm"
                            onClick={() => handleClaimReward(tier)}
                            disabled={claiming === tier}
                            className="text-xs h-8 px-3"
                          >
                            {claiming === tier ? (
                              <Spinner className="h-3 w-3" />
                            ) : (
                              "Claim"
                            )}
                          </Button>
                        )}
                        {claimed && (
                          <span className="text-xs text-muted-foreground">Claimed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => {
                setShowQuizModal(false)
                router.push(`/journey/quiz/${course.id}/history`)
              }}
            >
              Review Attempts
            </Button>
            {cooldownRemaining > 0 ? (
              <>
                <Button
                  className="w-full sm:w-auto opacity-50 cursor-not-allowed"
                  disabled={true}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {formatCooldownTime(cooldownRemaining)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBypassConfirm(true)}
                  disabled={nexonBalance < 15}
                  className="text-xs"
                >
                  <div className="flex items-center gap-1">
                    <span>Bypass</span>
                    <span className="font-bold">15</span>
                    <NexonIcon className="h-3 w-3" />
                  </div>
                </Button>
              </>
            ) : (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowQuizModal(false)
                  handleStartQuiz()
                }}
                disabled={!allLessonsCompleted || isLocked}
              >
                <Play className="h-4 w-4 mr-2" />
                {isOngoingThisQuiz ? "Resume Quiz" : "Start Quiz"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Quiz Conflict Modal */}
      <Dialog open={showConflictModal} onOpenChange={setShowConflictModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-yellow-500 animate-pulse" />
              Quiz Already in Progress
            </DialogTitle>
            <DialogDescription>
              You have an ongoing quiz. Resume it or give up to start a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 rounded-lg bg-muted border space-y-2">
              <p className="text-sm font-semibold">{incompleteAttempt?.courseTitle || "Unknown Course"}</p>
              <p className="text-xs text-muted-foreground capitalize">
                Type: {incompleteAttempt?.quizType} Quiz 
                {incompleteAttempt?.moduleIndex !== null && ` (Module ${Number(incompleteAttempt?.moduleIndex) + 1})`}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={async () => {
                if (!incompleteAttempt?.id || !user) return
                try {
                  await abandonQuizAttempt(incompleteAttempt.id)
                  setShowConflictModal(false)
                  // Refresh active quiz state
                  onRefresh?.()
                  // Refresh cooldown
                  const attempt = await getMostRecentQuizAttempt(user.uid, course.id, "module", moduleIndex, null)
                  setLastModuleAttempt(attempt)
                  if (attempt) {
                    const remaining = getQuizCooldownRemaining(attempt, "module")
                    setCooldownRemaining(remaining)
                  }
                  // Show quiz info modal instead of starting quiz immediately
                  setShowQuizModal(true)
                } catch (error) {
                  toast.error("Failed to abandon quiz.")
                }
              }}
            >
              Give Up (0% Score)
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                if (!incompleteAttempt) return
                const { courseId, quizType, moduleIndex } = incompleteAttempt
                if (quizType === "course") {
                  router.push(`/journey/quiz/${courseId}/quiz`)
                } else if (quizType === "module") {
                  router.push(`/journey/quiz/${courseId}/modules/${moduleIndex}/quiz`)
                }
                setShowConflictModal(false)
              }}
            >
              Resume Quiz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bypass Confirmation Dialog */}
      <Dialog open={showBypassConfirm} onOpenChange={setShowBypassConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bypass Cooldown?</DialogTitle>
            <DialogDescription>
              Spend 15 Nexon to bypass the cooldown and take the quiz immediately?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Your Nexon balance: {nexonBalance}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBypassConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-foreground text-background hover:bg-foreground/90 border-none shadow-md"
              onClick={async () => {
                if (!user) return
                try {
                  await spendNexon(user.uid, 15, "Module Quiz Cooldown Bypass", { courseId: course.id, moduleIndex, quizType: "module" })
                  
                  // Persist the bypass by updating the last attempt's bypass flag
                  const attempt = await getMostRecentQuizAttempt(user.uid, course.id, "module", moduleIndex, null)
                  if (attempt?.id) {
                    await updateDoc(doc(db, "quizAttempts", attempt.id), {
                      bypassCooldown: true
                    })
                  }
                  
                  setShowBypassConfirm(false)
                  setShowQuizModal(false)
                  // Refresh data
                  const [newAttempt, newNexon] = await Promise.all([
                    getMostRecentQuizAttempt(user.uid, course.id, "module", moduleIndex, null),
                    getUserNexon(user.uid)
                  ])
                  setLastModuleAttempt(newAttempt ? { ...newAttempt, bypassCooldown: true } as any : null)
                  setNexonBalance(newNexon)
                  setCooldownRemaining(0)
                  toast.success("Cooldown bypassed! You can now start the quiz.")
                } catch (error: any) {
                  toast.error(error.message || "Failed to bypass cooldown")
                }
              }}
              disabled={nexonBalance < 15}
            >
              Confirm (15 <NexonIcon className="h-4 w-4 inline" />)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Lock overlay - blurred background (sneak peek) */}
      {isLocked && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md bg-background/40 rounded-xl">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-6 border-2 border-muted">
            <Lock className="h-16 w-16 text-muted-foreground mb-4 mx-auto" />
            <p className="text-lg font-semibold text-foreground text-center">
              Pass previous module (&gt;50%) to unlock
            </p>
          </div>
        </div>
      )}
      
      {/* Lesson Info Modal */}
      <Dialog open={!!selectedLesson} onOpenChange={(open) => !open && setSelectedLesson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLesson && completedLessons.has(`${moduleIndex}-${selectedLesson.index}`) && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {selectedLesson?.lesson.title || "Lesson"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Module:</strong> {module.title}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Status:</strong>{" "}
                {selectedLesson && completedLessons.has(`${moduleIndex}-${selectedLesson.index}`)
                  ? "Completed"
                  : "In Progress"}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedLesson && completedLessons.has(`${moduleIndex}-${selectedLesson.index}`) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleStartLesson(false)}
                  className="w-full sm:w-auto"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Lesson
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleStartLesson(true)}
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Relearn
                </Button>
              </>
            )}
            {selectedLesson && !completedLessons.has(`${moduleIndex}-${selectedLesson.index}`) && (
              <Button
                onClick={() => handleStartLesson(false)}
                className="w-full sm:w-auto"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Lesson
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

interface FinalExamCardProps {
  course: CourseWithProgress
  quizAttempts: QuizAttempt[]
  isLocked: boolean
  allModulesPassed: boolean
  incompleteAttempt: (QuizAttempt & { courseTitle?: string }) | null
  onRefresh?: () => void
}

function FinalExamCard({ course, quizAttempts, isLocked, allModulesPassed, incompleteAttempt, onRefresh }: FinalExamCardProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { showXPAward } = useXP()
  const cardRef = useRef<HTMLDivElement>(null)
  const [finalRewardTiers, setFinalRewardTiers] = useState<Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }>>([])
  const [claiming, setClaiming] = useState<string | null>(null)
  const [hasUnclaimedRewards, setHasUnclaimedRewards] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [lastFinalAttempt, setLastFinalAttempt] = useState<QuizAttempt | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [showBypassConfirm, setShowBypassConfirm] = useState(false)
  const [nexonBalance, setNexonBalance] = useState(0)
  
  if (!course.userProgress) return null

  // Calculate final quiz score
  const finalAttempts = quizAttempts.filter((a) => a.quizType === "course")
  const bestAttempt = finalAttempts
    .filter((a) => a.completedAt && !(a as any).abandoned)
    .sort((a, b) => {
      const aScore = a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0
      const bScore = b.maxScore > 0 ? (b.totalScore / b.maxScore) * 100 : 0
      return bScore - aScore
    })[0]
  
  const bestScore = bestAttempt && bestAttempt.maxScore > 0
    ? Math.round((bestAttempt.totalScore / bestAttempt.maxScore) * 100)
    : course.userProgress?.finalQuizScore

  const isOngoingThisQuiz = 
    incompleteAttempt && 
    incompleteAttempt.courseId === course.id && 
    incompleteAttempt.quizType === "course";

  // Load last final attempt and calculate cooldown
  useEffect(() => {
    const loadLastAttempt = async () => {
      if (!user) return
      try {
        const [attempt, nexon, activeQuiz] = await Promise.all([
          getMostRecentQuizAttempt(user.uid, course.id, "course", null, null),
          getUserNexon(user.uid),
          getActiveQuiz(user.uid)
        ])
        setLastFinalAttempt(attempt)
        setNexonBalance(nexon)
        // Only calculate cooldown if there's no active incomplete quiz for this course
        if (attempt && (!activeQuiz || activeQuiz.courseId !== course.id || activeQuiz.quizType !== "course")) {
          const remaining = getQuizCooldownRemaining(attempt, "course")
          setCooldownRemaining(remaining)
        } else {
          setCooldownRemaining(0)
        }
      } catch (error) {
        console.error("Error loading final quiz attempt:", error)
      }
    }
    loadLastAttempt()
  }, [user, course.id, incompleteAttempt?.id])

  // Update cooldown timer every second
  useEffect(() => {
    if (cooldownRemaining <= 0 || isOngoingThisQuiz) return
    
    const interval = setInterval(() => {
      if (lastFinalAttempt && !isOngoingThisQuiz) {
        const remaining = getQuizCooldownRemaining(lastFinalAttempt, "course")
        setCooldownRemaining(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cooldownRemaining, lastFinalAttempt, isOngoingThisQuiz])

  // Load available reward tiers and claimed status for the final quiz
  useEffect(() => {
    const loadRewards = async () => {
      if (!user || bestScore === undefined) {
        setFinalRewardTiers([])
        setHasUnclaimedRewards(false)
        return
      }
      // Always show all 4 tiers: >50%, >70%, >90%, 100%
      const allTiers: RewardTier[] = [">50%", ">70%", ">90%", "100%"]
      const results: Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }> = []
      const currentScore = bestScore || 0
      for (const tier of allTiers) {
        const claimed = await hasClaimedReward(user.uid, course.id, "finalQuiz", "final", tier)
        const tierThreshold = tier === ">50%" ? 50 : tier === ">70%" ? 70 : tier === ">90%" ? 90 : 100
        const canClaim = !claimed && currentScore >= tierThreshold
        results.push({ tier, claimed, canClaim })
      }
      setFinalRewardTiers(results)
      // Check if there are any unclaimed rewards
      const hasUnclaimed = results.some(r => r.canClaim)
      setHasUnclaimedRewards(hasUnclaimed)
    }
    loadRewards().catch((err) => console.error("Error loading final quiz rewards:", err))
  }, [user, bestScore, course.id])

  const handleClaimReward = async (tier: RewardTier) => {
    if (!user || claiming) return
    try {
      setClaiming(tier)
      const xpMultiplier = course.difficulty === "expert" ? 1.5 : course.difficulty === "intermediate" ? 1.25 : 1.0
      const result = await claimReward(user.uid, course.id, "finalQuiz", "final", tier, xpMultiplier)
      if (result.xpAwarded) {
        showXPAward(result.xpAwarded)
      }
      // Reload rewards to update UI
      const allTiers: RewardTier[] = [">50%", ">70%", ">90%", "100%"]
      const results: Array<{ tier: RewardTier; claimed: boolean; canClaim: boolean }> = []
      const currentScore = bestScore || 0
      for (const t of allTiers) {
        const claimed = await hasClaimedReward(user.uid, course.id, "finalQuiz", "final", t)
        const tierThreshold = t === ">50%" ? 50 : t === ">70%" ? 70 : t === ">90%" ? 90 : 100
        const canClaim = !claimed && currentScore >= tierThreshold
        results.push({ tier: t, claimed, canClaim })
      }
      setFinalRewardTiers(results)
      // Update unclaimed rewards status
      const hasUnclaimed = results.some(r => r.canClaim)
      setHasUnclaimedRewards(hasUnclaimed)
    } catch (error) {
      console.error("Error claiming reward:", error)
      toast.error("Failed to claim reward. Please try again.")
    } finally {
      setClaiming(null)
    }
  }

  const handleStartQuiz = () => {
    if (isLocked) {
      toast.error("Complete all modules with >50% to unlock the final exam!")
      return
    }

    // If this quiz is active, go directly to resume
    if (isOngoingThisQuiz) {
      router.push(`/journey/quiz/${course.id}/quiz`)
      return
    }

    // If another quiz is active, show conflict modal
    if (incompleteAttempt && !isOngoingThisQuiz) {
      setShowConflictModal(true)
      return
    }

    // Check cooldown
    if (cooldownRemaining > 0) {
      toast.error(`Quiz is on cooldown. Please wait ${formatCooldownTime(cooldownRemaining)}`)
      return
    }

    // Otherwise, start the quiz
    router.push(`/journey/quiz/${course.id}/quiz`)
  }

    return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-xl border-2 p-6 backdrop-blur-md bg-gradient-to-br from-yellow-500/20 to-orange-500/20 shadow-lg transition-all ${
        isLocked
          ? "border-muted cursor-not-allowed"
          : "border-yellow-500/50 hover:border-yellow-500 shadow-yellow-500/20"
      }`}
      style={{ minHeight: FINAL_CARD_MIN_HEIGHT }}
    >
      {/* Content wrapper with blur when locked */}
      <div className={isLocked ? "blur-sm opacity-60 pointer-events-none" : ""}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="relative shrink-0">
                <Flag className="h-16 w-16 text-yellow-500" />
                {bestScore !== undefined && (
                  <div
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm font-bold shadow-lg bg-yellow-500 z-10"
                    style={{
                      color: "#ffffff",
                    }}
                  >
                    {getGradeFromScore(bestScore)}
                  </div>
                )}
                {/* Reward notification badge */}
                {hasUnclaimedRewards && (
                  <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-yellow-500 border-2 border-white shadow-lg flex items-center justify-center z-20 animate-pulse">
                    <Gift className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-bold text-foreground mb-1">Final Exam</h3>
                <p className="text-sm text-muted-foreground mb-2 leading-relaxed">{course.description}</p>
                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <FileQuestion className="h-3.5 w-3.5" />
                    <span>20 Questions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>20-30 mins</span>
                  </div>
                </div>
                {bestScore !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Best Score:</span>
                    <span className="text-xl font-bold text-yellow-500">
                      {bestScore}% (Grade {getGradeFromScore(bestScore)})
                    </span>
                  </div>
                )}
              </div>
            </div>
            {finalRewardTiers.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/40 w-full md:w-[280px] shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rewards up for grabs
                </p>
                <div className="space-y-2">
                  {finalRewardTiers.map(({ tier, claimed, canClaim }) => {
                    const tierThreshold = tier === ">50%" ? 50 : tier === ">70%" ? 70 : tier === ">90%" ? 90 : 100
                    const xpAmount = tier === ">50%" ? 20 : tier === ">70%" ? 40 : tier === ">90%" ? 60 : 100
                    const nexonAmount = tier === "100%" ? 50 : 0
                    const xpMultiplier = course.difficulty === "expert" ? 1.5 : course.difficulty === "intermediate" ? 1.25 : 1.0
                    const finalXP = Math.round(xpAmount * xpMultiplier)
                    const finalNexon = Math.round(nexonAmount * xpMultiplier)
                    const currentScore = bestScore || 0
                    const isUnlocked = currentScore >= tierThreshold
                    
                    return (
                      <div key={tier} className="flex items-center justify-between gap-3 p-2 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {claimed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${isUnlocked ? "border-primary" : "border-muted-foreground/40"}`} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-foreground whitespace-nowrap">{tier} score</span>
                              {!isUnlocked && (
                                <span className="text-[10px] text-muted-foreground">({currentScore}%)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-medium text-foreground">+{finalXP} XP</span>
                              {finalNexon > 0 && (
                                <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                                  <span>+{finalNexon}</span>
                                  <NexonIcon className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {!claimed && canClaim ? (
                            <Button
                              size="sm"
                              onClick={() => handleClaimReward(tier)}
                              disabled={claiming === tier}
                              className="text-xs h-7 px-2"
                            >
                              {claiming === tier ? (
                                <Spinner className="h-3 w-3" />
                              ) : (
                                "Claim"
                              )}
                            </Button>
                          ) : claimed ? (
                            <span className="text-[10px] text-muted-foreground font-medium">Claimed</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-yellow-500/20">
            <Button
              variant="outline"
              className="bg-background/50 backdrop-blur-sm border-yellow-500/30 hover:bg-yellow-500/10"
              onClick={() => router.push(`/journey/quiz/${course.id}/history`)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Review Attempts
            </Button>

            {cooldownRemaining > 0 && !isOngoingThisQuiz ? (
              <>
                <Button
                  className="bg-yellow-500/50 hover:bg-yellow-500/50 text-yellow-950 font-bold px-8 shadow-lg shadow-yellow-500/20 opacity-50 cursor-not-allowed"
                  disabled={true}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {formatCooldownTime(cooldownRemaining)}
                </Button>
                <Button
                  variant="outline"
                  className="bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20"
                  onClick={() => setShowBypassConfirm(true)}
                  disabled={nexonBalance < 30}
                >
                  <div className="flex items-center gap-2">
                    <span>Bypass</span>
                    <span className="font-bold">30</span>
                    <NexonIcon className="h-3 w-3" />
                  </div>
                </Button>
              </>
            ) : (
              <Button
                className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold px-8 shadow-lg shadow-yellow-500/20"
                onClick={handleStartQuiz}
              >
                <Play className="h-4 w-4 mr-2" />
                {isOngoingThisQuiz ? "Resume Quiz" : "Start Quiz"}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Lock overlay - blurred background (sneak peek) */}
      {isLocked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-md bg-background/40 rounded-xl overflow-hidden pointer-events-none">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-6 border-2 border-yellow-500/30 max-w-[90%] pointer-events-auto">
            <Lock className="h-16 w-16 text-yellow-500 mb-3 mx-auto" />
            <p className="text-lg font-semibold text-foreground text-center">
              Complete all modules with &gt;50% to unlock
            </p>
          </div>
        </div>
      )}

      {/* Active Quiz Conflict Modal */}
      <Dialog open={showConflictModal} onOpenChange={setShowConflictModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-yellow-500 animate-pulse" />
              Quiz Already in Progress
            </DialogTitle>
            <DialogDescription>
              You have an ongoing quiz. Resume it or give up to start a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 rounded-lg bg-muted border space-y-2">
              <p className="text-sm font-semibold">{incompleteAttempt?.courseTitle || "Unknown Course"}</p>
              <p className="text-xs text-muted-foreground capitalize">
                Type: {incompleteAttempt?.quizType} Quiz 
                {incompleteAttempt?.moduleIndex !== null && ` (Module ${Number(incompleteAttempt?.moduleIndex) + 1})`}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={async () => {
                if (!incompleteAttempt?.id || !user) return
                try {
                  await abandonQuizAttempt(incompleteAttempt.id)
                  setShowConflictModal(false)
                  // Refresh active quiz state
                  onRefresh?.()
                  // Refresh cooldown
                  const attempt = await getMostRecentQuizAttempt(user.uid, course.id, "course", null, null)
                  setLastFinalAttempt(attempt)
                  if (attempt) {
                    const remaining = getQuizCooldownRemaining(attempt, "course")
                    setCooldownRemaining(remaining)
                  }
                  // Just close modal - don't navigate anywhere
                } catch (error) {
                  toast.error("Failed to abandon quiz.")
                }
              }}
            >
              Give Up (0% Score)
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                if (!incompleteAttempt) return
                const { courseId, quizType, moduleIndex } = incompleteAttempt
                if (quizType === "course") {
                  router.push(`/journey/quiz/${courseId}/quiz`)
                } else if (quizType === "module") {
                  router.push(`/journey/quiz/${courseId}/modules/${moduleIndex}/quiz`)
                }
                setShowConflictModal(false)
              }}
            >
              Resume Quiz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bypass Confirmation Dialog */}
      <Dialog open={showBypassConfirm} onOpenChange={setShowBypassConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bypass Cooldown?</DialogTitle>
            <DialogDescription>
              Spend 30 Nexon to bypass the cooldown and take the final quiz immediately?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Your Nexon balance: {nexonBalance}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBypassConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-foreground text-background hover:bg-foreground/90 border-none shadow-md"
              onClick={async () => {
                if (!user) return
                try {
                  await spendNexon(user.uid, 30, "Final Quiz Cooldown Bypass", { courseId: course.id, quizType: "course" })
                  
                  // Persist the bypass by updating the last attempt's bypass flag
                  const attempt = await getMostRecentQuizAttempt(user.uid, course.id, "course", null, null)
                  if (attempt?.id) {
                    await updateDoc(doc(db, "quizAttempts", attempt.id), {
                      bypassCooldown: true
                    })
                  }

                  setShowBypassConfirm(false)
                  // Refresh attempt data to remove cooldown
                  const [newAttempt, newNexon] = await Promise.all([
                    getMostRecentQuizAttempt(user.uid, course.id, "course", null, null),
                    getUserNexon(user.uid)
                  ])
                  setLastFinalAttempt(newAttempt ? { ...newAttempt, bypassCooldown: true } as any : null)
                  setNexonBalance(newNexon)
                  setCooldownRemaining(0)
                  toast.success("Cooldown bypassed! You can now start the exam.")
                } catch (error: any) {
                  toast.error(error.message || "Failed to bypass cooldown")
                }
              }}
              disabled={nexonBalance < 30}
            >
              Confirm (30 <NexonIcon className="h-4 w-4 inline" />)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

export function CourseRoadmap({ course }: CourseRoadmapProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [incompleteAttempt, setIncompleteAttempt] = useState<(QuizAttempt & { courseTitle?: string }) | null>(null)
  const activeCardRef = useRef<HTMLDivElement>(null)
  
  if (!course.userProgress) return null

  // Load quiz attempts and check for active quiz
  const loadData = async () => {
    if (!user || !course) return
    try {
      const [allAttempts, activeQuiz] = await Promise.all([
        getQuizAttempts(user.uid, course.id),
        getActiveQuiz(user.uid)
      ])
      setQuizAttempts(allAttempts)
      setIncompleteAttempt(activeQuiz)
    } catch (error) {
      console.error("Error loading roadmap data:", error)
    }
  }

  useEffect(() => {
    loadData()
  }, [user, course?.id])

  // Refresh when page regains focus (user might have started/abandoned a quiz in another tab)
  useEffect(() => {
    const handleFocus = () => {
      if (user && course) {
        loadData()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user, course?.id])


  // Calculate module pass status
  const modulePassStatus: boolean[] = []
      for (let moduleIndex = 0; moduleIndex < course.modules.length; moduleIndex++) {
    const moduleAttempts = quizAttempts.filter(
      (a) => a.quizType === "module" && a.moduleIndex === moduleIndex
    )
          const bestAttempt = moduleAttempts
      .filter((a) => a.completedAt && !(a as any).abandoned)
            .sort((a, b) => {
              const aScore = a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0
              const bScore = b.maxScore > 0 ? (b.totalScore / b.maxScore) * 100 : 0
              return bScore - aScore
            })[0]

          const bestScore = bestAttempt && bestAttempt.maxScore > 0
            ? Math.round((bestAttempt.totalScore / bestAttempt.maxScore) * 100)
            : course.userProgress?.moduleQuizScores?.[moduleIndex.toString()]

    modulePassStatus.push(bestScore !== undefined && bestScore >= 50)
  }
  
  const allModulesPassed = modulePassStatus.every((passed) => passed)
  
  // Find active module
  const lastModule = course.userProgress.lastAccessedModule ?? 0
  const lastLesson = course.userProgress.lastAccessedLesson ?? 0
  
  // Auto-scroll to active module
  useEffect(() => {
    if (activeCardRef.current) {
      setTimeout(() => {
        activeCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      }, 300)
    }
  }, [course.id])

  return (
    <div className="flex flex-col gap-8 w-full">
      {course.modules.map((module, moduleIndex) => {
        const previousModulePassed = moduleIndex === 0 || modulePassStatus[moduleIndex - 1]
        const isLocked = !previousModulePassed
        const isActive = moduleIndex === lastModule
        
        return (
          <div
            key={moduleIndex}
            ref={isActive ? activeCardRef : null}
          >
            <ModuleLevelCard
              moduleIndex={moduleIndex}
              module={module}
              course={course}
              quizAttempts={quizAttempts}
              isLocked={isLocked}
              isActive={isActive}
              previousModulePassed={previousModulePassed}
              currentLessonIndex={isActive ? lastLesson : undefined}
              incompleteAttempt={incompleteAttempt}
              onRefresh={loadData}
            />
          </div>
        )
      })}
      
      {/* Final Exam Card */}
      <div className="mt-4">
        <FinalExamCard
          course={course}
          quizAttempts={quizAttempts}
          isLocked={!allModulesPassed}
          allModulesPassed={allModulesPassed}
          incompleteAttempt={incompleteAttempt}
          onRefresh={loadData}
        />
      </div>

    </div>
  )
}
