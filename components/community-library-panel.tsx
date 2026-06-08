"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Search, BookOpen, Star, Plus, ArrowDown, Info, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore"
import { PublicCourse } from "@/lib/course-utils"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { getUserCourseLimits, type CourseLimitInfo } from "@/lib/course-limit-utils"
import { CourseLimitDialog } from "@/components/course-limit-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

type SortOption = "popularity" | "newest" | "oldest" | "mostAdded"

interface PublishedCourse extends PublicCourse {
  addedCount?: number
}

export function CommunityLibraryPanel({ compact = false }: { compact?: boolean }) {
  const [courses, setCourses] = useState<PublishedCourse[]>([])
  const [filteredCourses, setFilteredCourses] = useState<PublishedCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("popularity")
  const [selectedTag, setSelectedTag] = useState<string>("")
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null)
  const [userCourseIds, setUserCourseIds] = useState<Set<string>>(new Set())
  const [detailCourse, setDetailCourse] = useState<PublishedCourse | null>(null)
  const [courseLimits, setCourseLimits] = useState<CourseLimitInfo | null>(null)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const fetchUserCourses = async () => {
      try {
        const { getUserCourses } = await import("@/lib/course-utils")
        const userCourses = await getUserCourses(user.uid)
        setUserCourseIds(new Set(userCourses.map((c) => c.id)))
      } catch (error) {
        console.error("Error fetching user courses:", error)
      }
    }
    fetchUserCourses()

    getUserCourseLimits(user.uid)
      .then(setCourseLimits)
      .catch((error) => console.error("Error fetching course limits:", error))
  }, [user])

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return
      try {
        setLoading(true)
        let fetchedCourses: PublishedCourse[] = []
        try {
          const coursesQuery = query(
            collection(db, "courses"),
            where("isPublic", "==", true),
            orderBy("addedCount", "desc"),
            limit(100)
          )
          const snapshot = await getDocs(coursesQuery)
          fetchedCourses = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as PublishedCourse[]
        } catch {
          const fallbackQuery = query(
            collection(db, "courses"),
            where("isPublic", "==", true),
            limit(100)
          )
          const snapshot = await getDocs(fallbackQuery)
          fetchedCourses = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as PublishedCourse)
            .sort((a, b) => (b.addedCount || 0) - (a.addedCount || 0))
        }
        setCourses(fetchedCourses)
      } catch (error) {
        console.error("Error fetching courses:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchCourses()
  }, [user])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const course of courses) {
      for (const tag of course.tags ?? []) {
        if (!tag) continue
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([tag]) => tag)
  }, [courses])

  const visibleTags = useMemo(() => {
    if (!selectedTag || topTags.includes(selectedTag)) return topTags
    return [selectedTag, ...topTags.filter((t) => t !== selectedTag)].slice(0, 10)
  }, [topTags, selectedTag])

  useEffect(() => {
    let result = [...courses]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (selectedTag) {
      result = result.filter((c) => c.tags?.includes(selectedTag))
    }
    switch (sortBy) {
      case "newest":
        result.sort((a, b) => {
          const aTime = a.publishedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
          const bTime = b.publishedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })
        break
      case "oldest":
        result.sort((a, b) => {
          const aTime = a.publishedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
          const bTime = b.publishedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
          return aTime - bTime
        })
        break
      case "mostAdded":
        result.sort((a, b) => (b.addedCount || 0) - (a.addedCount || 0))
        break
      default:
        result.sort((a, b) => (b.addedCount || 0) - (a.addedCount || 0))
    }
    setFilteredCourses(result)
  }, [courses, searchQuery, sortBy, selectedTag])

  const displayCourses = showAll ? filteredCourses : filteredCourses.slice(0, compact ? 6 : 12)

  const atAddedLimit =
    courseLimits != null && courseLimits.added >= courseLimits.maxAdded

  const handleAddCourse = async (courseId: string) => {
    if (!user) return
    if (atAddedLimit) {
      setLimitDialogOpen(true)
      return
    }
    setAddingCourseId(courseId)
    try {
      await copyCourseToUserLibrary(user.uid, courseId)
      router.push(`/journey/${courseId}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add course"
      if (message.includes("added course limit")) {
        setLimitDialogOpen(true)
      } else {
        alert(message)
      }
    } finally {
      setAddingCourseId(null)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Community Library</h2>
          <p className="text-muted-foreground">
            Browse published courses and add them to your journey
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
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

      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedTag === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTag("")}
          >
            All
          </Button>
          {visibleTags.map((tag) => (
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
                    <img src={course.imageUrl} alt={course.title} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <BookOpen className="h-12 w-12 text-primary/50" />
                  </div>
                )}
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-1">{course.title}</CardTitle>
                    {userCourseIds.has(course.id) && (
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded shrink-0">
                        In Library
                      </span>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    {course.averageRating && course.averageRating > 0 ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span>{course.averageRating.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span />
                    )}
                    <span>{course.modules?.length || 0} modules</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 h-9"
                      onClick={() => setDetailCourse(course)}
                    >
                      <Info className="h-4 w-4" />
                      Details
                    </Button>
                    {!userCourseIds.has(course.id) && (
                      <Button
                        className="flex-1 gap-2 h-9"
                        disabled={addingCourseId === course.id}
                        onClick={() => handleAddCourse(course.id)}
                      >
                        {addingCourseId === course.id ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Add
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {!showAll && filteredCourses.length > displayCourses.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShowAll(true)} className="gap-2">
                <ArrowDown className="h-4 w-4" />
                Show all ({filteredCourses.length})
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!detailCourse} onOpenChange={(open) => !open && setDetailCourse(null)}>
        <DialogContent className="max-w-lg">
          {detailCourse && (
            <>
              <DialogHeader>
                <DialogTitle>{detailCourse.title}</DialogTitle>
                <DialogDescription>{detailCourse.description}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {userCourseIds.has(detailCourse.id) ? (
                  <Button variant="outline" className="gap-2" onClick={() => router.push(`/journey/${detailCourse.id}`)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Open in Journey
                  </Button>
                ) : (
                  <Button
                    disabled={addingCourseId === detailCourse.id}
                    onClick={() => handleAddCourse(detailCourse.id)}
                  >
                    {addingCourseId === detailCourse.id ? <Spinner className="h-4 w-4" /> : "Add to Journey"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
