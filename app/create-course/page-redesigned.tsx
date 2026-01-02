"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Search, BookOpen, Star, Plus, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { generateCourseContent } from "@/lib/gemini"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore"
import { createOrGetCourse, PublicCourse } from "@/lib/course-utils"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"

type SortOption = "popularity" | "newest" | "oldest" | "mostAdded"

interface PublishedCourse extends PublicCourse {
  addedCount?: number
}

export default function CreateCoursePage() {
  const [courseInput, setCourseInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [courses, setCourses] = useState<PublishedCourse[]>([])
  const [filteredCourses, setFilteredCourses] = useState<PublishedCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("popularity")
  const [selectedTag, setSelectedTag] = useState<string>("")
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  // Fetch published courses
  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return

      try {
        setLoading(true)
        let coursesQuery

        try {
          // Try to use index first
          coursesQuery = query(
            collection(db, "courses"),
            where("isPublic", "==", true),
            orderBy("averageRating", "desc"),
            limit(100)
          )
        } catch (error: any) {
          // Fallback: fetch all and filter
          coursesQuery = query(collection(db, "courses"), limit(200))
        }

        const snapshot = await getDocs(coursesQuery)
        const fetchedCourses: PublishedCourse[] = []

        snapshot.forEach((doc) => {
          const data = doc.data()
          if (data.isPublic) {
            fetchedCourses.push({
              id: doc.id,
              ...data,
            } as PublishedCourse)
          }
        })

        // Sort by popularity (rating) if using fallback
        if (coursesQuery.type === "collection") {
          fetchedCourses.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        }

        setCourses(fetchedCourses)
        setFilteredCourses(fetchedCourses)
      } catch (error) {
        console.error("Error fetching courses:", error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchCourses()
    }
  }, [user])

  // Filter and sort courses
  useEffect(() => {
    let filtered = [...courses]

    // Filter by search query
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (course) =>
          course.title?.toLowerCase().includes(queryLower) ||
          course.description?.toLowerCase().includes(queryLower) ||
          course.tags?.some((tag) => tag.toLowerCase().includes(queryLower))
      )
    }

    // Filter by tag
    if (selectedTag) {
      filtered = filtered.filter((course) => course.tags?.includes(selectedTag))
    }

    // Sort
    switch (sortBy) {
      case "popularity":
        filtered.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        break
      case "newest":
        filtered.sort((a, b) => {
          const aTime = a.publishedAt?.toMillis() || 0
          const bTime = b.publishedAt?.toMillis() || 0
          return bTime - aTime
        })
        break
      case "oldest":
        filtered.sort((a, b) => {
          const aTime = a.publishedAt?.toMillis() || 0
          const bTime = b.publishedAt?.toMillis() || 0
          return aTime - bTime
        })
        break
      case "mostAdded":
        filtered.sort((a, b) => (b.addedCount || 0) - (a.addedCount || 0))
        break
    }

    setFilteredCourses(filtered)
  }, [courses, searchQuery, selectedTag, sortBy])

  // Get all unique tags
  const allTags = Array.from(
    new Set(courses.flatMap((course) => course.tags || []))
  ).sort()

  // Get courses to display
  const displayCourses = showAll ? filteredCourses : filteredCourses.slice(0, 9)

  const handleAddToLibrary = async (courseId: string) => {
    if (!user) return

    setAddingCourseId(courseId)
    try {
      await copyCourseToUserLibrary(user.uid, courseId)
      router.push(`/courses/${courseId}`)
    } catch (error: any) {
      console.error("Error adding course to library:", error)
      alert(error.message || "Failed to add course to library")
    } finally {
      setAddingCourseId(null)
    }
  }

  const handleGenerate = async () => {
    if (!courseInput.trim()) return
    if (!user) {
      router.push("/auth")
      return
    }

    setIsGenerating(true)
    setError("")

    try {
      const courseData = await generateCourseContent(courseInput.trim())
      const courseId = await createOrGetCourse(courseData, user.uid)
      router.push(`/courses/${courseId}`)
    } catch (err: any) {
      console.error("Error generating course:", err)
      setError(err.message || "Failed to generate course. Please try again.")
      setIsGenerating(false)
    }
  }

  // Set chatbot context
  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Create Course",
      description: `Course creation page showing ${courses.length} published courses. Users can browse, search, and add courses to their library, or generate new courses.`,
    })

    return () => {
      setPageContext(null)
    }
  }, [setPageContext, courses.length])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav title="Create Course" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Popular Courses</h1>
              <p className="text-muted-foreground">
                Browse published courses or create your own
              </p>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Popularity</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="mostAdded">Most Added</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tag Filter */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedTag === "" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTag("")}
                >
                  All
                </Button>
                {allTags.map((tag) => (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            )}

            {/* Courses Grid */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : displayCourses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-center text-muted-foreground">
                    {searchQuery || selectedTag ? "No courses found" : "No published courses yet"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {displayCourses.map((course) => (
                    <Card key={course.id} className="overflow-hidden transition-shadow hover:shadow-lg">
                      {course.imageUrl ? (
                        <div className="aspect-video w-full overflow-hidden">
                          <img
                            src={course.imageUrl}
                            alt={course.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <BookOpen className="h-12 w-12 text-primary/50" />
                        </div>
                      )}
                      <CardHeader className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg line-clamp-1">{course.title}</CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={(e) => {
                              e.preventDefault()
                              handleAddToLibrary(course.id)
                            }}
                            disabled={addingCourseId === course.id}
                            title="Add to Library"
                          >
                            {addingCourseId === course.id ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {course.tags && course.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {course.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          {course.averageRating && course.averageRating > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span>{course.averageRating.toFixed(1)}</span>
                              {course.ratingCount && course.ratingCount > 0 && (
                                <span className="text-muted-foreground/70">({course.ratingCount})</span>
                              )}
                            </div>
                          )}
                          {course.addedCount !== undefined && (
                            <span>{course.addedCount} added</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Show More Button */}
                {filteredCourses.length > 9 && !showAll && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={() => setShowAll(true)} className="gap-2">
                      Show More <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Generate Section */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Can't find what you're looking for?</h2>
                  <p className="text-muted-foreground">
                    Generate your own custom learning path
                  </p>
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Astrophysics 101, Python for Beginners"
                    value={courseInput}
                    onChange={(e) => {
                      setCourseInput(e.target.value)
                      setError("")
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleGenerate()
                      }
                    }}
                    disabled={isGenerating}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={!courseInput.trim() || isGenerating}
                    size="lg"
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Spinner className="h-4 w-4" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

