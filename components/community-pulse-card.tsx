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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useRouter } from "next/navigation"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function CommunityPulseCard() {
  const { user } = useAuth()
  const router = useRouter()
  const [activities, setActivities] = useState<CommunityActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [addingCourse, setAddingCourse] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    setLoading(true)
    const unsubscribe = subscribeToCommunityActivities(5, (newActivities) => {
      setActivities(newActivities)
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [user])

  const handleAddCourse = async (courseId: string) => {
    if (!user || addingCourse) return
    try {
      setAddingCourse(courseId)
      await copyCourseToUserLibrary(user.uid, courseId)
      router.push(`/courses/${courseId}`)
    } catch (error) {
      console.error("Error adding course to library:", error)
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Community Pulse
        </CardTitle>
        <CardDescription>Recent activity from the community</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Ghost className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              Be the first to make history!
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <Avatar
                  className="h-8 w-8 cursor-pointer flex-shrink-0"
                  onClick={() => handleAvatarClick(activity.userId)}
                >
                  <AvatarImage src={activity.userAvatarUrl} alt={activity.userNickname} />
                  <AvatarFallback>
                    {activity.userNickname.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  {isCourseActivity(activity) && activity.metadata.courseId ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span
                            className="font-medium cursor-pointer hover:underline"
                            onClick={() => handleAvatarClick(activity.userId)}
                          >
                            {activity.userNickname}
                          </span>{" "}
                          {formatActivityDescription(activity).replace(activity.userNickname, "").trim()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {activity.relativeTime || "Just now"}
                        </p>
                      </div>
                      {activity.activityType === "course_published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddCourse(activity.metadata.courseId!)}
                          disabled={addingCourse === activity.metadata.courseId}
                          className="flex-shrink-0 h-7 text-xs"
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
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">
                        <span
                          className="font-medium cursor-pointer hover:underline"
                          onClick={() => handleAvatarClick(activity.userId)}
                        >
                          {activity.userNickname}
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
    </Card>
  )
}

