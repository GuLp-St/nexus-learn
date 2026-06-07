"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { Sparkles, Star, Plus } from "lucide-react"
import { getAISuggestedCourses, CourseSuggestion } from "@/lib/ai-suggestion-utils"
import { getUserCourses, createOrGetCourse } from "@/lib/course-utils"
import { useAuth } from "@/components/auth-provider"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useRouter } from "next/navigation"
import { generateCourseContent } from "@/lib/gemini"
import { generateAndUploadImage } from "@/lib/upload-actions"
import { DEFAULT_COURSE_IMAGE_URL } from "@/lib/image-constants"

const CACHE_PREFIX = "nexus-ai-suggestions"

type SuggestionCache = {
  libraryKey: string
  suggestions: CourseSuggestion[]
}

function libraryKeyFromIds(courseIds: string[]): string {
  return courseIds.slice().sort().join("|")
}

function readCache(userId: string): SuggestionCache | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}-${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SuggestionCache
    if (!parsed.libraryKey || !Array.isArray(parsed.suggestions)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(userId: string, data: SuggestionCache) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}-${userId}`, JSON.stringify(data))
  } catch {
    // ignore quota / private mode
  }
}

/** Call when the user adds or removes a course so dashboard picks up new suggestions */
export function invalidateAISuggestionCache(userId: string) {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}-${userId}`)
  } catch {
    // ignore
  }
}

export function AISuggestedCourseCard() {
  const { user } = useAuth()
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      loadSuggestions()
    }
  }, [user])

  const loadSuggestions = async () => {
    if (!user) return
    try {
      setLoading(true)

      const userCourses = await getUserCourses(user.uid)
      const libraryKey = libraryKeyFromIds(userCourses.map((c) => c.id))
      const cached = readCache(user.uid)

      if (cached && cached.libraryKey === libraryKey) {
        setSuggestions(cached.suggestions)
        return
      }

      const data = await getAISuggestedCourses(user.uid)
      setSuggestions(data)
      writeCache(user.uid, { libraryKey, suggestions: data })
    } catch (error) {
      console.error("Error loading suggested courses:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (suggestion: CourseSuggestion, index: number) => {
    if (!user || actionId) return

    if (suggestion.type === "ai") {
      router.push(`/create-course?mode=ai&topic=${encodeURIComponent(suggestion.title)}`)
      return
    }

    const id = suggestion.course?.id || `ai-${index}`
    setActionId(id)

    try {
      if (suggestion.type === "community" && suggestion.course) {
        await copyCourseToUserLibrary(user.uid, suggestion.course.id)
        invalidateAISuggestionCache(user.uid)
        router.push(`/journey/${suggestion.course.id}`)
      } else {
        const courseData = await generateCourseContent(suggestion.title)

        const prompt = `A high-quality, professional educational cover image for a course titled "${courseData.title}". Style: modern, clean, digital art. Topics: ${courseData.tags?.join(", ")}`
        const imageResult = await generateAndUploadImage(prompt)
        if (imageResult) {
          courseData.imageUrl = imageResult.ufsUrl
          courseData.imageKey = imageResult.key
        } else {
          courseData.imageUrl = DEFAULT_COURSE_IMAGE_URL
        }

        const newCourseId = await createOrGetCourse(courseData, user.uid)
        invalidateAISuggestionCache(user.uid)
        router.push(`/journey/${newCourseId}`)
      }
    } catch (error) {
      console.error("Error processing suggestion:", error)
      alert("Failed to process course. Please try again.")
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (suggestions.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            No suggestions available yet. Start learning to see recommendations!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {actionId && <LoadingScreen />}
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Recommended for You
          </CardTitle>
          <CardDescription>Based on your recent learning</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto pt-0">
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => {
              const isProcessing = actionId === (suggestion.course?.id || `ai-${index}`)

              return (
                <div
                  key={index}
                  className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2 leading-tight">
                      {suggestion.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          suggestion.type === "community"
                            ? "bg-primary/10 text-primary"
                            : "bg-purple-500/10 text-purple-600"
                        }`}
                      >
                        {suggestion.type === "community" ? "Community" : "AI Suggested"}
                      </span>
                      {suggestion.course?.difficulty && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                            suggestion.course.difficulty === "beginner"
                              ? "bg-green-500/10 text-green-600"
                              : suggestion.course.difficulty === "intermediate"
                                ? "bg-yellow-500/10 text-yellow-600"
                                : "bg-red-500/10 text-red-600"
                          }`}
                        >
                          {suggestion.course.difficulty}
                        </span>
                      )}
                      {suggestion.course?.averageRating && (
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span>{suggestion.course.averageRating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 hover:bg-primary hover:text-primary-foreground"
                    onClick={() => handleAction(suggestion, index)}
                    disabled={!!actionId}
                    title={
                      suggestion.type === "ai" ? "Create course from this topic" : "Add to library"
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
