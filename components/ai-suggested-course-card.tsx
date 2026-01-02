"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Sparkles, Star, Plus } from "lucide-react"
import { getAISuggestedCourse } from "@/lib/ai-suggestion-utils"
import { PublicCourse } from "@/lib/course-utils"
import { useAuth } from "@/components/auth-provider"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useRouter } from "next/navigation"
import Link from "next/link"

export function AISuggestedCourseCard() {
  const { user } = useAuth()
  const router = useRouter()
  const [course, setCourse] = useState<PublicCourse | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (user) {
      loadSuggestedCourse()
    }
  }, [user])

  const loadSuggestedCourse = async () => {
    if (!user) return
    try {
      setLoading(true)
      const suggested = await getAISuggestedCourse(user.uid)
      setCourse(suggested)
    } catch (error) {
      console.error("Error loading suggested course:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToLibrary = async () => {
    if (!user || !course || adding) return
    try {
      setAdding(true)
      await copyCourseToUserLibrary(user.uid, course.id)
      router.push(`/courses/${course.id}`)
    } catch (error) {
      console.error("Error adding course to library:", error)
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggested Course
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

  if (!course) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggested Course
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No courses available. Be the first to create one!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Suggested Course
        </CardTitle>
        <CardDescription>
          Based on your learning journey
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Link href={`/courses/${course.id}`}>
            <div className="aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
              <div className="text-4xl font-bold text-primary/60">
                {course.title
                  .split(" ")
                  .map((word) => word[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase()}
              </div>
            </div>
          </Link>

          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{course.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {course.description}
            </p>

            {course.averageRating !== undefined && course.averageRating > 0 && (
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">
                  {course.averageRating.toFixed(1)}
                </span>
                {course.ratingCount !== undefined && course.ratingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({course.ratingCount} {course.ratingCount === 1 ? "rating" : "ratings"})
                  </span>
                )}
              </div>
            )}

            <Button
              onClick={handleAddToLibrary}
              disabled={adding}
              className="w-full"
            >
              {adding ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Library
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

