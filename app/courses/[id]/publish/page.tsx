"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { checkPublishRequirements, publishCourse, PublishRequirements } from "@/lib/publish-utils"
import { getCourseWithProgress } from "@/lib/course-utils"
import { UnsplashImagePicker } from "@/components/unsplash-image-picker"
import { CheckCircle2, XCircle, AlertCircle, Coins } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

const PUBLISH_XP_COST = 500
const MIN_QUIZ_SCORE = 80

export default function PublishCoursePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const { user, loading: authLoading } = useAuth()

  const [course, setCourse] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [requirements, setRequirements] = useState<PublishRequirements | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    const loadData = async () => {
      try {
        setLoading(true)
        const courseData = await getCourseWithProgress(courseId, user.uid)
        
        if (!courseData) {
          router.push("/library")
          return
        }

        // Check if user is creator
        if (courseData.createdBy !== user.uid) {
          router.push(`/courses/${courseId}`)
          return
        }

        // Check if already published
        if (courseData.isPublic) {
          router.push(`/courses/${courseId}`)
          return
        }

        setCourse(courseData)
        setTitle(courseData.title || "")
        setDescription(courseData.description || "")
        setImageUrl(courseData.imageUrl || "")
        setTags(courseData.tags || [])

        // Check requirements
        const reqs = await checkPublishRequirements(user.uid, courseId)
        setRequirements(reqs)
      } catch (error) {
        console.error("Error loading course:", error)
        router.push("/library")
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadData()
    }
  }, [courseId, user, authLoading, router])

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handlePublish = async () => {
    if (!user || !requirements || !requirements.canPublish) return

    setPublishing(true)
    try {
      await publishCourse(user.uid, courseId, {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl || undefined,
        tags: tags.length > 0 ? tags : undefined,
      })

      router.push(`/courses/${courseId}`)
    } catch (error: any) {
      console.error("Error publishing course:", error)
      alert(error.message || "Failed to publish course. Please try again.")
    } finally {
      setPublishing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!course || !requirements) {
    return null
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav title="Publish Course" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Publish Course</h1>
              <p className="text-muted-foreground mt-2">
                Make your course available to the community
              </p>
            </div>

            {/* Requirements Check */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-semibold">Publishing Requirements</h2>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {requirements.courseCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={requirements.courseCompleted ? "" : "text-muted-foreground"}>
                      Complete the course (100% progress)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {requirements.quizPassed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={requirements.quizPassed ? "" : "text-muted-foreground"}>
                      Pass the course quiz with {MIN_QUIZ_SCORE}% or higher
                      {requirements.quizScore !== undefined && (
                        <span className="ml-2">(Your score: {requirements.quizScore}%)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {requirements.hasEnoughXP ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={requirements.hasEnoughXP ? "" : "text-muted-foreground"}>
                      Have {PUBLISH_XP_COST} XP (You have: {requirements.currentXP} XP)
                    </span>
                  </div>
                </div>

                {!requirements.canPublish && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Please meet all requirements before publishing your course.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Edit Form */}
            {requirements.canPublish && (
              <Card>
                <CardContent className="p-6 space-y-6">
                  <h2 className="text-lg font-semibold">Course Details</h2>

                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title">Course Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter course title"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter course description"
                      rows={4}
                    />
                  </div>

                  {/* Image */}
                  <div className="space-y-2">
                    <Label>Course Image</Label>
                    <UnsplashImagePicker
                      value={imageUrl}
                      onChange={setImageUrl}
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tags"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddTag()
                          }
                        }}
                        placeholder="Add a tag and press Enter"
                      />
                      <Button type="button" onClick={handleAddTag} disabled={!tagInput.trim() || tags.length >= 10}>
                        Add
                      </Button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="hover:text-primary/70"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Publish Button */}
            {requirements.canPublish && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Publishing Cost: {PUBLISH_XP_COST} XP
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your current balance: {requirements.currentXP} XP
                      </p>
                    </div>
                    <Button
                      onClick={handlePublish}
                      disabled={publishing || !title.trim()}
                      size="lg"
                    >
                      {publishing ? (
                        <>
                          <Spinner className="h-4 w-4 mr-2" />
                          Publishing...
                        </>
                      ) : (
                        "Pay & Publish"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

