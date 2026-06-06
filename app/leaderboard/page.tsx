"use client"

import { useState, useEffect } from "react"
import { Medal, Trophy, UserPlus, Flame } from "lucide-react"
import { WinStreakFlame } from "@/components/challenge/win-streak-flame"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SidebarNav from "@/components/sidebar-nav"
import { useChatContext } from "@/context/ChatContext"
import { useAuth } from "@/components/auth-provider"
import { getLeaderboardWithUser, getFriendsLeaderboard, LeaderboardUser } from "@/lib/leaderboard-utils"
import { areFriends, sendFriendRequest } from "@/lib/friends-utils"
import { Spinner } from "@/components/ui/spinner"
import { XPHistoryModal } from "@/components/xp-history-modal"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { getLevelProgress } from "@/lib/level-utils"
import { trackQuestProgress } from "@/lib/daily-quest-utils"
import Link from "next/link"

export default function LeaderboardPage() {
  const [viewMode, setViewMode] = useState<"global" | "friends">("global")
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([])
  const [userRank, setUserRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [userXP, setUserXP] = useState<number>(0)
  const [friendsSet, setFriendsSet] = useState<Set<string>>(new Set())
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(new Set())
  const [xpHistoryOpen, setXpHistoryOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const { user } = useAuth()
  const { setPageContext } = useChatContext()

  const getFrameXPClasses = (frameId: string | null | undefined) => {
    if (!frameId) return "text-primary"
    
    // Glow frames
    if (frameId === "frame-neon-blue") return "xp-glow-neon-blue"
    if (frameId === "frame-radioactive") return "xp-glow-radioactive"
    if (frameId === "frame-void") return "xp-glow-void"
    
    // Motion frames
    if (frameId === "frame-rgb-gamer") return "xp-frame-rgb-gamer"
    if (frameId === "frame-golden-lustre") return "xp-frame-golden-lustre"
    if (frameId === "frame-nexus-glitch") return "xp-frame-nexus-glitch"

    // Legendary Series (Structure) - Still provide a color for the frame
    if (frameId === "frame-laurels") return "text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
    if (frameId === "frame-devil-horns") return "text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
    if (frameId === "frame-crown") return "text-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.4)]"
    
    return "text-primary"
  }

  const renderStructuralXPFrame = (frameId: string | null | undefined, size: number = 40) => {
    if (!frameId) return null

    const iconSizeClass = size > 50 ? "text-2xl" : "text-sm"
    const zIndex = "z-50"

    // Structure frames
    if (frameId === "frame-laurels") {
      return (
        <div className={`absolute ${size > 50 ? "-top-2" : "-top-1"} left-1/2 -translate-x-1/2 pointer-events-none ${zIndex}`}>
          <div className={`text-emerald-400 ${iconSizeClass}`}>🌿</div>
        </div>
      )
    }
    if (frameId === "frame-devil-horns") {
      return (
        <div className={`absolute ${size > 50 ? "-top-2" : "-top-1"} left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none ${zIndex}`}>
          <div className={`text-red-500 ${iconSizeClass}`}>👹</div>
        </div>
      )
    }
    if (frameId === "frame-crown") {
      return (
        <div className={`absolute ${size > 50 ? "-top-3" : "-top-2"} left-1/2 -translate-x-1/2 pointer-events-none ${zIndex}`}>
          <div className={`text-yellow-500 ${size > 50 ? "text-3xl" : "text-lg"}`}>👑</div>
        </div>
      )
    }

    return null
  }

  // Fetch leaderboard data and friends
  useEffect(() => {
    if (user) {
      trackQuestProgress(user.uid, "visit_leaderboard")
    }

    const fetchLeaderboard = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        if (viewMode === "friends") {
          // Fetch friends-only leaderboard
          const { leaderboard, userRank: rank } = await getFriendsLeaderboard(user.uid, 5)
          setLeaderboardUsers(leaderboard)
          setUserRank(rank)

          // Get user XP
          const userData = leaderboard.find((u) => u.userId === user.uid)
          if (userData) {
            setUserXP(userData.xp)
          } else {
            // If user not in friends leaderboard, get their XP separately
            const { getUserXP } = await import("@/lib/leaderboard-utils")
            const xpData = await getUserXP(user.uid)
            if (xpData) {
              setUserXP(xpData.xp)
            }
          }

          // All users in friends leaderboard are friends
          const friends = new Set(leaderboard.map((u) => u.userId))
          setFriendsSet(friends)
        } else {
          // Fetch global leaderboard
          const { leaderboard, userRank: rank } = await getLeaderboardWithUser(user.uid, 5)
          setLeaderboardUsers(leaderboard)
          setUserRank(rank)

          // Get user XP
          const userData = leaderboard.find((u) => u.userId === user.uid)
          if (userData) {
            setUserXP(userData.xp)
          }

          // Check which users are friends
          const friendsChecks = await Promise.all(
            leaderboard.map((u) =>
              areFriends(user.uid, u.userId).then((areFriends) => ({
                userId: u.userId,
                areFriends,
              }))
            )
          )
          const friends = new Set(
            friendsChecks.filter((check) => check.areFriends).map((check) => check.userId)
          )
          setFriendsSet(friends)
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [user, viewMode])

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!user) return

    try {
      setSendingRequests((prev) => new Set(prev).add(targetUserId))
      await sendFriendRequest(user.uid, targetUserId)
      // Refresh friends set
      const isFriend = await areFriends(user.uid, targetUserId)
      setFriendsSet((prev) => {
        const newSet = new Set(prev)
        if (isFriend) {
          newSet.add(targetUserId)
        }
        return newSet
      })
    } catch (error: any) {
      console.error("Error sending friend request:", error)
      alert(error.message || "Failed to send friend request")
    } finally {
      setSendingRequests((prev) => {
        const newSet = new Set(prev)
        newSet.delete(targetUserId)
        return newSet
      })
    }
  }

  // Set chatbot context with real-time leaderboard data
  useEffect(() => {
    if (user) {
      setPageContext({
        title: "Leaderboard",
        description: userRank !== null && userXP > 0
          ? `Global leaderboard showing rankings. The user is currently ranked ${userRank}${userRank === 1 ? "st" : userRank === 2 ? "nd" : userRank === 3 ? "rd" : "th"} with ${userXP.toLocaleString()} XP. They can view global rankings or friends-only rankings. The user can ask about rankings, how to improve their position, or learning strategies.`
          : "Global leaderboard showing rankings. The user can view global rankings or friends-only rankings. The user can ask about rankings, how to improve their position, or learning strategies.",
        data: {
          userRank,
          userXP,
          viewMode: viewMode,
          topUsers: leaderboardUsers.slice(0, 10).map((user, index) => ({
            rank: index + 1,
            userId: user.userId,
            nickname: user.nickname,
            xp: user.xp,
          })),
        },
      })
    }
  }, [user, userRank, userXP, viewMode, leaderboardUsers, setPageContext])

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Medal className="h-6 w-6 text-yellow-500" />
    if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />
    if (rank === 3) return <Medal className="h-6 w-6 text-amber-600" />
    return null
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/leaderboard" title="Leaderboard" />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {/* Header with Toggle */}
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {viewMode === "friends" ? "Friends Rankings" : "Global Rankings"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {viewMode === "friends" ? "See how you compare with your friends" : "Compete with learners worldwide"}
                </p>
              </div>

              {/* Toggle Buttons */}
              <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                <button
                  onClick={() => setViewMode("global")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === "global"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Global
                </button>
                <button
                  onClick={() => setViewMode("friends")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === "friends"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Friends Only
                </button>
              </div>
            </div>

            {/* Leaderboard List */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="h-8 w-8" />
                  </div>
                ) : leaderboardUsers.length === 0 ? (
                  <div className="flex items-center justify-center p-12">
                    <p className="text-muted-foreground">
                      {viewMode === "friends" ? "No friends to display. Add some friends to see the leaderboard!" : "No users found"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {leaderboardUsers.map((leaderboardUser) => {
                      const isMe = leaderboardUser.userId === user?.uid
                      const levelProgress = getLevelProgress(leaderboardUser.xp)
                      
                      return (
                        <div
                          key={leaderboardUser.userId}
                          className={`flex flex-col gap-2 p-3 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:p-5 lg:gap-6 ${
                            isMe ? "bg-primary/10" : "hover:bg-accent/50"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Rank */}
                          <div className="flex w-10 sm:w-12 items-center justify-center shrink-0">
                            {getRankIcon(leaderboardUser.rank) || (
                              <span className="text-xl font-bold text-muted-foreground">#{leaderboardUser.rank}</span>
                            )}
                          </div>

                          {/* Avatar */}
                          <div className="relative h-12 w-12 sm:h-16 sm:w-16 flex items-center justify-center shrink-0">
                            {/* Glitch ring (full circle) or regular SVG ring */}
                            {leaderboardUser.avatarFrame === "frame-nexus-glitch" ? (
                              <div className="glitch-ring-full" />
                            ) : (
                              <svg className="absolute inset-0 h-12 w-12 sm:h-16 sm:w-16 -rotate-90 transform" viewBox="0 0 64 64">
                                <circle
                                  cx="32"
                                  cy="32"
                                  r="30"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                  className={`${getFrameXPClasses(leaderboardUser.avatarFrame)} transition-all duration-1000`}
                                />
                              </svg>
                            )}
                            <AvatarWithCosmetics
                              userId={leaderboardUser.userId}
                              nickname={leaderboardUser.nickname}
                              avatarUrl={leaderboardUser.avatarUrl}
                              size="lg"
                              hideFrame={true}
                              refreshKey={0}
                              avatarSeed={leaderboardUser.avatarSeed}
                            />
                            {renderStructuralXPFrame(leaderboardUser.avatarFrame, 48)}
                          </div>

                          {/* Username */}
                          <div className="flex-1 min-w-0">
                            {isMe ? (
                              <p className="font-semibold text-primary">You</p>
                            ) : (
                              <Link
                                href={`/profile/${leaderboardUser.userId}`}
                                className="font-semibold text-foreground hover:text-primary hover:underline"
                              >
                                <NameWithColor
                                  userId={leaderboardUser.userId}
                                  name={leaderboardUser.nickname}
                                />
                              </Link>
                            )}
                            {isMe && <p className="text-xs text-primary">My Rank</p>}
                          </div>
                          </div>

                          {/* XP Points and Challenge Wins */}
                          <div className="flex items-center justify-around sm:justify-end gap-3 sm:gap-4 shrink-0 pl-0 sm:pl-0">
                            <div 
                              className="text-center sm:text-right cursor-pointer hover:opacity-80 transition-opacity min-w-[3.5rem]"
                              onClick={() => {
                                setSelectedUserId(leaderboardUser.userId)
                                setXpHistoryOpen(true)
                              }}
                            >
                              <p className={`text-base sm:text-lg font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                                {leaderboardUser.xp.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">XP</p>
                            </div>
                            <div className="text-center sm:text-right min-w-[3rem]">
                              <p className={`text-base sm:text-lg font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                                {leaderboardUser.challengeWins || 0}
                              </p>
                              <p className="text-xs text-muted-foreground">Wins</p>
                            </div>
                            <div className="text-center sm:text-right min-w-[3.5rem] overflow-visible">
                              <WinStreakFlame
                                streak={leaderboardUser.challengeWinStreak || 0}
                                compact
                                className={isMe ? "justify-center sm:justify-end" : "justify-center sm:justify-end"}
                              />
                              <p className="text-xs text-muted-foreground">Streak</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Section */}
            {!loading && user && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <Trophy className="mx-auto mb-2 h-8 w-8 text-primary" />
                    <p className="text-2xl font-bold text-foreground">
                      {userRank
                        ? `${userRank}${userRank === 1 ? "st" : userRank === 2 ? "nd" : userRank === 3 ? "rd" : "th"}`
                        : "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">Your Rank</p>
                  </CardContent>
                </Card>
                <Card 
                  className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50"
                  onClick={() => {
                    setSelectedUserId(user.uid)
                    setXpHistoryOpen(true)
                  }}
                >
                <CardContent className="p-6 text-center">
                  <div className="mx-auto mb-2 text-2xl">⚡</div>
                  <p className="text-2xl font-bold text-foreground">
                    {userXP.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Total XP</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
                </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <Trophy className="mx-auto mb-2 h-8 w-8 text-primary" />
                    <p className="text-2xl font-bold text-foreground">
                      {(() => {
                        const userData = leaderboardUsers.find((u) => u.userId === user.uid)
                        return userData?.challengeWins || 0
                      })()}
                    </p>
                    <p className="text-sm text-muted-foreground">Challenge Wins</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <Flame className="mx-auto mb-2 h-8 w-8 text-orange-500" />
                    <div className="flex justify-center">
                      <WinStreakFlame
                        streak={
                          leaderboardUsers.find((u) => u.userId === user.uid)?.challengeWinStreak || 0
                        }
                        showZero
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Win Streak</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
      {selectedUserId && (
        <XPHistoryModal 
          open={xpHistoryOpen} 
          onOpenChange={(open) => {
            setXpHistoryOpen(open)
            if (!open) setSelectedUserId(null)
          }} 
          userId={selectedUserId} 
        />
      )}
    </div>
  )
}
