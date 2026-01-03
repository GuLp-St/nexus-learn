"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Clock, CheckCircle, Play, Trash2, MoreVertical, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { useChatbotContext } from "@/components/chatbot-context-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { removeCourseFromLibrary } from "@/lib/library-utils"
import { CompletedCoursesModal } from "@/components/completed-courses-modal"
import { checkPublishRequirements, PublishRequirements } from "@/lib/publish-utils"
import { getCompletedCourses } from "@/lib/completion-utils"
import { Upload, AlertCircle, CheckCircle2, XCircle, Coins, Trophy } from "lucide-react"
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

function ContinueLearningButton({ courses }: { courses: CourseWithProgress[] }) {
  const [continueUrl, setContinueUrl] = useState<string | null>(null)
  const [details, setDetails] = useState<{
    course: string
    module: string
    lesson: string
    slide?: number
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const findContinueUrl = async () => {
      if (courses.length === 0) return

      // Find the most recent course (including completed courses for review)
      // Sort by lastAccessed
      const sorted = [...courses].sort((a, b) => {
        const aTime = a.userProgress?.lastAccessed?.toMillis() || 0
        const bTime = b.userProgress?.lastAccessed?.toMillis() || 0
        return bTime - aTime
      })

      const mostRecent = sorted[0]
      if (!mostRecent.userProgress?.lastAccessedModule && mostRecent.userProgress?.lastAccessedLesson === undefined) {
        return
      }

      const moduleIndex = mostRecent.userProgress.lastAccessedModule ?? 0
      const lessonIndex = mostRecent.userProgress.lastAccessedLesson ?? 0

      if (moduleIndex >= mostRecent.modules.length) return
      const module = mostRecent.modules[moduleIndex]
      if (lessonIndex >= module.lessons.length) return
      const lesson = module.lessons[lessonIndex]

      // Get slide progress
      const { getLessonSlideProgress } = await import("@/lib/course-utils")
      const lessonData = lesson as any
      const totalSlides = lessonData.slides?.length || 0
      const slideProgress = await getLessonSlideProgress(
        mostRecent.userProgress.userId,
        mostRecent.id,
        moduleIndex,
        lessonIndex,
        totalSlides
      )
      const currentSlide = slideProgress.currentSlide

      const cleanModuleTitle = module.title.replace(/^Module\s+\d+:\s*/i, "").trim() || module.title

      setDetails({
        course: mostRecent.title,
        module: `Module ${moduleIndex + 1}: ${cleanModuleTitle}`,
        lesson: `Lesson ${lessonIndex + 1}: ${lesson.title}`,
        slide: totalSlides > 0 ? currentSlide + 1 : undefined
      })

      setContinueUrl(`/courses/${mostRecent.id}/modules/${moduleIndex}/lessons/${lessonIndex}`)
    }

    findContinueUrl()
  }, [courses])

  if (!continueUrl) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Play className="mr-2 h-4 w-4" />
        Resume Course
      </Button>
    )
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="max-w-full text-foreground hover:text-primary"
        onClick={() => setConfirmOpen(true)}
      >
        <Play className="mr-2 h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">Resume Course</span>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resume Course</DialogTitle>
            <DialogDescription>
              Would you like to pick up where you left off?
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm border border-border">
              <p className="font-bold text-foreground break-words">{details.course}</p>
              <div className="space-y-1 text-muted-foreground">
                <p className="break-words">{details.module}</p>
                <p className="break-words">{details.lesson}</p>
                {details.slide && <p>Slide {details.slide}</p>}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              No
            </Button>
            <Button onClick={() => router.push(continueUrl)}>
              Yes, Resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const CourseCard = ({ course, index, onRemove, userId }: { course: CourseWithProgress; index: number; onRemove: () => void; userId: string }) => {
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
  const [showMenu, setShowMenu] = useState(false)
  const [publishReqs, setPublishReqs] = useState<PublishRequirements | null>(null)
  const [checkingReqs, setCheckingReqs] = useState(false)
  const [expandedPublish, setExpandedPublish] = useState(false)

  const isOwnCourse = course.userProgress?.isOwnCourse === true
  const isPublished = course.isPublic === true

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

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <Link href={`/courses/${course.id}`} className="flex items-center gap-3 flex-1">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-lg font-bold text-white shadow-sm`}
              >
                {initials}
              </div>
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {course.title}
                </h3>
                <p className="text-sm text-muted-foreground">{course.userProgress?.progress || 0}% Complete</p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {isPublished && <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200">Published</Badge>}
              {isNew && <Badge className="bg-primary text-primary-foreground">New</Badge>}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowMenu(!showMenu)
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute right-0 top-8 z-20 bg-background border border-border rounded-md shadow-lg min-w-[120px]">
                      {isOwnCourse && !isPublished && (
                        <Link href={`/courses/${course.id}/publish`}>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-primary"
                            disabled={!publishReqs?.canPublish}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Publish
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.preventDefault()
                          setShowMenu(false)
                          onRemove()
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${course.userProgress?.progress || 0}%` }}
              />
            </div>
          </div>

          {/* Publish Option Below Card */}
          {isOwnCourse && !isPublished && (
            <div className="pt-2 border-t border-border mt-2">
              {expandedPublish && !publishReqs?.canPublish && (
                <div className="space-y-2 mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded leading-relaxed">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Get at least 80% (Expert) on this course's course quiz to unlock publish</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {publishReqs?.quizPassed ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                      <span className={publishReqs?.quizPassed ? "text-green-600 font-medium" : "text-muted-foreground"}>80% Quiz</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {publishReqs?.isLevelFive ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                      <span className={publishReqs?.isLevelFive ? "text-green-600 font-medium" : "text-muted-foreground"}>Level 5</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {publishReqs?.hasEnoughNexon ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                      <span className={publishReqs?.hasEnoughNexon ? "text-green-600 font-medium" : "text-muted-foreground"}>500 Nexon</span>
                    </div>
                  </div>
                </div>
              )}
              
              {!publishReqs?.canPublish ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`w-full transition-all ${expandedPublish ? "bg-muted text-foreground border-primary/20" : "text-muted-foreground border-dashed hover:border-primary/30 hover:bg-primary/5"}`}
                  onClick={() => setExpandedPublish(!expandedPublish)}
                >
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Publish Course
                  {expandedPublish ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                </Button>
              ) : (
                <Link href={`/courses/${course.id}/publish`} className="block">
                  <Button variant="outline" size="sm" className="w-full text-primary border-primary/20 hover:bg-primary/5 shadow-sm">
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    Publish Course
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function LibraryPage() {
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeCourses: 0,
    completedCourses: 0,
    totalProgress: 0,
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
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { setPageContext } = useChatbotContext()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return

      try {
        setLoading(true)
        const [fetchedCourses, completedRecords] = await Promise.all([
          getUserCourses(user.uid),
          getCompletedCourses(user.uid)
        ])
        
        setCourses(fetchedCourses)

        const active = fetchedCourses.filter((c) => (c.userProgress?.progress || 0) < 100).length
        const totalProgress =
          fetchedCourses.length > 0
            ? fetchedCourses.reduce((sum, c) => sum + (c.userProgress?.progress || 0), 0) / fetchedCourses.length
            : 0

        setStats({
          activeCourses: active,
          completedCourses: completedRecords.length,
          totalProgress: Math.round(totalProgress),
        })
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

  useEffect(() => {
    setPageContext({
      type: "generic",
      pageName: "Library",
      description: `The user's course library with ${courses.length} courses. Stats: ${stats.activeCourses} active courses, ${stats.completedCourses} completed, ${stats.totalProgress}% average progress. The user can ask about their courses, learning progress, or which courses to focus on.`,
    })

    return () => {
      setPageContext(null)
    }
  }, [setPageContext, courses.length, stats])

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
        // Check how many users have this course in their library
        // We only care if it's 1 (the current user) or more than 1
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
      // Refresh courses and completion count
      const [fetchedCourses, completedRecords] = await Promise.all([
        getUserCourses(user.uid),
        getCompletedCourses(user.uid)
      ])
      
      setCourses(fetchedCourses)

      const active = fetchedCourses.filter((c) => (c.userProgress?.progress || 0) < 100).length
      const totalProgress =
        fetchedCourses.length > 0
          ? fetchedCourses.reduce((sum, c) => sum + (c.userProgress?.progress || 0), 0) / fetchedCourses.length
          : 0

      setStats({
        activeCourses: active,
        completedCourses: completedRecords.length,
        totalProgress: Math.round(totalProgress),
      })

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
      <SidebarNav currentPath="/library" title="My Library" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">My Library</h2>
              {courses.length > 0 && (
                <ContinueLearningButton courses={courses} />
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.activeCourses}</p>
                    <p className="text-sm text-muted-foreground">Active Courses</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalProgress}%</p>
                    <p className="text-sm text-muted-foreground">Average Progress</p>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:bg-accent/50 transition-all hover:scale-[1.02] hover:shadow-md border-2 hover:border-primary/50"
                onClick={() => setCompletedCoursesOpen(true)}
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="rounded-full bg-primary/10 p-3">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.completedCourses}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* My Courses Section */}
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold text-foreground">My Courses</h3>
              {myCourses.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                    <h4 className="text-lg font-semibold text-foreground mb-2">No courses created yet</h4>
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      Create your first course to get started
                    </p>
                    <Link href="/create-course">
                      <Button>
                        <Play className="mr-2 h-4 w-4" />
                        Create Course
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {myCourses.map((course, index) => (
                    <CourseCard key={course.id} course={course} index={index} onRemove={() => handleRemoveClick(course)} userId={user.uid} />
                  ))}
                </div>
              )}
            </div>

            {/* Added Courses Section */}
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold text-foreground">Added Courses</h3>
              {addedCourses.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                    <h4 className="text-lg font-semibold text-foreground mb-2">No added courses yet</h4>
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      Browse and add courses from the Create Course page
                    </p>
                    <Link href="/create-course">
                      <Button variant="outline">
                        Browse Courses
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {addedCourses.map((course, index) => (
                    <CourseCard key={course.id} course={course} index={index + myCourses.length} onRemove={() => handleRemoveClick(course)} userId={user.uid} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Remove Course Confirmation Dialog */}
      <Dialog 
        open={removeDialog.open} 
        onOpenChange={(open) => setRemoveDialog({ 
          open, 
          courseId: null, 
          courseTitle: "", 
          isPublic: false,
          isLastSubscriber: false,
          checkingSubscribers: false
        })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Course</DialogTitle>
          <DialogDescription>
            {removeDialog.checkingSubscribers ? (
              <div className="flex items-center gap-2 py-2">
                <Spinner className="h-4 w-4" />
                <span>Checking course status...</span>
              </div>
            ) : removeDialog.isPublic ? (
              <>
                Are you sure you want to remove <strong>{removeDialog.courseTitle}</strong> from your library? This will remove it from your active dashboard, but your progress will be saved if you decide to add it back from the public library later.
              </>
            ) : removeDialog.isLastSubscriber ? (
              <>
                Are you sure you want to remove <strong>{removeDialog.courseTitle}</strong>? Since you are the <strong>last user</strong> with this private course, it will be <strong>permanently deleted</strong> from the database and all progress will be lost.
              </>
            ) : (
              <>
                Are you sure you want to remove <strong>{removeDialog.courseTitle}</strong>? This is a private course, and while it will stay in the database for other users, it will be <strong>removed from your library</strong> and your personal progress will be lost.
              </>
            )}
          </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialog({ 
                open: false, 
                courseId: null, 
                courseTitle: "", 
                isPublic: false,
                isLastSubscriber: false,
                checkingSubscribers: false
              })}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveConfirm}
              disabled={removing}
            >
              {removing ? "Removing..." : "Remove Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completed Courses Modal */}
      {user && (
        <CompletedCoursesModal
          open={completedCoursesOpen}
          onOpenChange={setCompletedCoursesOpen}
          userId={user.uid}
        />
      )}
    </div>
  )
}

