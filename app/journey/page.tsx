"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BookOpen, Play, Trash2, Star, Target, Plus, Sparkles, Library } from "lucide-react"
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
import { getUserCourseLimits, type CourseLimitInfo } from "@/lib/course-limit-utils"
import { removeCourseFromLibrary } from "@/lib/library-utils"
import { CompletedCoursesModal } from "@/components/completed-courses-modal"
import { invalidateAISuggestionCache } from "@/components/ai-suggested-course-card"
import { checkPublishRequirements, PublishRequirements } from "@/lib/publish-utils"
import { getCompletedCourses } from "@/lib/completion-utils"
import { RatingModal } from "@/components/rating-modal"
import { Upload, AlertCircle, CheckCircle2, XCircle, Trophy as TrophyIcon, Image as ImageIcon } from "lucide-react"
import { JourneyBoard } from "@/components/journey-board"
import {
  getJourneySettings,
  createJourneyFolder,
  renameJourneyFolder,
  deleteJourneyFolder,
  moveCourseToFolder,
  setJourneyViewType,
  setJourneySortBy,
  setActiveFolder,
  type JourneySettings,
} from "@/lib/journey-settings-utils"
import { computeJourneyStatsFromCourses } from "@/lib/journey-stats-utils"
import { canSelectCourseForChallenge } from "@/lib/quiz-access-utils"
import type { JourneyViewType } from "@/lib/journey-settings-utils"
import { JOURNEY_CARD_ACTION_BTN } from "@/lib/journey-card-layout"
import { sendMessage } from "@/lib/chat-utils"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const DEFAULT_JOURNEY_SETTINGS: JourneySettings = {
  folders: [],
  courseFolderMap: {},
  viewType: "icon-lg",
  sortBy: "lastAccessed",
  activeFolderId: null,
}

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

const CourseCard = ({
  course,
  index,
  onRemove,
  onRate,
  userId,
  viewType = "icon-lg",
}: {
  course: CourseWithProgress
  index: number
  onRemove: () => void
  onRate: () => void
  userId: string
  viewType?: JourneyViewType
}) => {
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

  const sourceBadge = isOwnCourse ? (
    <Badge className="text-[10px] gap-1 shrink-0 bg-black/70 text-white border-0 shadow-md backdrop-blur-sm">
      <Sparkles className="h-3 w-3" />
      Generated
    </Badge>
  ) : (
    <Badge className="text-[10px] gap-1 shrink-0 bg-black/70 text-white border-0 shadow-md backdrop-blur-sm">
      <Library className="h-3 w-3" />
      Added
    </Badge>
  )

  const showPublish = isOwnCourse && !isPublished

  const actionBtnClass = cn(
    "inline-flex items-center justify-center gap-1 rounded-md border bg-background font-medium transition-colors",
    JOURNEY_CARD_ACTION_BTN
  )

  if (viewType === "list") {
    return (
      <div
        className="group flex min-h-[4.5rem] h-full items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => router.push(`/journey/${course.id}`)}
      >
        <div
          className={cn(
            "shrink-0 h-10 w-10 rounded overflow-hidden bg-muted flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br",
            !course.imageUrl && color
          )}
        >
          {course.imageUrl ? (
            <img src={course.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{course.title}</h3>
            {sourceBadge}
          </div>
          <p className="text-xs text-muted-foreground">
            {course.userProgress?.progress || 0}% · {completedModulesCount}/{course.modules.length} modules
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {showPublish && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => router.push(`/journey/${course.id}/publish`)}>
              <Upload className="h-3 w-3" />
            </Button>
          )}
          {course.userProgress?.lastAccessedModule !== undefined && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                router.push(
                  `/journey/${course.id}/modules/${course.userProgress?.lastAccessedModule}/lessons/${course.userProgress?.lastAccessedLesson}`
                )
              }
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  const footerCompact = viewType === "icon-sm" || viewType === "icon-md"

  return (
    <Card
      className={cn(
        "group h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative grid grid-rows-[minmax(0,1fr)_auto] py-0 gap-0",
        viewType === "icon-sm" && "text-sm"
      )}
    >
      <div
        className="relative min-h-0 overflow-hidden bg-muted cursor-pointer"
        onClick={() => router.push(`/journey/${course.id}`)}
      >
        {course.imageUrl ? (
          <img
            src={course.imageUrl}
            alt={course.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800"
            }}
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${color} font-bold text-white shadow-sm ${
              viewType === "icon-sm" ? "text-xl" : viewType === "icon-md" ? "text-2xl" : "text-3xl"
            }`}
          >
            {initials}
          </div>
        )}

        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="absolute top-1.5 right-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 bg-background/90 backdrop-blur-sm text-muted-foreground hover:text-destructive shadow-lg"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap max-w-[75%] z-10">
          {isNew && (
            <Badge className="bg-primary text-primary-foreground shadow-lg text-[10px]">New</Badge>
          )}
          {sourceBadge}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${course.userProgress?.progress || 0}%` }}
          />
        </div>
      </div>

      <div className={cn("border-t bg-card", footerCompact ? "px-1.5 py-1 space-y-0.5" : "px-2 py-1.5 space-y-1")}>
        <h3
          className={cn(
            "font-semibold leading-tight group-hover:text-primary transition-colors cursor-pointer line-clamp-1",
            viewType === "icon-sm" ? "text-[11px]" : viewType === "icon-md" ? "text-xs" : "text-sm"
          )}
          onClick={() => router.push(`/journey/${course.id}`)}
        >
          {course.title}
        </h3>
        {!footerCompact && (
          <p className="text-[10px] text-muted-foreground truncate">
            {course.userProgress?.progress || 0}% · {completedModulesCount}/{course.modules.length} modules
          </p>
        )}

        <div className="flex flex-col gap-0.5">
          {showPublish && viewType === "icon-lg" && (
            <button
              type="button"
              className={cn(
                actionBtnClass,
                expandedPublish && "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
              )}
              onClick={(e) => {
                e.stopPropagation()
                setExpandedPublish(!expandedPublish)
              }}
            >
              <Upload className="h-3 w-3 shrink-0" />
              {expandedPublish ? "Hide" : "Publish"}
            </button>
          )}

          {showPublish && viewType !== "icon-lg" && (
            <Link href={`/journey/${course.id}/publish`} className="block no-underline" onClick={(e) => e.stopPropagation()}>
              <span className={actionBtnClass}>
                <Upload className="h-3 w-3 shrink-0" />
                Publish
              </span>
            </Link>
          )}

          {showPublish && viewType === "icon-lg" && expandedPublish && publishReqs && (
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1">
                {publishReqs.courseCompleted ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}
                100% complete
              </div>
              <div className="flex items-center gap-1">
                {publishReqs.quizPassed ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}
                Final quiz &gt;70%
              </div>
              {publishReqs.canPublish && (
                <Link href={`/journey/${course.id}/publish`} className="block no-underline pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <span className={actionBtnClass}>Go to publish</span>
                </Link>
              )}
            </div>
          )}

          {isOwnCourse && isPublished && (
            <Link href={`/journey/${course.id}/republish`} className="block no-underline" onClick={(e) => e.stopPropagation()}>
              <span className={actionBtnClass}>
                <Upload className="h-3 w-3 shrink-0" />
                Push updates
              </span>
            </Link>
          )}

          {isPublished && !isOwnCourse && canReview && !hasRated && !footerCompact && (
            <button
              type="button"
              className={cn(actionBtnClass, "text-yellow-700 hover:bg-yellow-50")}
              onClick={(e) => {
                e.stopPropagation()
                onRate()
              }}
            >
              <Star className="h-3 w-3 shrink-0" />
              Rate
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function JourneyPage() {
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [courseLimits, setCourseLimits] = useState<CourseLimitInfo | null>(null)
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
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatContext()
  const [journeySettings, setJourneySettings] = useState<JourneySettings>(DEFAULT_JOURNEY_SETTINGS)

  const selectionAction = searchParams.get("action") as "share" | "challenge" | null
  const selectionFriendId = searchParams.get("friendId")
  const selectionFriendName = searchParams.get("friendName")
    ? decodeURIComponent(searchParams.get("friendName")!)
    : "friend"

  const boardCourses = useMemo(() => {
    if (selectionAction === "challenge") {
      return courses.filter(canSelectCourseForChallenge)
    }
    return courses
  }, [courses, selectionAction])

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
      const [fetchedCourses, completedRecords, limits, settings] = await Promise.all([
        getUserCourses(user.uid),
        getCompletedCourses(user.uid),
        getUserCourseLimits(user.uid),
        getJourneySettings(user.uid),
      ])
      
      setCourses(fetchedCourses)
      setCourseLimits(limits)
      setJourneySettings(settings)

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

  // Split for limits only (display is unified)
  const myCourses = courses.filter(c => c.userProgress?.isOwnCourse === true)
  const addedCourses = courses.filter(c => c.userProgress?.isOwnCourse === false)

  const statsCourses = useMemo(() => {
    if (journeySettings.activeFolderId) {
      const folder = journeySettings.folders.find((f) => f.id === journeySettings.activeFolderId)
      if (folder) return courses.filter((c) => folder.courseIds.includes(c.id))
    }
    return courses
  }, [courses, journeySettings.activeFolderId, journeySettings.folders])

  const displayStats = useMemo(
    () => computeJourneyStatsFromCourses(statsCourses),
    [statsCourses]
  )

  const refreshJourneySettings = useCallback(async () => {
    if (!user) return
    const settings = await getJourneySettings(user.uid)
    setJourneySettings(settings)
  }, [user])

  const openChatWithFriend = (friendId: string, friendName: string) => {
    router.push(
      `/friends?openChat=${encodeURIComponent(friendId)}&friendName=${encodeURIComponent(friendName)}`
    )
  }

  const handleSelectionCourse = async (course: CourseWithProgress) => {
    if (!user || !selectionFriendId || !selectionAction) return
    try {
      if (selectionAction === "share") {
        await sendMessage(user.uid, selectionFriendId, "", "course_share", course.id)
        toast.success(`Shared "${course.title}" with ${selectionFriendName}`)
        openChatWithFriend(selectionFriendId, selectionFriendName)
        return
      }

      if (selectionAction === "challenge") {
        if (!canSelectCourseForChallenge(course)) {
          toast.error("Complete at least one module to challenge on this course")
          return
        }
        router.push(
          `/friends?openChat=${encodeURIComponent(selectionFriendId)}&friendName=${encodeURIComponent(selectionFriendName)}&challengeCourseId=${encodeURIComponent(course.id)}`
        )
      }
    } catch {
      toast.error("Failed to complete action")
    }
  }

  const folderHandlers = user
    ? {
        onCreateFolder: async (name: string) => {
          await createJourneyFolder(user.uid, name)
          await refreshJourneySettings()
        },
        onRenameFolder: async (folderId: string, name: string) => {
          await renameJourneyFolder(user.uid, folderId, name)
          await refreshJourneySettings()
        },
        onDeleteFolder: async (folderId: string) => {
          await deleteJourneyFolder(user.uid, folderId)
          await refreshJourneySettings()
        },
        onMoveCourse: async (courseId: string, folderId: string | null) => {
          await moveCourseToFolder(user.uid, courseId, folderId)
          await refreshJourneySettings()
        },
        onViewTypeChange: async (viewType: JourneySettings["viewType"]) => {
          await setJourneyViewType(user.uid, viewType)
          setJourneySettings((s) => ({ ...s, viewType }))
        },
        onSortByChange: async (sortBy: JourneySettings["sortBy"]) => {
          await setJourneySortBy(user.uid, sortBy)
          setJourneySettings((s) => ({ ...s, sortBy }))
        },
        onActiveFolderChange: async (folderId: string | null) => {
          await setActiveFolder(user.uid, folderId)
          setJourneySettings((s) => ({ ...s, activeFolderId: folderId }))
        },
      }
    : null

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

  const renderCourseCard = (course: CourseWithProgress, index: number, viewType: JourneyViewType) => (
    <CourseCard
      key={course.id}
      course={course}
      index={index}
      onRemove={() => handleRemoveClick(course)}
      onRate={() => setRatingModal({ open: true, courseId: course.id, courseTitle: course.title })}
      userId={user!.uid}
      viewType={viewType}
    />
  )

  const handleRemoveConfirm = async () => {
    if (!user || !removeDialog.courseId) return

    try {
      setRemoving(true)
      await removeCourseFromLibrary(user.uid, removeDialog.courseId)
      invalidateAISuggestionCache(user.uid)
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">My Journey</h2>
                {selectionAction && (
                  <p className="text-sm text-primary mt-1">
                    {selectionAction === "challenge"
                      ? `Select a course with an unlocked module quiz to challenge ${selectionFriendName}`
                      : `Select a course to share with ${selectionFriendName}`}
                  </p>
                )}
              </div>
              <Button asChild size="lg" className="gap-2 shrink-0">
                <Link href="/create-course">
                  <Plus className="h-5 w-5" />
                  {courses.length === 0 ? "Add a course now!" : "Add more courses!"}
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrophyIcon className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{displayStats.modulesMastered}</p>
                      <p className="text-xs text-muted-foreground">
                        Modules Mastered{journeySettings.activeFolderId ? " (folder)" : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{displayStats.performanceRating}%</p>
                      <p className="text-xs text-muted-foreground">
                        Performance{journeySettings.activeFolderId ? " (folder)" : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{displayStats.gradeS}</p>
                      <p className="text-xs text-muted-foreground">
                        Grade S{journeySettings.activeFolderId ? " (folder)" : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {courses.length > 0 && folderHandlers && (
              <JourneyBoard
                allCourses={boardCourses}
                settings={journeySettings}
                courseLimits={courseLimits}
                selectionMode={selectionAction}
                onSelectCourse={selectionAction ? handleSelectionCourse : undefined}
                selectionEmptyMessage={
                  selectionAction === "challenge" && boardCourses.length === 0
                    ? "No courses with an unlocked module quiz yet. Complete a module to challenge a friend."
                    : undefined
                }
                renderCourse={renderCourseCard}
                {...folderHandlers}
              />
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

