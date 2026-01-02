"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import Link from "next/link"
import { SidebarNav } from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { DailyQuestCard } from "@/components/daily-quest-card"
import { AISuggestedCourseCard } from "@/components/ai-suggested-course-card"
import { CommunityPulseCard } from "@/components/community-pulse-card"

export default function LearningDashboard() {
  const { user, loading } = useAuth()
  const { setPageContext } = useChatbotContext()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
    }
  }, [user, loading, router])

  // Set chatbot context for dashboard page
  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Dashboard",
      description: "The user's learning dashboard with daily quests, AI-suggested courses, and community pulse. The user can track their progress, discover new courses, and see community activity.",
    })

    return () => {
      setPageContext(null)
    }
  }, [setPageContext])

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
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left Column: Daily Quest (full height) */}
              <div className="lg:row-span-2">
                <DailyQuestCard />
              </div>

              {/* Right Column: AI Suggested Course and Community Pulse */}
              <div className="space-y-6">
                <AISuggestedCourseCard />
                <CommunityPulseCard />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
