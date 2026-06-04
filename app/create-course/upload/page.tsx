import { redirect } from "next/navigation"

export default function UploadCourseRedirectPage() {
  redirect("/create-course?mode=upload")
}
