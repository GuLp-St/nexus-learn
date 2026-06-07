import { getCourseLimitsForLevel } from "./course-limit-utils"
import type { CourseWithProgress } from "./course-utils"
import { db } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore"

export type JourneyViewType = "list" | "icon-sm" | "icon-md" | "icon-lg"

export type JourneySortBy =
  | "lastAccessed"
  | "addedDate"
  | "generated"
  | "added"
  | "title"

/** Migrate legacy view type values */
export function normalizeViewType(raw: string | undefined): JourneyViewType {
  if (raw === "list" || raw === "row") return "list"
  if (raw === "icon-sm" || raw === "icon-md" || raw === "icon-lg") return raw
  if (raw === "detail") return "icon-lg"
  return "icon-lg"
}

export interface JourneyFolder {
  id: string
  name: string
  courseIds: string[]
  createdAt: number
}

export interface JourneySettings {
  folders: JourneyFolder[]
  /** courseId → folderId */
  courseFolderMap: Record<string, string>
  viewType: JourneyViewType
  sortBy: JourneySortBy
  /** When viewing inside a folder */
  activeFolderId: string | null
}

const DEFAULT_SETTINGS: JourneySettings = {
  folders: [],
  courseFolderMap: {},
  viewType: "icon-lg",
  sortBy: "lastAccessed",
  activeFolderId: null,
}

export function normalizeSortBy(raw: string | undefined): JourneySortBy {
  const allowed: JourneySortBy[] = [
    "lastAccessed",
    "addedDate",
    "generated",
    "added",
    "title",
  ]
  if (raw && allowed.includes(raw as JourneySortBy)) return raw as JourneySortBy
  return "lastAccessed"
}

function settingsRef(userId: string) {
  return doc(db, "userJourneySettings", userId)
}

export async function getJourneySettings(userId: string): Promise<JourneySettings> {
  const snap = await getDoc(settingsRef(userId))
  if (!snap.exists()) return { ...DEFAULT_SETTINGS }
  const data = snap.data()
  return {
    folders: (data.folders as JourneyFolder[]) ?? [],
    courseFolderMap: (data.courseFolderMap as Record<string, string>) ?? {},
    viewType: normalizeViewType(data.viewType as string),
    sortBy: normalizeSortBy(data.sortBy as string),
    activeFolderId: data.activeFolderId ?? null,
  }
}

export async function saveJourneySettings(
  userId: string,
  settings: Partial<JourneySettings>
): Promise<void> {
  const ref = settingsRef(userId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      ...DEFAULT_SETTINGS,
      ...settings,
      updatedAt: serverTimestamp(),
    })
  } else {
    await updateDoc(ref, {
      ...settings,
      updatedAt: serverTimestamp(),
    })
  }
}

export async function createJourneyFolder(
  userId: string,
  name: string
): Promise<JourneyFolder> {
  const settings = await getJourneySettings(userId)
  const folder: JourneyFolder = {
    id: `folder_${Date.now()}`,
    name: name.trim() || "New Folder",
    courseIds: [],
    createdAt: Date.now(),
  }
  await saveJourneySettings(userId, {
    folders: [...settings.folders, folder],
  })
  return folder
}

export async function renameJourneyFolder(
  userId: string,
  folderId: string,
  name: string
): Promise<void> {
  const settings = await getJourneySettings(userId)
  await saveJourneySettings(userId, {
    folders: settings.folders.map((f) =>
      f.id === folderId ? { ...f, name: name.trim() || f.name } : f
    ),
  })
}

export async function deleteJourneyFolder(userId: string, folderId: string): Promise<void> {
  const settings = await getJourneySettings(userId)
  const newMap = { ...settings.courseFolderMap }
  for (const [courseId, fid] of Object.entries(newMap)) {
    if (fid === folderId) delete newMap[courseId]
  }
  await saveJourneySettings(userId, {
    folders: settings.folders.filter((f) => f.id !== folderId),
    courseFolderMap: newMap,
    activeFolderId: settings.activeFolderId === folderId ? null : settings.activeFolderId,
  })
}

export async function moveCourseToFolder(
  userId: string,
  courseId: string,
  folderId: string | null
): Promise<void> {
  const settings = await getJourneySettings(userId)
  const newMap = { ...settings.courseFolderMap }
  const folders = settings.folders.map((f) => ({
    ...f,
    courseIds: f.courseIds.filter((id) => id !== courseId),
  }))

  if (folderId) {
    newMap[courseId] = folderId
    const folderIdx = folders.findIndex((f) => f.id === folderId)
    if (folderIdx >= 0) {
      folders[folderIdx] = {
        ...folders[folderIdx],
        courseIds: [...folders[folderIdx].courseIds, courseId],
      }
    }
  } else {
    delete newMap[courseId]
  }

  await saveJourneySettings(userId, { folders, courseFolderMap: newMap })
}

export async function setJourneyViewType(
  userId: string,
  viewType: JourneyViewType
): Promise<void> {
  await saveJourneySettings(userId, { viewType })
}

export async function setJourneySortBy(
  userId: string,
  sortBy: JourneySortBy
): Promise<void> {
  await saveJourneySettings(userId, { sortBy })
}

export async function setActiveFolder(
  userId: string,
  folderId: string | null
): Promise<void> {
  await saveJourneySettings(userId, { activeFolderId: folderId })
}

/** Courses visible at current folder level (root = not in any folder) */
export function getVisibleCourses(
  courses: CourseWithProgress[],
  settings: JourneySettings
): CourseWithProgress[] {
  const activeFolderId = settings.activeFolderId
  if (!activeFolderId) {
    return courses.filter((c) => !settings.courseFolderMap[c.id])
  }
  const folder = settings.folders.find((f) => f.id === activeFolderId)
  if (!folder) return courses
  return courses.filter((c) => folder.courseIds.includes(c.id))
}

export function getNextLevelLimits(currentLevel: number): {
  maxGenerated: number
  maxAdded: number
} {
  return getCourseLimitsForLevel(currentLevel + 1)
}
