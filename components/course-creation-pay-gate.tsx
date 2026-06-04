"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { COURSE_GENERATION_NEXON_COST } from "@/lib/course-constants"

export function CourseCreationPayGate({
  title,
  description,
  error,
  paying,
  onPay,
}: {
  title: string
  description: string
  error?: string
  paying: boolean
  onPay: () => void
}) {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive rounded-md bg-destructive/10 border border-destructive/20 p-3">
            {error}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          One-time fee for this course attempt. If you leave before finishing, you won&apos;t be
          charged again until your course is successfully generated.
        </p>
        <Button onClick={onPay} disabled={paying} size="lg" className="w-full sm:w-auto">
          {paying ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Processing payment…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Pay &amp; continue
              <NexonIcon className="h-4 w-4 ml-2" />
              {COURSE_GENERATION_NEXON_COST}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
