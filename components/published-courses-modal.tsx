"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getUserPublishedCourses, PublicCourse } from "@/lib/course-utils"
import { Spinner } from "@/components/ui/spinner"
import { Send, BookOpen, Star, Users } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { formatDateForDisplay } from "@/lib/date-utils"

interface PublishedCoursesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function PublishedCoursesModal({ open, onOpenChange, userId }: PublishedCoursesModalProps) {
  const [publishedCourses, setPublishedCourses] = useState<PublicCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      const fetchPublished = async () => {
        setLoading(true)
        try {
          const courses = await getUserPublishedCourses(userId)
          setPublishedCourses(courses)
        } catch (error) {
          console.error("Error fetching published courses:", error)
        } finally {
          setLoading(false)
        }
      }

      fetchPublished()
    }
  }, [open, userId])

  const formatDate = (timestamp: Timestamp | undefined) => {
    return formatDateForDisplay(timestamp, "MMM d, yyyy")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Published Courses</DialogTitle>
          <DialogDescription>
            Courses you have shared with the community
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : publishedCourses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No published courses yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {publishedCourses.map((course) => (
                <div
                  key={course.id}
                  className="flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 rounded-full p-2 bg-indigo-500/10">
                        <BookOpen className="h-4 w-4 text-indigo-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {course.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Published on {formatDate(course.publishedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-medium">
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>{course.averageRating?.toFixed(1) || "0.0"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-blue-500">
                        <Users className="h-3.5 w-3.5" />
                        <span>{course.addedCount || 0}</span>
                      </div>
                    </div>
                  </div>
                  {course.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {course.description}
                    </p>
                  )}
                  {course.tags && course.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {course.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                      {course.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">+{course.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

