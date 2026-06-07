"use client"

import { FolderOpen, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { JourneyFolder, JourneyViewType } from "@/lib/journey-settings-utils"
import type { CourseWithProgress } from "@/lib/course-utils"

const colorGradients = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-green-500 to-emerald-500",
  "from-orange-500 to-red-500",
]

interface JourneyFolderCardProps {
  folder: JourneyFolder
  courses: CourseWithProgress[]
  viewType: JourneyViewType
  dragActive?: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

function courseThumb(course: CourseWithProgress, index: number, size: "sm" | "md") {
  const initials = course.title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  const color = colorGradients[index % colorGradients.length]
  const dim = size === "sm" ? "h-7 w-7 text-[7px]" : "h-10 w-10 text-[9px]"

  if (course.imageUrl) {
    return (
      <img
        src={course.imageUrl}
        alt=""
        className={cn("rounded object-cover border border-background shadow-sm", dim)}
      />
    )
  }
  return (
    <div
      className={cn(
        "rounded flex items-center justify-center font-bold text-white bg-gradient-to-br shadow-sm border border-background",
        dim,
        color
      )}
    >
      {initials}
    </div>
  )
}

function FolderPreviewStack({ courses, compact }: { courses: CourseWithProgress[]; compact?: boolean }) {
  const previews = courses.slice(0, 3)
  if (previews.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <FolderOpen className={cn("text-primary/50", compact ? "h-7 w-7" : "h-10 w-10")} />
      </div>
    )
  }

  const offsets = [
    "left-[10%] top-[20%] -rotate-6 z-10",
    "left-[34%] top-[10%] rotate-3 z-20",
    "left-[58%] top-[22%] -rotate-2 z-30",
  ]

  return (
    <div className="relative h-full w-full">
      {previews.map((course, i) => (
        <div key={course.id} className={cn("absolute", offsets[i] ?? offsets[0])}>
          {courseThumb(course, i, compact ? "sm" : "md")}
        </div>
      ))}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[80%] h-2 bg-primary/25 rounded-b-md" />
    </div>
  )
}

export function JourneyFolderCard({
  folder,
  courses,
  viewType,
  dragActive,
  onOpen,
  onRename,
  onDelete,
  onDragOver,
  onDrop,
}: JourneyFolderCardProps) {
  const folderCourses = courses.filter((c) => folder.courseIds.includes(c.id))

  if (viewType === "list") {
    return (
      <div
        className={cn(
          "flex h-full items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/40 transition-colors",
          dragActive && "border-primary/50 bg-primary/5"
        )}
        onClick={onOpen}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <FolderOpen className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground">{folderCourses.length} courses</p>
        </div>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRename}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  const compact = viewType === "icon-sm"

  return (
    <Card
      className={cn(
        "group h-full overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 grid grid-rows-[minmax(0,1fr)_auto] py-0 gap-0",
        dragActive && "border-primary/50 bg-primary/5"
      )}
      onClick={onOpen}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="relative min-h-0 overflow-hidden bg-muted/40">
        <FolderPreviewStack courses={folderCourses} compact={compact} />
      </div>
      <div className="border-t bg-card px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold truncate leading-snug text-foreground", compact ? "text-[11px]" : "text-sm")}>
              {folder.name}
            </p>
            <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {folderCourses.length} course{folderCourses.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div
            className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRename}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
