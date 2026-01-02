"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import { getUserCourses, CourseWithProgress } from "@/lib/course-utils"
import { Spinner } from "@/components/ui/spinner"
import { sendMessage } from "@/lib/chat-utils"

interface CourseShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
}

export function CourseShareModal({
  open,
  onOpenChange,
  friendId,
  friendNickname,
}: CourseShareModalProps) {
  const { user } = useAuth()
  const [courses, setCourses] = useState<CourseWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<string>("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) return

      try {
        setLoading(true)
        const userCourses = await getUserCourses(user.uid)
        setCourses(userCourses)
        if (userCourses.length > 0) {
          setSelectedCourseId(userCourses[0].id)
        }
      } catch (error) {
        console.error("Error fetching courses:", error)
      } finally {
        setLoading(false)
      }
    }

    if (open) {
      fetchCourses()
    }
  }, [open, user])

  const handleShare = async () => {
    if (!user || !selectedCourseId) return

    setSending(true)
    try {
      await sendMessage(user.uid, friendId, "", "course_share", selectedCourseId)
      onOpenChange(false)
    } catch (error) {
      console.error("Error sharing course:", error)
      alert("Failed to share course. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Course with {friendNickname}</DialogTitle>
          <DialogDescription>
            Select a course to share with your friend
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>You don't have any courses to share yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Course Selection */}
            <div className="space-y-2">
              <label htmlFor="course" className="text-sm font-medium">Course</label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger id="course">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Share Button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleShare}
                disabled={!selectedCourseId || sending}
              >
                {sending ? "Sharing..." : "Share Course"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

