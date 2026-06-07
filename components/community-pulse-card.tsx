"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Users, Ghost } from "lucide-react"
import {
  subscribeToCommunityActivities,
  formatActivityDescription,
  CommunityActivity,
} from "@/lib/community-pulse-utils"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { useRouter } from "next/navigation"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { getUserCourseLimits, type CourseLimitInfo } from "@/lib/course-limit-utils"
import { CourseLimitDialog } from "@/components/course-limit-dialog"

export function CommunityPulseCard() {
  const { user } = useAuth()
  const router = useRouter()
  const [activities, setActivities] = useState<CommunityActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [addingCourse, setAddingCourse] = useState<string | null>(null)
  const [userCourseIds, setUserCourseIds] = useState<Set<string>>(new Set())
  const [courseLimits, setCourseLimits] = useState<CourseLimitInfo | null>(null)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)

  useEffect(() => {
    if (!user) return

    setLoading(true)
    const unsubscribe = subscribeToCommunityActivities(5, (newActivities) => {
      setActivities(newActivities)
      setLoading(false)
    })

    // Fetch user's library courses to show "In Library" status
    const fetchUserCourses = async () => {
      try {
        const { getUserCourses } = await import("@/lib/course-utils")
        const courses = await getUserCourses(user.uid)
        setUserCourseIds(new Set(courses.map(c => c.id)))
      } catch (error) {
        console.error("Error fetching user courses for pulse:", error)
      }
    }
    fetchUserCourses()

    getUserCourseLimits(user.uid)
      .then(setCourseLimits)
      .catch((error) => console.error("Error fetching course limits:", error))

    return () => {
      unsubscribe()
    }
  }, [user])

  const atAddedLimit =
    courseLimits != null && courseLimits.added >= courseLimits.maxAdded

  const handleAddCourse = async (courseId: string) => {
    if (!user || addingCourse) return
    if (atAddedLimit) {
      setLimitDialogOpen(true)
      return
    }
    try {
      setAddingCourse(courseId)
      await copyCourseToUserLibrary(user.uid, courseId)
      router.push(`/journey/${courseId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message.includes("added course limit")) {
        setLimitDialogOpen(true)
      } else {
        console.error("Error adding course to library:", error)
      }
    } finally {
      setAddingCourse(null)
    }
  }

  const handleAvatarClick = (userId: string) => {
    router.push(`/profile/${userId}`)
  }

  const isCourseActivity = (activity: CommunityActivity) => {
    return (
      activity.activityType === "course_published" ||
      activity.activityType === "course_completed" ||
      activity.activityType === "challenge_won" ||
      activity.activityType === "perfect_quiz"
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Community Pulse
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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Community Pulse
        </CardTitle>
        <CardDescription>Recent activity from the community</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center flex-1">
            <Ghost className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              Be the first to make history!
            </p>
          </div>
        ) : (
          <div className="space-y-4 flex-1 overflow-y-auto">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div onClick={() => handleAvatarClick(activity.userId)} className="cursor-pointer flex-shrink-0">
                  <AvatarWithCosmetics
                    userId={activity.userId}
                    nickname={activity.userNickname}
                    size="sm"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {isCourseActivity(activity) && activity.metadata.courseId ? (
                    <>
                      <p className="text-sm">
                        <span
                          className="font-medium cursor-pointer hover:underline"
                          onClick={() => handleAvatarClick(activity.userId)}
                        >
                          <NameWithColor
                            userId={activity.userId}
                            name={activity.userNickname}
                          />
                        </span>{" "}
                        {formatActivityDescription(activity).replace(activity.userNickname, "").trim()}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {activity.relativeTime || "Just now"}
                        </p>
                        {activity.activityType === "course_published" && (
                          userCourseIds.has(activity.metadata.courseId!) ? (
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              In Library
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddCourse(activity.metadata.courseId!)}
                              disabled={addingCourse === activity.metadata.courseId}
                              className="h-7 text-xs shrink-0"
                            >
                              {addingCourse === activity.metadata.courseId ? (
                                <Spinner className="h-3 w-3" />
                              ) : (
                                <>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </>
                              )}
                            </Button>
                          )
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">
                        <span
                          className="font-medium cursor-pointer hover:underline"
                          onClick={() => handleAvatarClick(activity.userId)}
                        >
                          <NameWithColor
                            userId={activity.userId}
                            name={activity.userNickname}
                          />
                        </span>{" "}
                        {formatActivityDescription(activity).replace(activity.userNickname, "").trim()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.relativeTime || "Just now"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {courseLimits && (
        <CourseLimitDialog
          open={limitDialogOpen}
          onOpenChange={setLimitDialogOpen}
          type="added"
          limit={courseLimits.maxAdded}
          current={courseLimits.added}
          level={courseLimits.level}
        />
      )}
    </Card>
  )
}

