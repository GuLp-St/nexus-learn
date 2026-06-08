"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Folder,
  FolderOutput,
  LayoutGrid,
  List,
  Grid2x2,
  Grid3x3,
  Plus,
  ChevronLeft,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type {
  JourneyFolder,
  JourneySettings,
  JourneySortBy,
  JourneyViewType,
} from "@/lib/journey-settings-utils"
import { getVisibleCourses } from "@/lib/journey-settings-utils"
import type { CourseWithProgress } from "@/lib/course-utils"
import type { CourseLimitInfo } from "@/lib/course-limit-utils"
import { getNextLevelLimits } from "@/lib/journey-settings-utils"
import { sortJourneyCourses } from "@/lib/journey-sort-utils"
import { journeyCardShellClass, journeyGridClass } from "@/lib/journey-card-layout"
import { JourneyFolderCard } from "@/components/journey-folder-card"

const VIEW_OPTIONS: { id: JourneyViewType; label: string; icon: React.ReactNode }[] = [
  { id: "list", label: "List", icon: <List className="h-4 w-4" /> },
  { id: "icon-sm", label: "Small", icon: <Grid3x3 className="h-4 w-4" /> },
  { id: "icon-md", label: "Medium", icon: <Grid2x2 className="h-4 w-4" /> },
  { id: "icon-lg", label: "Large", icon: <LayoutGrid className="h-4 w-4" /> },
]

const SORT_OPTIONS: { id: JourneySortBy; label: string }[] = [
  { id: "lastAccessed", label: "Last accessed" },
  { id: "addedDate", label: "Date added" },
  { id: "generated", label: "Generated first" },
  { id: "added", label: "Added first" },
  { id: "title", label: "Title A–Z" },
]

interface JourneyBoardProps {
  allCourses: CourseWithProgress[]
  settings: JourneySettings
  courseLimits?: CourseLimitInfo | null
  selectionMode?: "share" | "challenge" | null
  onSelectCourse?: (course: CourseWithProgress) => void
  selectionEmptyMessage?: string
  renderCourse: (
    course: CourseWithProgress,
    index: number,
    viewType: JourneyViewType,
    onMoveToFolder?: () => void
  ) => React.ReactNode
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (folderId: string, name: string) => Promise<void>
  onDeleteFolder: (folderId: string) => Promise<void>
  onMoveCourse: (courseId: string, folderId: string | null) => Promise<void>
  onViewTypeChange: (viewType: JourneyViewType) => Promise<void>
  onSortByChange: (sortBy: JourneySortBy) => Promise<void>
  onActiveFolderChange: (folderId: string | null) => Promise<void>
}

export function JourneyBoard({
  allCourses,
  settings,
  courseLimits,
  selectionMode,
  onSelectCourse,
  selectionEmptyMessage,
  renderCourse,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveCourse,
  onViewTypeChange,
  onSortByChange,
  onActiveFolderChange,
}: JourneyBoardProps) {
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renameFolder, setRenameFolder] = useState<JourneyFolder | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [dragCourseId, setDragCourseId] = useState<string | null>(null)
  const [moveCourseId, setMoveCourseId] = useState<string | null>(null)

  const activeFolder = settings.activeFolderId
    ? settings.folders.find((f) => f.id === settings.activeFolderId)
    : null

  const visibleCourses = useMemo(() => {
    const raw = getVisibleCourses(allCourses, settings)
    return sortJourneyCourses(raw, settings.sortBy)
  }, [allCourses, settings])

  const viewType = settings.viewType
  const gridClass = journeyGridClass(viewType)
  const shellClass = journeyCardShellClass(viewType)
  const nextLimits = courseLimits ? getNextLevelLimits(courseLimits.level) : null

  const handleDropOnFolder = useCallback(
    async (folderId: string | null) => {
      if (!dragCourseId) return
      await onMoveCourse(dragCourseId, folderId)
      setDragCourseId(null)
    },
    [dragCourseId, onMoveCourse]
  )

  const moveCourseCurrentFolder = moveCourseId
    ? settings.courseFolderMap[moveCourseId] ?? null
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {activeFolder && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onActiveFolderChange(null)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <h3 className="text-lg font-semibold text-foreground">
              {activeFolder ? activeFolder.name : "All Courses"}
            </h3>
          </div>
          {courseLimits && !activeFolder && (
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">
                {courseLimits.generated}/{courseLimits.maxGenerated} generated
              </span>
              {" · "}
              <span className="font-medium text-foreground">
                {courseLimits.added}/{courseLimits.maxAdded} added
              </span>
              {nextLimits && courseLimits.level < 100 && (
                <span className="text-primary/90">
                  {" "}
                  · Level up unlocks {nextLimits.maxGenerated} generated & {nextLimits.maxAdded} added
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap shrink-0 self-start sm:self-auto">
          {!activeFolder && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 shrink min-w-0 px-2 sm:px-3 h-8 sm:h-9 text-xs sm:text-sm"
              onClick={() => {
                setNewFolderName("")
                setNewFolderOpen(true)
              }}
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span className="truncate">New folder</span>
            </Button>
          )}
          <Select
            value={settings.sortBy}
            onValueChange={(v) => onSortByChange(v as JourneySortBy)}
          >
            <SelectTrigger className="w-[110px] sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={viewType}
            onValueChange={(v) => onViewTypeChange(v as JourneyViewType)}
          >
            <SelectTrigger className="w-[96px] sm:w-[120px] h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3 shrink-0">
              <SelectValue placeholder="View" />
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  <span className="flex items-center gap-2">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectionMode && (
        <p className="text-sm text-primary bg-primary/10 rounded-lg px-3 py-2">
          Select a course to {selectionMode === "share" ? "share" : "challenge"} with your friend
        </p>
      )}

      {activeFolder && settings.folders.length > 0 && (
        <div
          className={cn(
            "rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground text-center transition-colors",
            dragCourseId && "border-primary bg-primary/5 text-primary"
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleDropOnFolder(null)
          }}
        >
          Drop here to move out of folder
        </div>
      )}

      {!activeFolder && settings.folders.length > 0 && (
        <div className={gridClass}>
          {settings.folders.map((folder) => (
            <div key={folder.id} className={cn(shellClass, "min-w-0")}>
              <JourneyFolderCard
                folder={folder}
                courses={allCourses}
                viewType={viewType}
                dragActive={!!dragCourseId}
                onOpen={() => onActiveFolderChange(folder.id)}
                onRename={() => {
                  setRenameFolder(folder)
                  setRenameValue(folder.name)
                }}
                onDelete={() => onDeleteFolder(folder.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDropOnFolder(folder.id)
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className={gridClass}>
        {visibleCourses.map((course, index) => (
          <div
            key={course.id}
            className={cn(
              shellClass,
              "min-w-0 relative",
              selectionMode && "ring-2 ring-transparent hover:ring-primary rounded-xl cursor-pointer",
              !selectionMode && "group"
            )}
            draggable={!selectionMode}
            onDragStart={() => setDragCourseId(course.id)}
            onDragEnd={() => setDragCourseId(null)}
            onClickCapture={
              selectionMode && onSelectCourse
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSelectCourse(course)
                  }
                : undefined
            }
          >
            <div
              className={cn(
                "h-full rounded-xl",
                viewType === "list" ? "overflow-visible" : "overflow-hidden"
              )}
            >
              {renderCourse(
                course,
                index,
                viewType,
                !selectionMode && settings.folders.length > 0
                  ? () => setMoveCourseId(course.id)
                  : undefined
              )}
            </div>
          </div>
        ))}
      </div>

      {visibleCourses.length === 0 && (activeFolder || settings.folders.length === 0) && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {selectionEmptyMessage ??
            (activeFolder
              ? "This folder is empty. Drag courses here or use the folder button on a course."
              : "No courses yet.")}
        </p>
      )}

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newFolderName.trim()}
              onClick={() => onCreateFolder(newFolderName).then(() => setNewFolderOpen(false))}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFolder} onOpenChange={(o) => !o && setRenameFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolder(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameFolder) {
                  onRenameFolder(renameFolder.id, renameValue).then(() => setRenameFolder(null))
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveCourseId} onOpenChange={(o) => !o && setMoveCourseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move course</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {moveCourseCurrentFolder && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  if (moveCourseId) {
                    onMoveCourse(moveCourseId, null).then(() => setMoveCourseId(null))
                  }
                }}
              >
                <FolderOutput className="h-4 w-4" />
                Remove from folder
              </Button>
            )}
            {settings.folders
              .filter((f) => f.id !== moveCourseCurrentFolder)
              .map((folder) => (
                <Button
                  key={folder.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    if (moveCourseId) {
                      onMoveCourse(moveCourseId, folder.id).then(() => setMoveCourseId(null))
                    }
                  }}
                >
                  <Folder className="h-4 w-4" />
                  {folder.name}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
