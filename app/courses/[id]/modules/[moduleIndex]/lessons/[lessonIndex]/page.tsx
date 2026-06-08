import { redirect } from "next/navigation"

/** Legacy URL — lessons live under /journey/{id}/modules/... */
export default async function LegacyCourseLessonRedirect({
  params,
}: {
  params: Promise<{ id: string; moduleIndex: string; lessonIndex: string }>
}) {
  const { id, moduleIndex, lessonIndex } = await params
  redirect(`/journey/${id}/modules/${moduleIndex}/lessons/${lessonIndex}`)
}
