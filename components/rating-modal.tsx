"use client"

import { useState } from "react"
import { Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { submitCourseRating } from "@/lib/rating-utils"
import { useXP } from "./xp-context-provider"

interface RatingModalProps {
  courseId: string
  userId: string
  courseTitle: string
  onClose: () => void
  onRated: () => void
}

export function RatingModal({ courseId, userId, courseTitle, onClose, onRated }: RatingModalProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [review, setReview] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const { showXPAward } = useXP()

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Please select a rating")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const result = await submitCourseRating(userId, courseId, rating, review.trim() || undefined)
      if (result) {
        showXPAward(result)
      }
      onRated()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to submit rating. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Rate This Course</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>{courseTitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Rating
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="focus:outline-none"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating >= 4 && (
              <p className="text-xs text-muted-foreground mt-2">
                Great! This course will be published to the public library.
              </p>
            )}
            {rating > 0 && rating < 4 && (
              <p className="text-xs text-muted-foreground mt-2">
                This course will remain private. You can still share it with friends!
              </p>
            )}
          </div>

          <div>
            <label htmlFor="review" className="text-sm font-medium text-foreground mb-2 block">
              Review (Optional)
            </label>
            <Textarea
              id="review"
              placeholder="Share your thoughts about this course..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Skip
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || rating === 0}>
              {submitting ? "Submitting..." : "Submit Rating"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

