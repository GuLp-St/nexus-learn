"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import Link from "next/link"
import { SidebarNav } from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { DailyQuestCard } from "@/components/daily-quest-card"
import { AISuggestedCourseCard } from "@/components/ai-suggested-course-card"
import { CommunityPulseCard } from "@/components/community-pulse-card"
import { subscribeToCommunityActivities } from "@/lib/community-pulse-utils"

export default function LearningDashboard() {
  const { user, loading } = useAuth()
  const { setPageContext } = useChatContext()
  const router = useRouter()
  const [dailyQuests, setDailyQuests] = useState<any>(null)
  const [communityActivities, setCommunityActivities] = useState<any[]>([])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
    }
  }, [user, loading, router])

  // Load daily quests
  useEffect(() => {
    if (user) {
      const loadQuests = async () => {
        try {
          const { getUserDailyQuests } = await import("@/lib/daily-quest-utils")
          const quests = await getUserDailyQuests(user.uid)
          setDailyQuests(quests)
        } catch (error) {
          console.error("Error loading daily quests:", error)
        }
      }
      loadQuests()
    }
  }, [user])

  // Load community activities
  useEffect(() => {
    if (!user) return

    const unsubscribe = subscribeToCommunityActivities(5, (activities) => {
      setCommunityActivities(activities)
    })

    return () => {
      unsubscribe()
    }
  }, [user])

  // Set chatbot context for dashboard page with real-time data
  useEffect(() => {
    if (!loading && user) {
      setPageContext({
        title: "Dashboard",
        description: "The user's learning dashboard with daily quests, AI-suggested courses, and community pulse. The user can track their progress, discover new courses, and see community activity.",
        data: {
          userId: user.uid,
          pageType: "dashboard",
          dailyQuests: dailyQuests?.quests?.map((quest: any) => ({
            id: quest.id,
            type: quest.type,
            title: quest.title,
            description: quest.description,
            target: quest.target,
            progress: quest.progress,
            completed: quest.completed,
            claimed: quest.claimed,
            xpReward: quest.xpReward,
            nexonReward: quest.nexonReward,
          })) || [],
          communityActivities: communityActivities.map(activity => ({
            type: activity.activityType,
            userNickname: activity.userNickname,
            userAvatarUrl: activity.userAvatarUrl,
            metadata: activity.metadata,
            relativeTime: activity.relativeTime,
          })),
        },
      })
    }
  }, [loading, user, dailyQuests, communityActivities, setPageContext])

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/" />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          {/* Search Section */}
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="space-y-4 text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                What do you want to learn today?
              </h2>
              <div className="relative mx-auto max-w-2xl">
                <Link href="/create-course" className="block">
                  <div className="relative cursor-pointer">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <div className="h-14 rounded-md border border-input bg-background pl-12 pr-4 text-base text-muted-foreground shadow-sm transition-colors hover:border-primary flex items-center">
                      Search for courses, topics, or skills...
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Dashboard Cards Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Daily Quest */}
              <div>
                <DailyQuestCard />
              </div>

              {/* Community Pulse */}
              <div>
                <CommunityPulseCard />
              </div>

              {/* AI Suggested Course */}
              <div>
                <AISuggestedCourseCard />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
