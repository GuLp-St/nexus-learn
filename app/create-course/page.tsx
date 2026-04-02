"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, BookOpen, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { Spinner } from "@/components/ui/spinner"

export default function CreateCoursePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav title="Create Course" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Create Your Course</h1>
              <p className="text-muted-foreground">
                Choose how you'd like to create your learning journey
              </p>
            </div>

            {/* Three Option Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Option 1: Generate Your Course */}
              <Card className="flex flex-col transition-shadow hover:shadow-lg cursor-pointer group" onClick={() => router.push("/create-course/generate")}>
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Generate Your Course!</CardTitle>
                  <CardDescription>
                    Use AI to generate a custom course from any topic
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <Button className="w-full" variant="default">
                    Get Started
                  </Button>
                </CardContent>
              </Card>

              {/* Option 2: Find in Community Library */}
              <Card className="flex flex-col transition-shadow hover:shadow-lg cursor-pointer group" onClick={() => router.push("/create-course/library")}>
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Find in Community Library</CardTitle>
                  <CardDescription>
                    Browse and add courses created by the community
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <Button className="w-full" variant="outline">
                    Browse Library
                  </Button>
                </CardContent>
              </Card>

              {/* Option 3: Upload Your Own */}
              <Card className="flex flex-col transition-shadow hover:shadow-lg cursor-pointer group" onClick={() => router.push("/create-course/upload")}>
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Upload Your Own!</CardTitle>
                  <CardDescription>
                    Upload lecture notes (PDF, DOCX, PPTX) to create a course
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <Button className="w-full" variant="outline">
                    Upload Files
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
