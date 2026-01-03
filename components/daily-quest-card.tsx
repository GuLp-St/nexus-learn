"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { RefreshCw, Trophy, CheckCircle2, RotateCcw } from "lucide-react"
import { getUserDailyQuests, claimQuestReward, refreshQuest, Quest, DailyQuests } from "@/lib/daily-quest-utils"
import { useAuth } from "@/components/auth-provider"
import { useXP } from "@/components/xp-context-provider"
import { NexonIcon } from "@/components/ui/nexon-icon"

export function DailyQuestCard() {
  const { user } = useAuth()
  const { showXPAward } = useXP()
  const [quests, setQuests] = useState<DailyQuests | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      loadQuests()
    }
  }, [user])

  const loadQuests = async () => {
    if (!user) return
    try {
      setLoading(true)
      const data = await getUserDailyQuests(user.uid)
      setQuests(data)
    } catch (error) {
      console.error("Error loading daily quests:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async (questId: string) => {
    if (!user || claiming) return
    try {
      setClaiming(questId)
      const result = await claimQuestReward(user.uid, questId)
      if (result) {
        showXPAward(result)
        await loadQuests() // Reload to update UI
      }
    } catch (error) {
      console.error("Error claiming quest reward:", error)
    } finally {
      setClaiming(null)
    }
  }

  const handleRefresh = async (questId: string) => {
    if (!user || refreshing) return
    try {
      setRefreshing(questId)
      const success = await refreshQuest(user.uid, questId)
      if (success) {
        await loadQuests() // Reload to update UI
      }
    } catch (error) {
      console.error("Error refreshing quest:", error)
    } finally {
      setRefreshing(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Daily Quests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!quests || quests.quests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Daily Quests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No quests available
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Daily Quests
            </CardTitle>
            <CardDescription className="mt-1">
              Complete quests to earn XP & Nexon
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {quests.refreshTokens > 0 ? (
              <>
                <span>{quests.refreshTokens}</span>
                <RotateCcw className="h-4 w-4" />
              </>
            ) : (
              <QuestRefreshCountdown lastReset={quests.lastRefreshTokenReset} />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        {quests.quests.map((quest) => (
          <QuestItem
            key={quest.id}
            quest={quest}
            onClaim={() => handleClaim(quest.id)}
            onRefresh={() => handleRefresh(quest.id)}
            claiming={claiming === quest.id}
            refreshing={refreshing === quest.id}
            canRefresh={quests.refreshTokens > 0}
          />
        ))}
      </CardContent>
    </Card>
  )
}

interface QuestItemProps {
  quest: Quest
  onClaim: () => void
  onRefresh: () => void
  claiming: boolean
  refreshing: boolean
  canRefresh: boolean
}

function QuestRefreshCountdown({ lastReset }: { lastReset: string }) {
  const [timeLeft, setTimeLeft] = useState<string>("")

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const tomorrowUTC = new Date(todayUTC)
      tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1)
      
      const msLeft = tomorrowUTC.getTime() - now.getTime()
      const hours = Math.floor(msLeft / (1000 * 60 * 60))
      const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
      
      setTimeLeft(`${hours}h ${minutes}m`)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [lastReset])

  return <span className="text-xs">{timeLeft}</span>
}

function QuestCompletedCountdown() {
  const [timeLeft, setTimeLeft] = useState<string>("")

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const tomorrowUTC = new Date(todayUTC)
      tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1)
      
      const msLeft = tomorrowUTC.getTime() - now.getTime()
      const hours = Math.floor(msLeft / (1000 * 60 * 60))
      const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
      
      setTimeLeft(`Resets in ${hours}h ${minutes}m`)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  return <span className="text-xs text-muted-foreground">{timeLeft}</span>
}

function QuestItem({ quest, onClaim, onRefresh, claiming, refreshing, canRefresh }: QuestItemProps) {
  const progress = Math.min((quest.progress / quest.target) * 100, 100)
  const isCompleted = quest.completed && !quest.claimed

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm">{quest.title}</h4>
            {quest.claimed && (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">{quest.description}</p>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {quest.progress}/{quest.target}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-shrink-0 items-end">
          {quest.claimed ? (
            <div className="text-xs text-center text-muted-foreground py-1">
              <QuestCompletedCountdown />
            </div>
          ) : (
            <>
              {/* Rewards - Always visible at the top */}
              <div className="flex flex-col gap-1 items-end">
                <div className="text-xs font-medium text-foreground">+{quest.xpReward} XP</div>
                <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <span>+{quest.nexonReward}</span>
                  <NexonIcon className="h-3.5 w-3.5" />
                </div>
              </div>

              {/* Action Button - Replaces refresh spot when completed */}
              {isCompleted ? (
                <Button
                  size="sm"
                  onClick={onClaim}
                  disabled={claiming}
                  className="text-xs h-8 px-4"
                >
                  {claiming ? (
                    <Spinner className="h-3 w-3" />
                  ) : (
                    "Claim"
                  )}
                </Button>
              ) : (
                canRefresh && !quest.completed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="text-xs h-8 w-8 p-0"
                    title="Refresh Quest"
                  >
                    {refreshing ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

