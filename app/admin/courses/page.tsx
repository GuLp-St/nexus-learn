"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Globe, Trash2, EyeOff, Pencil, Search, ArrowUpDown } from "lucide-react"
import SidebarNav from "@/components/sidebar-nav"
import { AdminGuard } from "@/components/admin/admin-guard"
import { UniversalImagePicker } from "@/components/universal-image-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminJson } from "@/lib/admin-api-client"
import { toast } from "sonner"

type ImageConfig = {
  fit: "cover" | "contain"
  position: { x: number; y: number }
  scale: number
}

type PublicCourse = {
  id: string
  title: string
  description: string
  createdBy: string | null
  tags: string[]
  imageUrl: string | null
  imageKey: string | null
  imageConfig: ImageConfig | null
  averageRating: number
  ratingCount: number
  addedCount: number
  publishedAt: number | null
}

const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  fit: "cover",
  position: { x: 50, y: 50 },
  scale: 1,
}

type SortKey =
  | "published_desc"
  | "published_asc"
  | "title_asc"
  | "title_desc"
  | "adds_desc"
  | "rating_desc"

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<PublicCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("published_desc")
  const [editCourse, setEditCourse] = useState<PublicCourse | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editTags, setEditTags] = useState("")
  const [editImageUrl, setEditImageUrl] = useState("")
  const [editImageKey, setEditImageKey] = useState<string | undefined>()
  const [editImageConfig, setEditImageConfig] = useState<ImageConfig>(DEFAULT_IMAGE_CONFIG)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminJson<{ courses: PublicCourse[] }>("/api/admin/courses")
      setCourses(data.courses)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load courses")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openEdit = (c: PublicCourse) => {
    setEditCourse(c)
    setEditTitle(c.title)
    setEditDesc(c.description)
    setEditTags((c.tags ?? []).join(", "))
    setEditImageUrl(c.imageUrl ?? "")
    setEditImageKey(c.imageKey ?? undefined)
    setEditImageConfig(c.imageConfig ?? DEFAULT_IMAGE_CONFIG)
  }

  const unpublish = async (courseId: string) => {
    try {
      await adminJson("/api/admin/courses", {
        method: "PATCH",
        body: { courseId, action: "unpublish" },
      })
      toast.success("Course unpublished")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }

  const saveEdit = async () => {
    if (!editCourse) return
    setSaving(true)
    try {
      await adminJson("/api/admin/courses", {
        method: "PATCH",
        body: {
          courseId: editCourse.id,
          action: "update",
          title: editTitle,
          description: editDesc,
          tags: editTags,
          imageUrl: editImageUrl,
          imageKey: editImageKey ?? null,
          imageConfig: editImageConfig,
        },
      })
      toast.success("Course updated")
      setEditCourse(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = courses
    if (q) {
      list = courses.filter((c) => {
        const haystack = [
          c.title,
          c.description,
          c.id,
          c.createdBy ?? "",
          ...(c.tags ?? []),
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    const sorted = [...list]
    switch (sortBy) {
      case "title_asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case "title_desc":
        sorted.sort((a, b) => b.title.localeCompare(a.title))
        break
      case "adds_desc":
        sorted.sort((a, b) => b.addedCount - a.addedCount)
        break
      case "rating_desc":
        sorted.sort((a, b) => b.averageRating - a.averageRating)
        break
      case "published_asc":
        sorted.sort((a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0))
        break
      case "published_desc":
      default:
        sorted.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
        break
    }
    return sorted
  }, [courses, searchQuery, sortBy])

  const deleteCourse = async () => {
    if (!deleteId) return
    setSaving(true)
    try {
      await adminJson(`/api/admin/courses?courseId=${encodeURIComponent(deleteId)}`, {
        method: "DELETE",
      })
      toast.success("Course deleted")
      setDeleteId(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminGuard>
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav currentPath="/admin/courses" title="Admin — Courses" />
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Community courses</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Edit metadata, tags, cover (upload / AI / Unsplash), unpublish, or delete.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Published ({loading ? "…" : courses.length})
                </CardTitle>
                <CardDescription>Edit metadata, unpublish, or permanently delete.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search title, tags, ID, creator…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <ArrowUpDown className="h-4 w-4 mr-2 shrink-0" />
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="published_desc">Newest published</SelectItem>
                      <SelectItem value="published_asc">Oldest published</SelectItem>
                      <SelectItem value="title_asc">Title A → Z</SelectItem>
                      <SelectItem value="title_desc">Title Z → A</SelectItem>
                      <SelectItem value="adds_desc">Most adds</SelectItem>
                      <SelectItem value="rating_desc">Highest rating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!loading && searchQuery && (
                  <p className="text-xs text-muted-foreground">
                    Showing {filteredCourses.length} of {courses.length} courses
                  </p>
                )}
                {filteredCourses.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border p-4 space-y-2"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="h-20 w-32 rounded-md object-cover shrink-0 border border-border"
                          style={{
                            objectFit: c.imageConfig?.fit ?? "cover",
                            transform: `scale(${c.imageConfig?.scale ?? 1})`,
                          }}
                        />
                      ) : (
                        <div className="h-20 w-32 rounded-md bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                          No cover
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{c.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {c.description || "No description"}
                        </p>
                        <div className="flex gap-1 flex-wrap mt-2">
                          <Badge variant="outline">★ {c.averageRating.toFixed(1)}</Badge>
                          <Badge variant="secondary">{c.addedCount} adds</Badge>
                        </div>
                      </div>
                    </div>
                    {c.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs font-mono text-muted-foreground">{c.id}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => unpublish(c.id)}>
                        <EyeOff className="h-3.5 w-3.5 mr-1" />
                        Unpublish
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {!loading && courses.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No published courses yet
                  </p>
                )}
                {!loading && courses.length > 0 && filteredCourses.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No courses match your search
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <Dialog open={!!editCourse} onOpenChange={(o) => !o && setEditCourse(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit community course</DialogTitle>
            <DialogDescription>
              Tags are comma-separated. Upload, generate AI, or pick from Unsplash for the cover.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="course-title">Title</Label>
              <Input
                id="course-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="course-desc">Description</Label>
              <Input
                id="course-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="course-tags">Tags (comma-separated)</Label>
              <Input
                id="course-tags"
                placeholder="math, beginner, python"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Cover image</Label>
              <div className="mt-2">
                <UniversalImagePicker
                  value={editImageUrl}
                  imageKey={editImageKey}
                  initialKey={editCourse?.imageKey ?? undefined}
                  routeSlug="courseImage"
                  allowedModes={["upload", "ai", "unsplash"]}
                  initialObjectFit={editImageConfig.fit}
                  initialPosition={editImageConfig.position}
                  initialScale={editImageConfig.scale}
                  onChange={(url, key, config) => {
                    setEditImageUrl(url)
                    if (key) setEditImageKey(key)
                    if (config) setEditImageConfig(config)
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditCourse(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete published course?</DialogTitle>
            <DialogDescription>
              Removes the course and all user progress entries for it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteCourse} disabled={saving}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminGuard>
  )
}
