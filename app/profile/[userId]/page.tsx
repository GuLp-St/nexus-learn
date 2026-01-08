"use client"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Award, Star, Target, BookOpen, ArrowLeft, UserPlus, Send } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { getUserXP } from "@/lib/leaderboard-utils"
import { getUserCourses, getUserPublishedCoursesCount } from "@/lib/course-utils"
import { getLevelProgress } from "@/lib/level-utils"
import { getUserBadges, getBadgeDisplayInfo } from "@/lib/badge-utils"
import { getUserActivityThisWeek } from "@/lib/activity-tracker"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { getUserCosmetics } from "@/lib/cosmetics-utils"
import { PublishedCoursesModal } from "@/components/published-courses-modal"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"
import { areFriends, sendFriendRequest } from "@/lib/friends-utils"
import { WallpaperRenderer } from "@/components/wallpapers/wallpaper-renderer"

export default function UserProfileView() {
  const params = useParams()
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const userId = params.userId as string
  const isOwnProfile = currentUser?.uid === userId

  const [profileUser, setProfileUser] = useState<{
    nickname: string | null
    avatarUrl?: string | null
  } | null>(null)
  const [xp, setXP] = useState<number>(0)
  const [publishedCourses, setPublishedCourses] = useState<number>(0)
  const [coursesCompleted, setCoursesCompleted] = useState<number>(0)
  const [loadingStats, setLoadingStats] = useState(true)
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
  const [notFound, setNotFound] = useState(false)
  const [isFriend, setIsFriend] = useState(false)
  const [sendingRequest, setSendingRequest] = useState(false)
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [avatarFrame, setAvatarFrame] = useState<string | null>(null)
  const [nameColor, setNameColor] = useState<string | null>(null)
  const [publishedCoursesOpen, setPublishedCoursesOpen] = useState(false)
  const { setPageContext } = useChatContext()

  const getFrameXPClasses = (frameId: string | null) => {
    if (!frameId) return "text-primary"
    
    // Glow frames
    if (frameId === "frame-neon-blue") return "xp-glow-neon-blue"
    if (frameId === "frame-radioactive") return "xp-glow-radioactive"
    if (frameId === "frame-void") return "xp-glow-void"
    
    // Motion frames
    if (frameId === "frame-rgb-gamer") return "xp-frame-rgb-gamer"
    if (frameId === "frame-golden-lustre") return "xp-frame-golden-lustre"
    if (frameId === "frame-nexus-glitch") return "xp-frame-nexus-glitch"

    // Legendary Series (Structure) - Still provide a color for the XP bar
    if (frameId === "frame-laurels") return "text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
    if (frameId === "frame-devil-horns") return "text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
    if (frameId === "frame-crown") return "text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]"
    
    return "text-primary"
  }

  const renderStructuralXPFrame = (frameId: string | null) => {
    if (!frameId) return null

    // Structure frames
    if (frameId === "frame-laurels") {
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <div className="text-emerald-400 text-5xl">🌿</div>
        </div>
      )
    }
    if (frameId === "frame-devil-horns") {
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none z-50">
          <div className="text-red-500 text-5xl">👹</div>
        </div>
      )
    }
    if (frameId === "frame-crown") {
      return (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <div className="text-yellow-500 text-6xl">👑</div>
        </div>
      )
    }

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

  useEffect(() => {
    const fetchProfile = async () => {
      setLoadingStats(true)
      setLoadingActivity(true)

      try {
        // Fetch user profile
        const userRef = doc(db, "users", userId)
        const userDoc = await getDoc(userRef)

        if (!userDoc.exists()) {
          setNotFound(true)
          setLoadingStats(false)
          setLoadingActivity(false)
          return
        }

        const userData = userDoc.data()
        setProfileUser({
          nickname: userData.nickname || null,
          avatarUrl: userData.avatarUrl || null,
        })

        // Fetch XP and Published Courses
        const [xpData, publishedCount] = await Promise.all([
          getUserXP(userId),
          getUserPublishedCoursesCount(userId)
        ])
        
        if (xpData) {
          setXP(xpData.xp)

          // Calculate level progress
          const progress = getLevelProgress(xpData.xp)
          setLevelProgress({
            currentLevel: progress.currentLevel,
            progressPercentage: progress.progressPercentage,
            xpProgressToNext: progress.xpProgressToNext,
            xpNeededForNext: progress.xpNeededForNext,
          })
        }

        setPublishedCourses(publishedCount)

        // Fetch courses and count completed
        const courses = await getUserCourses(userId)
        const completed = courses.filter((c) => c.userProgress?.progress === 100).length
        setCoursesCompleted(completed)

        // Load cosmetics
        try {
          const userCosmetics = await getUserCosmetics(userId)
          setWallpaper(userCosmetics.wallpaper || null)
          setAvatarFrame(userCosmetics.avatarFrame || null)
          setNameColor(userCosmetics.nameColor || null)
        } catch (error) {
          console.error("Error loading cosmetics:", error)
        }

        // Fetch badges
        const userBadges = await getUserBadges(userId)
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

        // Fetch activity data
        const activityMap = await getUserActivityThisWeek(userId)
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

        // Check if users are friends
        if (currentUser) {
          const friendsStatus = await areFriends(currentUser.uid, userId)
          setIsFriend(friendsStatus)
        }

        // Context will be set in useEffect below
      } catch (error) {
        console.error("Error fetching profile:", error)
        setNotFound(true)
      } finally {
        setLoadingStats(false)
        setLoadingActivity(false)
      }
    }

    fetchProfile()
  }, [userId])

  // Set chatbot context with real-time profile data
  useEffect(() => {
    if (!loadingStats && !loadingActivity && profileUser) {
      setPageContext({
        title: `Profile: ${profileUser.nickname || "User"}`,
        description: `Viewing profile page for ${profileUser.nickname || "the user"}. Shows learning statistics, badges, and achievements.`,
        data: {
          userId,
          nickname: profileUser.nickname,
          avatarUrl: profileUser.avatarUrl,
          xp,
          publishedCourses,
          levelProgress,
          coursesCompleted,
          badges,
          activityData,
          wallpaper,
          avatarFrame,
          nameColor,
        },
      })
    }
  }, [loadingStats, loadingActivity, profileUser, userId, xp, publishedCourses, levelProgress, coursesCompleted, badges, activityData, wallpaper, avatarFrame, nameColor, setPageContext])

  // Redirect to own profile if viewing own profile
  useEffect(() => {
    if (isOwnProfile) {
      router.replace("/profile")
    }
  }, [isOwnProfile, router])

  if (notFound) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/profile" />
        <main className="flex-1">
          <div className="p-4 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12">
                  <h2 className="text-2xl font-bold text-foreground mb-4">User Not Found</h2>
                  <p className="text-muted-foreground mb-6">The user profile you're looking for doesn't exist.</p>
                  <Link href="/leaderboard">
                    <Button>Back to Leaderboard</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (isOwnProfile || !profileUser) {
    return null // Will redirect
  }

  const displayName = profileUser.nickname || "User"
  const initials = getInitials(profileUser.nickname)
  const maxHours = activityData.length > 0 ? Math.max(...activityData.map((d) => d.hours), 1) : 1

  // Get wallpaper class (strip "wallpaper-" prefix if present)
  const wallpaperClass = wallpaper ? `cosmetic-wallpaper-${wallpaper.replace("wallpaper-", "")}` : ""
  const profileThemeClass = wallpaper ? "profile-glass-theme" : ""

  return (
    <div className={`flex flex-col min-h-screen bg-background lg:flex-row ${wallpaperClass} ${profileThemeClass}`}>
      <WallpaperRenderer wallpaper={wallpaper} />
      <SidebarNav 
        currentPath="/profile" 
        title={`${displayName}'s Profile`}
        leftAction={
          <Link href="/leaderboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-8">
            {/* Back Button (Desktop) */}
            <div className="hidden lg:block">
              <Link href="/leaderboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Leaderboard
                </Button>
              </Link>
            </div>

            {/* Profile Header */}
            <div className="flex flex-col items-center space-y-4 text-center">
              {/* Avatar with Level Progress */}
              <div className="relative h-40 w-40 flex items-center justify-center">
                {/* Glitch XP ring - CSS-based with progress */}
                {avatarFrame === "frame-nexus-glitch" ? (
                  <div 
                    className="glitch-xp-ring" 
                    style={{ "--progress": levelProgress?.progressPercentage || 0 } as React.CSSProperties}
                  />
                ) : (
                  <svg className="absolute inset-0 h-40 w-40 -rotate-90 transform" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r="76"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-accent/20"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="76"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 76}`}
                      strokeDashoffset={`${2 * Math.PI * 76 * (1 - (levelProgress?.progressPercentage || 0) / 100)}`}
                      className={`${getFrameXPClasses(avatarFrame)} transition-all duration-1000`}
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                <AvatarWithCosmetics
                  userId={userId}
                  nickname={profileUser.nickname}
                  avatarUrl={profileUser.avatarUrl}
                  size="xl"
                  hideFrame={true}
                />
                {renderStructuralXPFrame(avatarFrame)}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-bold text-primary-foreground shadow-md z-10">
                  {loadingStats ? "..." : `Level ${levelProgress?.currentLevel || 1}`}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3 justify-center">
                  <h2 
                    className="text-2xl font-bold text-foreground"
                    data-has-name-color={nameColor ? "true" : "false"}
                  >
                    <NameWithColor
                      userId={userId}
                      name={displayName}
                    />
                  </h2>
                  {currentUser && !isOwnProfile && !isFriend && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!currentUser || sendingRequest) return
                        try {
                          setSendingRequest(true)
                          await sendFriendRequest(currentUser.uid, userId)
                          setIsFriend(true)
                        } catch (error: any) {
                          console.error("Error sending friend request:", error)
                          alert(error.message || "Failed to send friend request")
                        } finally {
                          setSendingRequest(false)
                        }
                      }}
                      disabled={sendingRequest}
                      className="gap-1 add-friend-button"
                    >
                      <UserPlus className="h-4 w-4" />
                      {sendingRequest ? "Sending..." : "Add Friend"}
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {levelProgress && !loadingStats
                    ? `${levelProgress.xpProgressToNext} XP to Level ${levelProgress.currentLevel + 1}`
                    : "Learning Enthusiast"}
                </p>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="card-on-wallpaper">
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
                </CardContent>
              </Card>

              <Card className="card-on-wallpaper">
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
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer card-on-wallpaper hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50 group"
                onClick={() => setPublishedCoursesOpen(true)}
              >
                <CardHeader className="pb-3">
                  <CardDescription className="text-sm">Published Courses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {loadingStats ? "..." : publishedCourses}
                    </span>
                    <span className="text-sm text-muted-foreground">Courses</span>
                    <Send className="h-5 w-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
                </CardContent>
              </Card>
            </div>

            {/* Badges Section */}
            <Card className="card-on-wallpaper">
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

            {/* Activity This Week */}
            <Card className="card-on-wallpaper">
              <CardHeader>
                <CardTitle>Activity This Week</CardTitle>
                <CardDescription>Hours spent learning each day</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingActivity ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">Loading activity...</div>
                  </div>
                ) : activityData.length === 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">No activity data available</div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-2 sm:gap-4">
                    {activityData.map((data, index) => (
                      <div key={index} className="flex flex-1 flex-col items-center gap-2">
                        <div className="relative w-full">
                          <div className="flex h-40 w-full items-end">
                            <div
                              className="w-full rounded-t-md bg-primary transition-all hover:bg-primary/80"
                              style={{ height: `${(data.hours / maxHours) * 100}%`, minHeight: "8px" }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{data.day}</span>
                        <span className="text-xs text-muted-foreground">{data.hours > 0 ? `${data.hours.toFixed(1)}h` : "0h"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <PublishedCoursesModal
        open={publishedCoursesOpen}
        onOpenChange={setPublishedCoursesOpen}
        userId={userId}
      />
    </div>
  )
}

