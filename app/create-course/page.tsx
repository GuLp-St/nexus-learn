"use client"

import { Suspense } from "react"
import CreateCourseUnified from "@/components/create-course-unified"
import { Spinner } from "@/components/ui/spinner"

function CreateCourseFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export default function CreateCoursePage() {
  return (
    <Suspense fallback={<CreateCourseFallback />}>
      <CreateCourseUnified />
    </Suspense>
  )
}
