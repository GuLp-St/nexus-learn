"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getCompletedCourses, CompletedItem } from "@/lib/completion-utils"
import { Spinner } from "@/components/ui/spinner"
import { Award, BookOpen } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { getDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { formatDateForDisplay } from "@/lib/date-utils"

interface CompletedCoursesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function CompletedCoursesModal({ open, onOpenChange, userId }: CompletedCoursesModalProps) {
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([])
  const [courseTitles, setCourseTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      const fetchCompleted = async () => {
        setLoading(true)
        try {
          const items = await getCompletedCourses(userId)
          setCompletedItems(items)
          
          // Fetch course titles
          const titles: Record<string, string> = {}
          const uniqueCourseIds = [...new Set(items.map(item => item.courseId))]
          
          await Promise.all(
            uniqueCourseIds.map(async (courseId) => {
              try {
                const courseDoc = await getDoc(doc(db, "courses", courseId))
                if (courseDoc.exists()) {
                  titles[courseId] = courseDoc.data().title || "Unknown Course"
                }
              } catch (error) {
                console.error(`Error fetching course ${courseId}:`, error)
              }
            })
          )
          
          setCourseTitles(titles)
        } catch (error) {
          console.error("Error fetching completed courses:", error)
        } finally {
          setLoading(false)
        }
      }

      fetchCompleted()
    }
  }, [open, userId])

  const formatDate = (timestamp: Timestamp | undefined) => {
    return formatDateForDisplay(timestamp, "MMM d, yyyy")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Completed Courses</DialogTitle>
          <DialogDescription>
            All courses you have completed
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : completedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No completed courses yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-shrink-0 rounded-full p-2 bg-primary/10">
                    <Award className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {courseTitles[item.courseId] || "Unknown Course"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Completed on {formatDate(item.completedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

