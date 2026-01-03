"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Sparkles, Star, Plus } from "lucide-react"
import { getAISuggestedCourses, CourseSuggestion } from "@/lib/ai-suggestion-utils"
import { PublicCourse, createOrGetCourse } from "@/lib/course-utils"
import { useAuth } from "@/components/auth-provider"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { generateCourseContent } from "@/lib/gemini"

export function AISuggestedCourseCard() {
  const { user } = useAuth()
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null) // To track which suggestion is being added/generated

  useEffect(() => {
    if (user) {
      loadSuggestions()
    }
  }, [user])

  const loadSuggestions = async () => {
    if (!user) return
    try {
      setLoading(true)
      const data = await getAISuggestedCourses(user.uid)
      setSuggestions(data)
    } catch (error) {
      console.error("Error loading suggested courses:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (suggestion: CourseSuggestion, index: number) => {
    if (!user || actionId) return
    
    const id = suggestion.course?.id || `ai-${index}`
    setActionId(id)

    try {
      if (suggestion.type === "community" && suggestion.course) {
        // Just add to library
        await copyCourseToUserLibrary(user.uid, suggestion.course.id)
        router.push(`/courses/${suggestion.course.id}`)
      } else {
        // AI suggested name - generate full content first
        const courseData = await generateCourseContent(suggestion.title)
        const newCourseId = await createOrGetCourse(courseData, user.uid)
        router.push(`/courses/${newCourseId}`)
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
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Recommended for You
        </CardTitle>
        <CardDescription>
          Based on your recent learning
        </CardDescription>
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
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      suggestion.type === "community"
                        ? "bg-primary/10 text-primary"
                        : "bg-purple-500/10 text-purple-600"
                    }`}>
                      {suggestion.type === "community" ? "Community" : "AI Suggested"}
                    </span>
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
                >
                  {isProcessing ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

