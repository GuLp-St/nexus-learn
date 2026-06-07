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
import {
  checkRepublishRequirements,
  republishCourse,
  type RepublishRequirements,
} from "@/lib/publish-utils"
import { getCourseWithProgress } from "@/lib/course-utils"
import { UniversalImagePicker } from "@/components/universal-image-picker"
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { REPUBLISH_NEXON_COST } from "@/lib/course-constants"

export default function RepublishCoursePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const { user, loading: authLoading } = useAuth()

  const [course, setCourse] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [requirements, setRequirements] = useState<RepublishRequirements | null>(null)
  const [republishing, setRepublishing] = useState(false)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [imageKey, setImageKey] = useState<string | undefined>(undefined)
  const [imageConfig, setImageConfig] = useState<{
    fit: "cover" | "contain"
    position: { x: number; y: number }
    scale: number
  }>({ fit: "cover", position: { x: 50, y: 50 }, scale: 1 })
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [changelog, setChangelog] = useState("")

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
          router.push("/journey")
          return
        }

        if (courseData.createdBy !== user.uid) {
          router.push(`/journey/${courseId}`)
          return
        }

        if (!courseData.isPublic) {
          router.push(`/journey/${courseId}/publish`)
          return
        }

        setCourse(courseData)
        setTitle(courseData.title || "")
        setDescription(courseData.description || "")
        setImageUrl(courseData.imageUrl || "")
        setImageKey(courseData.imageKey || undefined)
        if (courseData.imageConfig) setImageConfig(courseData.imageConfig)
        setTags(courseData.tags || [])

        const reqs = await checkRepublishRequirements(user.uid, courseId)
        setRequirements(reqs)
      } catch (error) {
        console.error("Error loading course:", error)
        router.push("/journey")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [courseId, user, authLoading, router])

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleRepublish = async () => {
    if (!user || !requirements?.canRepublish) return

    setRepublishing(true)
    try {
      await republishCourse(user.uid, courseId, {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl || undefined,
        imageKey: imageKey || undefined,
        imageConfig: imageUrl ? imageConfig : undefined,
        tags: tags.length > 0 ? tags : undefined,
        changelog: changelog.trim() || undefined,
      })
      router.push(`/journey/${courseId}`)
    } catch (error: any) {
      console.error("Error republishing course:", error)
      alert(error.message || "Failed to republish course. Please try again.")
    } finally {
      setRepublishing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!course || !requirements) return null

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/journey" title="Republish Course" />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Push course updates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Subscribers receive your latest content. Learners with notes on changed blocks will be
              prompted to keep or discard them.
            </p>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {requirements.hasEnoughNexon ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-sm">
                  {requirements.hasEnoughNexon ? "Enough" : "Not enough"} Nexon (
                  {requirements.currentNexon}/{REPUBLISH_NEXON_COST})
                  <NexonIcon className="inline h-4 w-4 ml-1" />
                </span>
              </div>
            </CardContent>
          </Card>

          {!requirements.hasEnoughNexon && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You need {REPUBLISH_NEXON_COST} Nexon to push updates to the community library.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <Label>Changelog (optional)</Label>
              <Textarea
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="What changed in this update?"
                rows={3}
              />
            </div>
            <UniversalImagePicker
              value={imageUrl}
              imageKey={imageKey}
              initialKey={course?.imageKey}
              initialObjectFit={imageConfig.fit}
              initialPosition={imageConfig.position}
              initialScale={imageConfig.scale}
              onChange={(url: string, key?: string, config?: typeof imageConfig) => {
                setImageUrl(url)
                setImageKey(key)
                if (config) setImageConfig(config)
              }}
              routeSlug="courseImage"
            />
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag"
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      {tag} ×
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={republishing || !requirements.canRepublish || !title.trim()}
            onClick={handleRepublish}
          >
            {republishing ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Pushing updates…
              </>
            ) : (
              <>Push updates ({REPUBLISH_NEXON_COST} Nexon)</>
            )}
          </Button>
        </div>
      </main>
    </div>
  )
}
