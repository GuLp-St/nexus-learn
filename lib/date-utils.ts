import { Timestamp } from "firebase/firestore"
import { format, formatDistanceToNow, isSameDay } from "date-fns"

/**
 * UTC Date Utility Functions
 * 
 * All dates are stored in UTC and compared in UTC.
 * Display functions convert UTC to user's local timezone.
 */

/**
 * Get current UTC date as YYYY-MM-DD string
 */
export function getUTCDateString(): string {
  const now = new Date()
  return now.toISOString().split("T")[0]
}

/**
 * Get current UTC timestamp (milliseconds since epoch)
 */
export function getUTCTimestamp(): number {
  return Date.now()
}

/**
 * Check if two timestamps are on the same UTC day
 */
export function isSameUTCDay(timestamp1: Timestamp | Date | number, timestamp2: Timestamp | Date | number): boolean {
  const date1 = timestampToDate(timestamp1)
  const date2 = timestampToDate(timestamp2)
  
  // Compare UTC dates
  const utc1 = new Date(Date.UTC(
    date1.getUTCFullYear(),
    date1.getUTCMonth(),
    date1.getUTCDate()
  ))
  const utc2 = new Date(Date.UTC(
    date2.getUTCFullYear(),
    date2.getUTCMonth(),
    date2.getUTCDate()
  ))
  
  return utc1.getTime() === utc2.getTime()
}

/**
 * Format UTC timestamp for display in user's local timezone
 * @param timestamp Firestore Timestamp, Date, or number (milliseconds)
 * @param formatString Optional format string (default: "MMM d, yyyy 'at' h:mm a")
 */
export function formatDateForDisplay(
  timestamp: Timestamp | Date | number | undefined | null,
  formatString: string = "MMM d, yyyy 'at' h:mm a"
): string {
  if (!timestamp) return "Unknown date"
  
  try {
    const date = timestampToDate(timestamp)
    return format(date, formatString)
  } catch (error) {
    console.error("Error formatting date:", error)
    return "Invalid date"
  }
}

/**
 * Format UTC timestamp as relative time in user's local timezone
 * Examples: "2 minutes ago", "1 hour ago", "3 days ago"
 */
export function formatRelativeTime(timestamp: Timestamp | Date | number | undefined | null): string {
  if (!timestamp) return "Unknown time"
  
  try {
    const date = timestampToDate(timestamp)
    return formatDistanceToNow(date, { addSuffix: true })
  } catch (error) {
    console.error("Error formatting relative time:", error)
    return "Unknown time"
  }
}

/**
 * Get start of current UTC day as Date object
 */
export function getStartOfUTCDay(): Date {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ))
}

/**
 * Get end of current UTC day as Date object
 */
export function getEndOfUTCDay(): Date {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ))
}

/**
 * Convert Date to UTC YYYY-MM-DD string
 */
export function toUTCDateString(date: Date): string {
  return date.toISOString().split("T")[0]
}

/**
 * Convert UTC YYYY-MM-DD string to Date in user's local timezone
 * Note: This creates a date at midnight UTC, which will display as the previous day
 * in timezones behind UTC. For date-only comparisons, use UTC functions.
 */
export function fromUTCDateString(dateString: string): Date {
  return new Date(dateString + "T00:00:00.000Z")
}

/**
 * Helper to convert various timestamp types to Date
 */
function timestampToDate(timestamp: Timestamp | Date | number): Date {
  if (timestamp instanceof Date) {
    return timestamp
  }
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate()
  }
  // Assume it's a number (milliseconds)
  return new Date(timestamp)
}

/**
 * Check if a timestamp is today in UTC
 */
export function isTodayUTC(timestamp: Timestamp | Date | number | undefined | null): boolean {
  if (!timestamp) return false
  const todayUTC = getUTCDateString()
  const timestampUTC = toUTCDateString(timestampToDate(timestamp))
  return todayUTC === timestampUTC
}

/**
 * Get UTC date string from a timestamp
 */
export function getUTCDateStringFromTimestamp(timestamp: Timestamp | Date | number | undefined | null): string {
  if (!timestamp) return getUTCDateString()
  return toUTCDateString(timestampToDate(timestamp))
}

