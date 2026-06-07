"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ArrowLeft, FileQuestion } from "lucide-react"
import SidebarNav from "@/components/sidebar-nav"

interface QuizPreparingViewProps {
  title: string
  subtitle?: string
  error?: string | null
  backHref: string
}

export function QuizPreparingView({
  title,
  subtitle = "Generating your questions…",
  error,
  backHref,
}: QuizPreparingViewProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/journey" />
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4 text-center">
            {error ? (
              <FileQuestion className="h-10 w-10 mx-auto text-destructive" />
            ) : (
              <Spinner className="h-10 w-10 mx-auto" />
            )}
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">
                {error ?? subtitle}
              </p>
              {!error && (
                <p className="text-xs text-muted-foreground pt-1">
                  Feel free to browse elsewhere — you&apos;ll get a notification when it&apos;s ready.
                </p>
              )}
            </div>
            <Button variant="outline" asChild className="w-full">
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to journey
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
