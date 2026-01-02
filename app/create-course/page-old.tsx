"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Search, BookOpen, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent } from "@/components/ui/card"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { generateCourseContent, CourseData } from "@/lib/gemini"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from "firebase/firestore"
import { createOrGetCourse, ensureUserProgress, PublicCourse } from "@/lib/course-utils"

interface CourseSuggestion {
  id: string
  title: string
  description: string
  averageRating?: number
  ratingCount?: number
}

export default function CreateCoursePage() {
  const [courseInput, setCourseInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [popularTopics, setPopularTopics] = useState<string[]>([])
  const [loadingPopular, setLoadingPopular] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  // Set chatbot context for create course page
  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Create Course",
      description: `Course creation page where users can create new courses by entering a topic. Shows popular course suggestions and topics. The user can ask about creating courses, course topics, or get suggestions for what to learn.`,
    })

    return () => {
      setPageContext(null)
    }
  }, [setPageContext])

  // Fetch popular courses for suggestions (only from public courses)
  useEffect(() => {
    const fetchPopularCourses = async () => {
      try {
        const coursesQuery = query(
          collection(db, "courses"),
          where("isPublic", "==", true),
          orderBy("averageRating", "desc"),
          limit(20)
        )
        const querySnapshot = await getDocs(coursesQuery)
        const courses: CourseSuggestion[] = []
        const topicSet = new Set<string>()

        querySnapshot.forEach((doc) => {
          const data = doc.data()
          courses.push({
            id: doc.id,
            title: data.title || "",
            description: data.description || "",
            averageRating: data.averageRating || 0,
            ratingCount: data.ratingCount || 0,
          })
          if (data.title) {
            topicSet.add(data.title)
          }
        })

        setPopularTopics(Array.from(topicSet).slice(0, 6))
        setLoadingPopular(false)
      } catch (error: any) {
        // If index is building, fetch all and filter client-side
        if (error.code === "failed-precondition") {
          try {
            const fallbackQuery = query(collection(db, "courses"), limit(100))
            const querySnapshot = await getDocs(fallbackQuery)
            const publicCourses: CourseSuggestion[] = []
            const topicSet = new Set<string>()
            
            querySnapshot.forEach((doc) => {
              const data = doc.data()
              if (data.isPublic) {
                publicCourses.push({
                  id: doc.id,
                  title: data.title || "",
                  description: data.description || "",
                  averageRating: data.averageRating || 0,
                  ratingCount: data.ratingCount || 0,
                })
                if (data.title) topicSet.add(data.title)
              }
            })
            
            // Sort by rating
            publicCourses.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
            setPopularTopics(Array.from(topicSet).slice(0, 6))
          } catch (fallbackError) {
            console.error("Error fetching popular courses:", fallbackError)
            setPopularTopics(["Machine Learning", "History of Art", "Calculus"])
          }
        } else {
          console.error("Error fetching popular courses:", error)
          setPopularTopics(["Machine Learning", "History of Art", "Calculus"])
        }
        setLoadingPopular(false)
      }
    }

    if (user) {
      fetchPopularCourses()
    }
  }, [user])

  // Search for course suggestions (only public courses)
  useEffect(() => {
    const searchCourses = async () => {
      if (!courseInput.trim() || courseInput.length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      try {
        const coursesQuery = query(
          collection(db, "courses"),
          where("isPublic", "==", true),
          limit(50)
        )
        const querySnapshot = await getDocs(coursesQuery)
        const matches: CourseSuggestion[] = []

        querySnapshot.forEach((doc) => {
          const data = doc.data()
          const title = data.title || ""
          const description = data.description || ""
          const searchLower = courseInput.toLowerCase()

          if (
            title.toLowerCase().includes(searchLower) ||
            description.toLowerCase().includes(searchLower)
          ) {
            matches.push({
              id: doc.id,
              title,
              description,
              averageRating: data.averageRating || 0,
              ratingCount: data.ratingCount || 0,
            })
          }
        })

        // Sort by rating (highest first), then limit to 5
        matches.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        setSuggestions(matches.slice(0, 5))
        setShowSuggestions(matches.length > 0)
      } catch (error: any) {
        // If index is building, fetch all and filter client-side
        if (error.code === "failed-precondition") {
          try {
            const fallbackQuery = query(collection(db, "courses"), limit(100))
            const querySnapshot = await getDocs(fallbackQuery)
            const matches: CourseSuggestion[] = []
            const searchLower = courseInput.toLowerCase()

            querySnapshot.forEach((doc) => {
              const data = doc.data()
              if (!data.isPublic) return
              
              const title = data.title || ""
              const description = data.description || ""
              if (
                title.toLowerCase().includes(searchLower) ||
                description.toLowerCase().includes(searchLower)
              ) {
                matches.push({
                  id: doc.id,
                  title,
                  description,
                  averageRating: data.averageRating || 0,
                  ratingCount: data.ratingCount || 0,
                })
              }
            })

            matches.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
            setSuggestions(matches.slice(0, 5))
            setShowSuggestions(matches.length > 0)
          } catch (fallbackError) {
            console.error("Error searching courses:", fallbackError)
          }
        } else {
          console.error("Error searching courses:", error)
        }
      }
    }

    const timeoutId = setTimeout(searchCourses, 300)
    return () => clearTimeout(timeoutId)
  }, [courseInput])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleTopicClick = (topic: string) => {
    setCourseInput(topic)
    setError("")
    setShowSuggestions(false)
  }

  const handleSelectSuggestion = async (suggestion: CourseSuggestion) => {
    if (!user) return

    try {
      setIsGenerating(true)
      setError("")

      // Ensure user has progress entry for this course (they're using an existing public course)
      await ensureUserProgress(user.uid, suggestion.id)

      // Redirect to course detail page
      router.push(`/courses/${suggestion.id}`)
    } catch (err: any) {
      console.error("Error selecting course:", err)
      setError(err.message || "Failed to use existing course. Please try again.")
      setIsGenerating(false)
    }
  }

  const handleGeneratePath = async () => {
    if (!courseInput.trim()) return
    if (!user) {
      router.push("/auth")
      return
    }

    setIsGenerating(true)
    setError("")

    try {
      // Generate course content using Gemini
      const courseData = await generateCourseContent(courseInput.trim())

      // Create or get existing course (checks for duplicates)
      const courseId = await createOrGetCourse(courseData, user.uid)

      // Redirect to course detail page
      router.push(`/courses/${courseId}`)
    } catch (err: any) {
      console.error("Error generating course:", err)
      setError(err.message || "Failed to generate course. Please try again.")
      setIsGenerating(false)
    }
  }

  if (authLoading) {
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

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav title="Create Path" />

      {/* Main Content */}
      <main className="relative flex-1">
        {/* Subtle pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(203_213_225/0.1)_1px,transparent_0)] [background-size:24px_24px]" />

        <div className="relative">
          {/* Content */}
          <div className="mx-auto max-w-3xl px-4 py-16 lg:py-24">
            <div className="space-y-12 text-center">
              {/* Header Text */}
              <div className="space-y-3">
                <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
                  What do you want to master?
                </h1>
                <p className="text-pretty text-lg text-muted-foreground">
                  Tell us what you'd like to learn, and we'll create a personalized learning path just for you
                </p>
              </div>

              {/* Large Input Field */}
              <div className="space-y-6">
                {error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="e.g., Astrophysics 101, Python for Beginners"
                      className="h-16 border-2 pl-12 pr-6 text-lg shadow-sm transition-all focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
                      value={courseInput}
                      onChange={(e) => {
                        setCourseInput(e.target.value)
                        setError("")
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) {
                          setShowSuggestions(true)
                        }
                      }}
                      disabled={isGenerating}
                    />
                  </div>

                  {/* Autocomplete Suggestions */}
                  {showSuggestions && suggestions.length > 0 && (
                    <Card className="absolute top-full z-50 mt-2 w-full shadow-lg" ref={suggestionsRef}>
                      <CardContent className="p-2">
                        <div className="space-y-1">
                          {suggestions.map((suggestion) => (
                            <button
                              key={suggestion.id}
                              onClick={() => handleSelectSuggestion(suggestion)}
                              className="w-full rounded-md p-3 text-left hover:bg-accent transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <BookOpen className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-foreground truncate">{suggestion.title}</h4>
                                    {suggestion.averageRating !== undefined && suggestion.averageRating > 0 && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                        <span className="text-xs text-muted-foreground">
                                          {suggestion.averageRating.toFixed(1)}
                                          {suggestion.ratingCount && suggestion.ratingCount > 0 && (
                                            <span className="text-muted-foreground/70">
                                              {" "}({suggestion.ratingCount})
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {suggestion.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                      {suggestion.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Popular Topics */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    {loadingPopular ? "Loading popular topics..." : "Popular topics"}
                  </p>
                  {loadingPopular ? (
                    <div className="flex justify-center">
                      <Spinner className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-3">
                      {popularTopics.length > 0 ? (
                        popularTopics.map((topic) => (
                          <Button
                            key={topic}
                            variant="outline"
                            className="h-10 rounded-full border-2 px-5 text-sm font-medium transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
                            onClick={() => handleTopicClick(topic)}
                          >
                            {topic}
                          </Button>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No popular topics yet. Be the first to create a course!</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <div className="pt-4">
                  <Button
                    size="lg"
                    className="h-14 w-full gap-3 text-lg font-semibold shadow-lg transition-all hover:shadow-xl sm:w-auto sm:px-12"
                    onClick={handleGeneratePath}
                    disabled={!courseInput.trim() || isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Spinner className="h-5 w-5" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Generate Learning Path
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Additional Context */}
              <div className="grid gap-4 pt-8 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="text-2xl font-bold text-primary">AI-Powered</div>
                  <p className="text-sm text-muted-foreground">Personalized curriculum</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="text-2xl font-bold text-primary">Adaptive</div>
                  <p className="text-sm text-muted-foreground">Adjusts to your pace</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="text-2xl font-bold text-primary">Complete</div>
                  <p className="text-sm text-muted-foreground">From basics to advanced</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
