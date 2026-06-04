import { redirect } from "next/navigation"

export default function GenerateCourseRedirectPage() {
  redirect("/create-course?mode=ai")
}
