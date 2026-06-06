"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SidebarNav } from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { DailyQuestCard } from "@/components/daily-quest-card"
import { AISuggestedCourseCard } from "@/components/ai-suggested-course-card"
import { CommunityPulseCard } from "@/components/community-pulse-card"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { subscribeToCommunityActivities } from "@/lib/community-pulse-utils"

export default function LearningDashboard() {
  const { user, loading } = useAuth()
  const { setPageContext } = useChatContext()
  const router = useRouter()
  const [dailyQuests, setDailyQuests] = useState<any>(null)
  const [communityActivities, setCommunityActivities] = useState<any[]>([])
  const [courseCount, setCourseCount] = useState(0)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      import("@/lib/course-utils").then(({ getUserCourses }) => {
        getUserCourses(user.uid).then((courses) => setCourseCount(courses.length))
      })
    }
  }, [user])

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

  const claimableQuestCount =
    dailyQuests?.quests?.filter((q: { completed: boolean; claimed: boolean }) => q.completed && !q.claimed)
      .length ?? 0

  // Set chatbot context for dashboard page with real-time data
  useEffect(() => {
    if (!loading && user) {
      const chips: string[] = ["What are my quests today?"]
      if (claimableQuestCount > 0) {
        chips.unshift("Which quests can I claim?")
      }
      chips.push("How do I earn more Nexon?")

      setPageContext({
        title: "Dashboard",
        description: "The user's learning dashboard with daily quests, AI-suggested courses, and community pulse. The user can track their progress, discover new courses, and see community activity.",
        suggestedChips: chips.slice(0, 4),
        pageData: {
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
          claimableQuestCount,
        },
      })
    }
  }, [loading, user, dailyQuests, communityActivities, claimableQuestCount, setPageContext])

  // Show loading state while checking auth
  if (loading) {
    return <LoadingScreen />
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
              <div className="flex justify-center">
                <Button asChild size="lg" className="gap-2 h-14 px-8 text-base">
                  <Link href="/create-course">
                    <Plus className="h-5 w-5" />
                    {courseCount === 0 ? "Add a course now!" : "Add more courses!"}
                  </Link>
                </Button>
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
