"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Play, Trash2, Star, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatContext } from "@/context/ChatContext"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { removeCourseFromLibrary } from "@/lib/library-utils"
import { CompletedCoursesModal } from "@/components/completed-courses-modal"
import { checkPublishRequirements, PublishRequirements } from "@/lib/publish-utils"
import { getCompletedCourses } from "@/lib/completion-utils"
import { RatingModal } from "@/components/rating-modal"
import { Upload, AlertCircle, CheckCircle2, XCircle, Trophy as TrophyIcon, Image as ImageIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const colorGradients = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-green-500 to-emerald-500",
  "from-orange-500 to-red-500",
  "from-indigo-500 to-blue-500",
  "from-pink-500 to-rose-500",
  "from-teal-500 to-green-500",
  "from-yellow-500 to-orange-500",
]

const CourseCard = ({ course, index, onRemove, onRate, userId }: { course: CourseWithProgress; index: number; onRemove: () => void; onRate: () => void; userId: string }) => {
  const router = useRouter()
  const initials = course.title
    .split(" ")
    .map((word) => word[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()
  const color = colorGradients[index % colorGradients.length]
  const isNew =
    course.userProgress?.createdAt &&
    course.userProgress.createdAt.toDate &&
    (Date.now() - course.userProgress.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24) < 7
  const [publishReqs, setPublishReqs] = useState<PublishRequirements | null>(null)
  const [checkingReqs, setCheckingReqs] = useState(false)
  const [expandedPublish, setExpandedPublish] = useState(false)
  const [showReviewHint, setShowReviewHint] = useState(false)
  const [hasRated, setHasRated] = useState<boolean | null>(null)

  const isOwnCourse = course.userProgress?.isOwnCourse === true
  const isPublished = course.isPublic === true

  // Calculate completed modules
  const completedModulesCount = course.modules.filter((module, moduleIndex) => {
    return module.lessons.every((lesson, lessonIndex) => {
      const lessonId = `${moduleIndex}-${lessonIndex}`
      return course.userProgress?.completedLessons?.includes(lessonId)
    })
  }).length

  const canReview = completedModulesCount >= 1

  useEffect(() => {
    if (isOwnCourse && !isPublished) {
      const checkReqs = async () => {
        try {
          setCheckingReqs(true)
          const reqs = await checkPublishRequirements(userId, course.id)
          setPublishReqs(reqs)
        } catch (error) {
          console.error("Error checking publish requirements:", error)
        } finally {
          setCheckingReqs(false)
        }
      }
      checkReqs()
    }
  }, [isOwnCourse, isPublished, userId, course.id])

  useEffect(() => {
    if (isPublished && !isOwnCourse) {
      const checkRating = async () => {
        try {
          const { getUserRating } = await import("@/lib/rating-utils")
          const rating = await getUserRating(userId, course.id)
          setHasRated(rating !== null)
        } catch (error) {
          console.error("Error checking user rating:", error)
          setHasRated(false)
        }
      }
      checkRating()
    } else {
      setHasRated(false)
    }
  }, [isPublished, isOwnCourse, userId, course.id])

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative flex flex-col">
      {/* Course Image / Header */}
      <div 
        className="relative aspect-video w-full cursor-pointer overflow-hidden bg-muted"
        onClick={() => router.push(`/journey/${course.id}`)}
      >
        {course.imageUrl ? (
          <div 
            className="h-full w-full transition-transform duration-500 group-hover:scale-105"
            style={{
              transform: `scale(${course.imageConfig?.scale || 1})`
            }}
          >
            <img 
              src={course.imageUrl} 
              alt={course.title} 
              className="h-full w-full"
              style={{
                objectFit: course.imageConfig?.fit || "cover",
                transform: `scale(${course.imageConfig?.scale || 1}) translate(${course.imageConfig?.position ? course.imageConfig.position.x - 50 : 0}%, ${course.imageConfig?.position ? course.imageConfig.position.y - 50 : 0}%)`
              }}
              onError={(e) => {
                // Fallback if image fails to load
                (e.target as any).src = `https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800`
              }}
            />
          </div>
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${color} text-4xl font-bold text-white shadow-sm`}
          >
            {initials}
          </div>
        )}
        
        {/* Overlay for actions */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 duration-200">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/90 backdrop-blur-sm text-muted-foreground hover:text-destructive shadow-lg"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {isNew && (
          <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground shadow-lg">
            New
          </Badge>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
          <div 
            className="h-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${course.userProgress?.progress || 0}%` }}
          />
        </div>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <h3 
              className="font-bold text-lg leading-tight group-hover:text-primary transition-colors cursor-pointer line-clamp-1"
              onClick={() => router.push(`/journey/${course.id}`)}
            >
              {course.title}
            </h3>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{course.userProgress?.progress || 0}% Complete</span>
              <span>{completedModulesCount}/{course.modules.length} Modules</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {course.userProgress?.lastAccessedModule !== undefined && course.userProgress?.lastAccessedLesson !== undefined && (
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/journey/${course.id}/modules/${course.userProgress?.lastAccessedModule}/lessons/${course.userProgress?.lastAccessedLesson}`)
                }}
              >
                <Play className="h-3 w-3 mr-1 fill-current" />
                Resume
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex-1"
              onClick={() => router.push(`/journey/${course.id}`)}
            >
              Details
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t space-y-2">
          {isOwnCourse && !isPublished && (
            <Button
              variant="outline"
              size="sm"
              className={`w-full text-xs transition-colors ${
                expandedPublish 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" 
                  : "border-primary/30 text-primary hover:bg-primary/5"
              }`}
              onClick={(e) => {
                e.stopPropagation()
                setExpandedPublish(!expandedPublish)
              }}
            >
              <Upload className="h-3 w-3 mr-1" />
              {expandedPublish ? "Hide Requirements" : "Publish Course"}
            </Button>
          )}

          {isOwnCourse && !isPublished && expandedPublish && (
            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              {checkingReqs ? (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Spinner className="h-3 w-3" />
                  Checking...
                </div>
              ) : publishReqs ? (
                <div className="space-y-2">
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {publishReqs.courseCompleted ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span>Completed (100%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {publishReqs.quizPassed ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span>Final quiz &gt;70%</span>
                    </div>
                  </div>
                  {publishReqs.canPublish && (
                    <Link href={`/journey/${course.id}/publish`} className="block w-full">
                      <Button size="sm" className="w-full text-[10px] h-7">
                        Go to Publish Page
                      </Button>
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {isPublished && !isOwnCourse && canReview && !hasRated && (
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                onClick={() => {
                  setShowReviewHint(true)
                  setTimeout(() => setShowReviewHint(false), 3000)
                  onRate()
                }}
              >
                <Star className="h-3 w-3 mr-1" />
                Rate Course
              </Button>
              {showReviewHint && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Help others by rating!
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function JourneyPage() {
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    modulesMastered: 0,
    performanceRating: 0,
    gradeS: 0,
  })
  const [removeDialog, setRemoveDialog] = useState<{ 
    open: boolean; 
    courseId: string | null; 
    courseTitle: string; 
    isPublic?: boolean;
    isLastSubscriber?: boolean;
    checkingSubscribers?: boolean;
  }>({
    open: false,
    courseId: null,
    courseTitle: "",
    isPublic: false,
    isLastSubscriber: false,
    checkingSubscribers: false,
  })
  const [removing, setRemoving] = useState(false)
  const [completedCoursesOpen, setCompletedCoursesOpen] = useState(false)
  const [ratingModal, setRatingModal] = useState<{
    open: boolean;
    courseId: string | null;
    courseTitle: string;
  }>({
    open: false,
    courseId: null,
    courseTitle: "",
  })
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    if (!user) return

    try {
      setLoading(true)
      const [fetchedCourses, completedRecords] = await Promise.all([
        getUserCourses(user.uid),
        getCompletedCourses(user.uid),
      ])
      
      setCourses(fetchedCourses)

      // Fetch new tracking metrics
      const { getUserTrackingMetrics } = await import("@/lib/tracking-utils")
      const trackingMetrics = await getUserTrackingMetrics(user.uid)

      setStats({
        modulesMastered: trackingMetrics.modulesMastered,
        performanceRating: trackingMetrics.performanceRating,
        gradeS: trackingMetrics.gradeS,
      })
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Set chatbot context with real-time journey data
  useEffect(() => {
    if (!loading && user && courses.length >= 0) {
      setPageContext({
        title: "Journey",
        description: `The user's learning journey with ${courses.length} courses. Stats: ${stats.modulesMastered} modules mastered, ${stats.performanceRating}% performance rating, ${stats.gradeS} Grade S achievements. The user can ask about their courses, learning progress, or which courses to focus on.`,
        data: {
          coursesCount: courses.length,
          stats,
          // All courses with full details
          courses: courses.map((course) => ({
            courseId: course.id,
            title: course.title,
            description: course.description,
            difficulty: course.difficulty,
            estimatedDuration: course.estimatedDuration,
            progress: course.userProgress?.progress || 0,
            completedModules: course.modules.filter((module, moduleIndex) => {
              return module.lessons.every((lesson, lessonIndex) => {
                const lessonId = `${moduleIndex}-${lessonIndex}`
                return course.userProgress?.completedLessons?.includes(lessonId)
              })
            }).length,
            totalModules: course.modules.length,
            moduleQuizScores: course.userProgress?.moduleQuizScores || {},
            finalQuizScore: course.userProgress?.finalQuizScore,
            isOwnCourse: course.userProgress?.isOwnCourse,
          })),
        },
      })
    }
  }, [courses, loading, user, stats, setPageContext])

  // Split courses into My Courses and Added Courses
  const myCourses = courses.filter(c => c.userProgress?.isOwnCourse === true)
  const addedCourses = courses.filter(c => c.userProgress?.isOwnCourse === false)

  const handleRemoveClick = async (course: CourseWithProgress) => {
    setRemoveDialog({
      open: true,
      courseId: course.id,
      courseTitle: course.title,
      isPublic: course.isPublic || false,
      checkingSubscribers: !course.isPublic,
      isLastSubscriber: false,
    })

    if (!course.isPublic) {
      try {
        const { collection, query, where, getDocs, limit } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const q = query(
          collection(db, "userCourseProgress"),
          where("courseId", "==", course.id),
          limit(2)
        )
        const snapshot = await getDocs(q)
        const isLast = snapshot.size <= 1
        
        setRemoveDialog(prev => ({
          ...prev,
          checkingSubscribers: false,
          isLastSubscriber: isLast
        }))
      } catch (error) {
        console.error("Error checking subscribers:", error)
        setRemoveDialog(prev => ({ ...prev, checkingSubscribers: false }))
      }
    }
  }

  const handleRemoveConfirm = async () => {
    if (!user || !removeDialog.courseId) return

    try {
      setRemoving(true)
      await removeCourseFromLibrary(user.uid, removeDialog.courseId)
      await fetchData()
      setRemoveDialog({ 
        open: false, 
        courseId: null, 
        courseTitle: "", 
        isPublic: false,
        isLastSubscriber: false,
        checkingSubscribers: false
      })
    } catch (error) {
      console.error("Error removing course:", error)
      alert("Failed to remove course")
    } finally {
      setRemoving(false)
    }
  }

  if (authLoading || loading) {
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
      <SidebarNav currentPath="/journey" title="My Journey" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">My Journey</h2>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrophyIcon className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.modulesMastered}</p>
                      <p className="text-xs text-muted-foreground">Modules Mastered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.performanceRating}%</p>
                      <p className="text-xs text-muted-foreground">Performance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.gradeS}</p>
                      <p className="text-xs text-muted-foreground">Grade S</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* My Courses */}
            {myCourses.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-foreground">My Courses</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {myCourses.map((course, index) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      index={index}
                      onRemove={() => handleRemoveClick(course)}
                      onRate={() => setRatingModal({ open: true, courseId: course.id, courseTitle: course.title })}
                      userId={user.uid}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Added Courses */}
            {addedCourses.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-foreground">Added Courses</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {addedCourses.map((course, index) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      index={index + myCourses.length}
                      onRemove={() => handleRemoveClick(course)}
                      onRate={() => setRatingModal({ open: true, courseId: course.id, courseTitle: course.title })}
                      userId={user.uid}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {courses.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No courses yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start your learning journey by creating or adding a course
                  </p>
                  <Link href="/create-course">
                    <Button>Create Course</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Remove Dialog */}
      <Dialog open={removeDialog.open} onOpenChange={(open) => setRemoveDialog({ ...removeDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Course</DialogTitle>
            <DialogDescription>
              {removeDialog.checkingSubscribers ? (
                "Checking course subscribers..."
              ) : removeDialog.isPublic && removeDialog.isLastSubscriber ? (
                `Are you sure you want to remove "${removeDialog.courseTitle}"? This will also delete the course since you're the last subscriber.`
              ) : (
                `Are you sure you want to remove "${removeDialog.courseTitle}" from your library? Your progress will be saved.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveDialog({ ...removeDialog, open: false })} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveConfirm} disabled={removing}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rating Modal */}
      {ratingModal.open && ratingModal.courseId && user && (
        <RatingModal
          courseId={ratingModal.courseId}
          userId={user.uid}
          courseTitle={ratingModal.courseTitle}
          onClose={() => setRatingModal({ open: false, courseId: null, courseTitle: "" })}
          onRated={() => setRatingModal({ open: false, courseId: null, courseTitle: "" })}
        />
      )}

      {/* Completed Courses Modal */}
      {completedCoursesOpen && user && (
        <CompletedCoursesModal
          open={completedCoursesOpen}
          onOpenChange={setCompletedCoursesOpen}
          userId={user.uid}
        />
      )}
    </div>
  )
}

