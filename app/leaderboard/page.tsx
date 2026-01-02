"use client"

import { useState, useEffect } from "react"
import { Medal, Trophy, UserPlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SidebarNav from "@/components/sidebar-nav"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { useAuth } from "@/components/auth-provider"
import { getLeaderboardWithUser, getFriendsLeaderboard, LeaderboardUser } from "@/lib/leaderboard-utils"
import { areFriends, sendFriendRequest } from "@/lib/friends-utils"
import { Spinner } from "@/components/ui/spinner"
import { XPHistoryModal } from "@/components/xp-history-modal"
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
  const { setPageContext } = useChatbotContext()
  const { user } = useAuth()

  // Fetch leaderboard data and friends
  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        if (viewMode === "friends") {
          // Fetch friends-only leaderboard
          const { leaderboard, userRank: rank } = await getFriendsLeaderboard(user.uid, 10)
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
          const { leaderboard, userRank: rank } = await getLeaderboardWithUser(user.uid, 10)
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

  // Set chatbot context for leaderboard page
  useEffect(() => {
    if (userRank !== null && userXP > 0) {
      setPageContext({
        type: "generic",
        pageName: "Leaderboard",
        description: `Global leaderboard showing rankings. The user is currently ranked ${userRank}${userRank === 1 ? "st" : userRank === 2 ? "nd" : userRank === 3 ? "rd" : "th"} with ${userXP.toLocaleString()} XP. They can view global rankings or friends-only rankings. The user can ask about rankings, how to improve their position, or learning strategies.`,
      })
    } else {
      setPageContext({
        type: "generic",
        pageName: "Leaderboard",
        description: "Global leaderboard showing rankings. The user can view global rankings or friends-only rankings. The user can ask about rankings, how to improve their position, or learning strategies.",
      })
    }

    return () => {
      setPageContext(null)
    }
  }, [setPageContext, userRank, userXP])

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
                      return (
                        <div
                          key={leaderboardUser.userId}
                          className={`flex items-center gap-4 p-4 transition-colors sm:gap-6 sm:p-5 ${
                            isMe ? "bg-primary/10" : "hover:bg-accent/50"
                          }`}
                        >
                          {/* Rank */}
                          <div className="flex w-12 items-center justify-center">
                            {getRankIcon(leaderboardUser.rank) || (
                              <span className="text-xl font-bold text-muted-foreground">#{leaderboardUser.rank}</span>
                            )}
                          </div>

                          {/* Avatar */}
                          <div className="relative">
                            {leaderboardUser.avatarUrl ? (
                              <div
                                className={`h-12 w-12 rounded-full overflow-hidden ${
                                  isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                                }`}
                              >
                                <img
                                  src={leaderboardUser.avatarUrl}
                                  alt={leaderboardUser.nickname}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div
                                className={`h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center ${
                                  isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                                }`}
                              >
                                <span className="text-lg font-semibold text-primary">
                                  {leaderboardUser.nickname.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Username */}
                          <div className="flex-1">
                            {isMe ? (
                              <p className="font-semibold text-primary">You</p>
                            ) : (
                              <Link
                                href={`/profile/${leaderboardUser.userId}`}
                                className="font-semibold text-foreground hover:text-primary hover:underline"
                              >
                                {leaderboardUser.nickname}
                              </Link>
                            )}
                            {isMe && <p className="text-xs text-primary">My Rank</p>}
                          </div>

                          {/* XP Points and Challenge Wins */}
                          <div className="flex items-center gap-4">
                            <div 
                              className="text-right cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                setSelectedUserId(leaderboardUser.userId)
                                setXpHistoryOpen(true)
                              }}
                            >
                              <p className={`text-lg font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                                {leaderboardUser.xp.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">XP</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                                {leaderboardUser.challengeWins || 0}
                              </p>
                              <p className="text-xs text-muted-foreground">Wins</p>
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
              <div className="grid gap-4 sm:grid-cols-3">
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
