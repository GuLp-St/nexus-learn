export type CreationCreditType = "upload" | "ai"

export interface CourseCreationCredits {
  upload: boolean
  ai: boolean
}

export function creditsFromUser(
  data: Record<string, unknown> | undefined
): CourseCreationCredits {
  const raw = data?.courseCreationCredits as Partial<CourseCreationCredits> | undefined
  return {
    upload: !!raw?.upload,
    ai: !!raw?.ai,
  }
}
