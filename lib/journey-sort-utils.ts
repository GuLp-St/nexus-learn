import type { CourseWithProgress } from "./course-utils"
import type { JourneySortBy } from "./journey-settings-utils"

function timestampMs(value: unknown): number {
  if (!value) return 0
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis()
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime()
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  return 0
}

export function sortJourneyCourses(
  courses: CourseWithProgress[],
  sortBy: JourneySortBy
): CourseWithProgress[] {
  const sorted = [...courses]

  sorted.sort((a, b) => {
    const progA = a.userProgress
    const progB = b.userProgress

    switch (sortBy) {
      case "generated": {
        const aGen = progA?.isOwnCourse === true ? 0 : 1
        const bGen = progB?.isOwnCourse === true ? 0 : 1
        if (aGen !== bGen) return aGen - bGen
        return a.title.localeCompare(b.title)
      }
      case "added": {
        const aAdd = progA?.isOwnCourse === false ? 0 : 1
        const bAdd = progB?.isOwnCourse === false ? 0 : 1
        if (aAdd !== bAdd) return aAdd - bAdd
        return a.title.localeCompare(b.title)
      }
      case "addedDate":
        return timestampMs(progB?.createdAt) - timestampMs(progA?.createdAt)
      case "lastAccessed":
        return timestampMs(progB?.lastAccessed) - timestampMs(progA?.lastAccessed)
      case "title":
      default:
        return a.title.localeCompare(b.title)
    }
  })

  return sorted
}
