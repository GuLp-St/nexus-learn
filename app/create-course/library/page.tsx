import { redirect } from "next/navigation"

export default function LibraryRedirectPage() {
  redirect("/create-course?tab=browse")
}
