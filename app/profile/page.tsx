"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Award, Flame, Star, Target, Clock, BookOpen, Settings } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getUserXP } from "@/lib/leaderboard-utils"
import { getUserCourses } from "@/lib/course-utils"
import { getLevelProgress } from "@/lib/level-utils"
import { ProfileSettingsModal } from "@/components/profile-settings-modal"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { getUserBadges, getBadgeDisplayInfo, checkAndUpdateBadges } from "@/lib/badge-utils"
import { XPHistoryModal } from "@/components/xp-history-modal"
import { CompletedCoursesModal } from "@/components/completed-courses-modal"

export default function UserProfile() {
  const { nickname, user, loading, avatarUrl, refreshProfile } = useAuth()
  const [xp, setXP] = useState<number>(0)
  const [dailyStreak, setDailyStreak] = useState<number>(0)
  const [coursesCompleted, setCoursesCompleted] = useState<number>(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [levelProgress, setLevelProgress] = useState<{
    currentLevel: number
    progressPercentage: number
    xpProgressToNext: number
    xpNeededForNext: number
  } | null>(null)
  const [badges, setBadges] = useState<Array<{
    id: string
    name: string
    description: string
    icon: string
    earned: boolean
  }>>([])
  const [activityData, setActivityData] = useState<Array<{ day: string; hours: number }>>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [xpHistoryOpen, setXpHistoryOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [completedCoursesOpen, setCompletedCoursesOpen] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) {
        setLoadingStats(false)
        return
      }

      try {
        // Fetch XP
        const xpData = await getUserXP(user.uid)
        if (xpData) {
          setXP(xpData.xp)
          setDailyStreak(xpData.dailyLoginStreak || 0)
          
          // Calculate level progress
          const progress = getLevelProgress(xpData.xp)
          setLevelProgress({
            currentLevel: progress.currentLevel,
            progressPercentage: progress.progressPercentage,
            xpProgressToNext: progress.xpProgressToNext,
            xpNeededForNext: progress.xpNeededForNext,
          })
        }

        // Fetch courses and count completed
        const courses = await getUserCourses(user.uid)
        const completed = courses.filter((c) => c.userProgress?.progress === 100).length
        setCoursesCompleted(completed)

        // Check and update badges
        await checkAndUpdateBadges(user.uid)

        // Fetch badges
        const userBadges = await getUserBadges(user.uid)
        if (userBadges) {
          const badgeList = [
            getBadgeDisplayInfo("first-steps", userBadges.badges["first-steps"].unlocked, userBadges.badges["first-steps"].unlockedAt),
            getBadgeDisplayInfo("quiz-master", userBadges.badges["quiz-master"].unlocked, userBadges.badges["quiz-master"].unlockedAt),
            getBadgeDisplayInfo("marathon-runner", userBadges.badges["marathon-runner"].unlocked, userBadges.badges["marathon-runner"].unlockedAt),
            getBadgeDisplayInfo("early-bird", userBadges.badges["early-bird"].unlocked, userBadges.badges["early-bird"].unlockedAt),
            getBadgeDisplayInfo("knowledge-seeker", userBadges.badges["knowledge-seeker"].unlocked, userBadges.badges["knowledge-seeker"].unlockedAt),
            getBadgeDisplayInfo("perfectionist", userBadges.badges["perfectionist"].unlocked, userBadges.badges["perfectionist"].unlockedAt),
          ].map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            icon: b.icon,
            earned: b.unlocked,
          }))
          setBadges(badgeList)
        }
      } catch (error) {
        console.error("Error fetching user stats:", error)
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [user])

  // Fetch activity data
  useEffect(() => {
    const fetchActivity = async () => {
      if (!user) {
        setLoadingActivity(false)
        return
      }

      try {
        const { getUserActivityThisWeek } = await import("@/lib/activity-tracker")
        const activityMap = await getUserActivityThisWeek(user.uid)

        // Convert map to array with day names
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        const today = new Date()
        const activityArray = []

        for (let i = 6; i >= 0; i--) {
          const date = new Date(today)
          date.setDate(date.getDate() - i)
          const dateString = date.toISOString().split("T")[0]
          const dayIndex = date.getDay()
          const hours = activityMap.get(dateString) || 0

          activityArray.push({
            day: days[dayIndex],
            hours,
          })
        }

        setActivityData(activityArray)
      } catch (error) {
        console.error("Error fetching activity data:", error)
        setActivityData([])
      } finally {
        setLoadingActivity(false)
      }
    }

    fetchActivity()
  }, [user])

  const handleProfileUpdate = async () => {
    // Refresh profile data
    await refreshProfile()
    
    // Refresh stats
    if (user) {
      try {
        const xpData = await getUserXP(user.uid)
        if (xpData) {
          setXP(xpData.xp)
          const progress = getLevelProgress(xpData.xp)
          setLevelProgress({
            currentLevel: progress.currentLevel,
            progressPercentage: progress.progressPercentage,
            xpProgressToNext: progress.xpProgressToNext,
            xpNeededForNext: progress.xpNeededForNext,
          })
        }
      } catch (error) {
        console.error("Error refreshing stats:", error)
      }
    }
  }
  const router = useRouter()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
    }
  }, [user, loading, router])

  // Set chatbot context for profile page
  useEffect(() => {
    if (user) {
      setPageContext({
        type: "generic",
        pageName: "Profile",
        description: `User profile page for ${nickname || "the user"}. Shows learning statistics, badges, and achievements. The user has earned badges like Quiz Master, Early Bird, and Bookworm. The user can ask about their profile, achievements, badges, or learning statistics.`,
      })

      return () => {
        setPageContext(null)
      }
    }
  }, [user, nickname, setPageContext])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Generate initials from nickname
  const getInitials = (name: string | null) => {
    if (!name) return "U"
    const parts = name.trim().split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const displayName = nickname || "User"
  const initials = getInitials(nickname)

  const maxHours = activityData.length > 0 ? Math.max(...activityData.map((d) => d.hours), 1) : 1

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/profile" title="My Profile" />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-8">
            {/* Profile Header */}
            <div className="flex flex-col items-center space-y-4 text-center">
              {/* Avatar with Level Progress */}
              <div className="relative">
                <svg className="h-40 w-40 -rotate-90 transform" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-accent"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 70}`}
                    strokeDashoffset={`${2 * Math.PI * 70 * (1 - (levelProgress?.progressPercentage || 0) / 100)}`}
                    className="text-primary transition-all duration-500"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={displayName} />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-5xl font-bold text-white">
                        {initials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-bold text-primary-foreground shadow-md">
                  {loadingStats ? "..." : `Level ${levelProgress?.currentLevel || 1}`}
                </div>
              </div>

              <div className="relative">
                <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -right-12 top-0 h-8 w-8"
                  onClick={() => setSettingsOpen(true)}
                  title="Edit Profile"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <p className="text-muted-foreground">
                  {levelProgress && !loadingStats
                    ? `${levelProgress.xpProgressToNext} XP to Level ${levelProgress.currentLevel + 1}`
                    : "Aspiring Data Scientist"}
                </p>
              </div>
            </div>

            {/* Settings Modal */}
            <ProfileSettingsModal
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onUpdate={handleProfileUpdate}
            />

            {/* Stats Row */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card 
                className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50"
                onClick={() => {
                  setSelectedUserId(user?.uid || null)
                  setXpHistoryOpen(true)
                }}
              >
                <CardHeader className="pb-3">
                  <CardDescription className="text-sm">Total XP</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {loadingStats ? "..." : xp.toLocaleString()}
                    </span>
                    <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50"
                onClick={() => setCompletedCoursesOpen(true)}
              >
                <CardHeader className="pb-3">
                  <CardDescription className="text-sm">Courses Completed</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {loadingStats ? "..." : coursesCompleted}
                    </span>
                    <Award className="h-5 w-5 text-teal-600" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardDescription className="text-sm">Daily Streak</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {loadingStats ? "..." : dailyStreak}
                    </span>
                    <span className="text-sm text-muted-foreground">Days</span>
                    <Flame className="h-5 w-5 fill-orange-500 text-orange-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Badges Section */}
            <Card>
              <CardHeader>
                <CardTitle>Earned Badges</CardTitle>
                <CardDescription>Unlock badges by completing challenges and achievements</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Loading badges...</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {badges.map((badge) => (
                      <div
                        key={badge.id}
                        className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                          badge.earned
                            ? "border-primary/20 bg-primary/5 shadow-sm"
                            : "border-border bg-muted/30 opacity-50"
                        }`}
                        title={badge.description}
                      >
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                            badge.earned ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          {badge.icon}
                        </div>
                        <span
                          className={`text-center text-sm font-medium ${badge.earned ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {badge.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Activity This Week</CardTitle>
                <CardDescription>Hours spent learning each day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2 sm:gap-4">
                  {activityData.map((data) => (
                    <div key={data.day} className="flex flex-1 flex-col items-center gap-2">
                      <div className="relative w-full">
                        <div className="flex h-40 w-full items-end">
                          <div
                            className="w-full rounded-t-md bg-primary transition-all hover:bg-primary/80"
                            style={{ height: `${(data.hours / maxHours) * 100}%`, minHeight: "8px" }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{data.day}</span>
                      <span className="text-xs text-muted-foreground">{data.hours}h</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      
      {selectedUserId && (
        <XPHistoryModal
          open={xpHistoryOpen}
          onOpenChange={setXpHistoryOpen}
          userId={selectedUserId}
        />
      )}
      {user && (
        <CompletedCoursesModal
          open={completedCoursesOpen}
          onOpenChange={setCompletedCoursesOpen}
          userId={user.uid}
        />
      )}
    </div>
  )
}
