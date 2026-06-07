"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Sparkles,
  Upload,
  BookOpen,
  FileText,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { Spinner } from "@/components/ui/spinner"
import { ProcessingSpinner } from "@/components/ui/processing-spinner"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { COURSE_GENERATION_NEXON_COST } from "@/lib/course-constants"
import {
  getCourseCreationCredits,
  purchaseAiCreationCredit,
  purchaseUploadCreationCredit,
  type CourseCreationCredits,
  type CreationCreditType,
} from "@/lib/course-creation-credit-actions"
import {
  type CourseDifficulty,
  DIFFICULTY_STRUCTURE,
} from "@/lib/difficulty-structure"
import {
  type DifficultyOption,
  type TopicDifficultyAnalysis,
} from "@/lib/gemini"
import { CommunityLibraryPanel } from "@/components/community-library-panel"
import { cn } from "@/lib/utils"
import {
  cancelCourseCreationJob,
  startCourseCreationJob,
} from "@/lib/course-creation-job-actions"
import type { CourseCreationJob } from "@/lib/course-creation-job"
import { db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { usePageContext } from "@/hooks/usePageContext"

type CreateMode = "ai" | "upload"
type MainTab = "create" | "browse"
type WorkflowPhase = "idle" | "working" | "pick-difficulty"

export default function CreateCourseUnified() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const initialTab = searchParams.get("tab") === "browse" ? "browse" : "create"
  const initialMode: CreateMode =
    searchParams.get("mode") === "upload" ? "upload" : "ai"

  const [mainTab, setMainTab] = useState<MainTab>(initialTab)
  const [createMode, setCreateMode] = useState<CreateMode>(initialMode)
  const [credits, setCredits] = useState<CourseCreationCredits>({ upload: false, ai: false })
  const [creditsLoading, setCreditsLoading] = useState(true)
  const [paying, setPaying] = useState<CreationCreditType | null>(null)
  const [error, setError] = useState("")

  const [phase, setPhase] = useState<WorkflowPhase>("idle")
  const [progressDetail, setProgressDetail] = useState("")

  const [courseInput, setCourseInput] = useState("")
  const [difficultyAnalysis, setDifficultyAnalysis] =
    useState<TopicDifficultyAnalysis | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<DifficultyOption | null>(null)

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadDifficulty, setUploadDifficulty] = useState<CourseDifficulty>("intermediate")
  const [toneInstruction, setToneInstruction] = useState("")
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  usePageContext({
    title: "Create Course",
    description:
      mainTab === "browse"
        ? "The user is browsing the community course library to add existing courses to their journey."
        : createMode === "upload"
          ? "The user is on the upload tab. They can upload PDF, DOCX, or PPTX files to auto-generate a full course journey. Requires a paid upload creation credit."
          : phase === "working"
            ? "The user is waiting for a course to be generated. The pipeline is running — help them understand progress or troubleshoot if stuck."
            : phase === "pick-difficulty"
              ? "The user chose an AI topic with multiple difficulty paths and is picking which one to use."
              : "The user is on the AI topic tab. They enter a subject and the app analyzes it to build a full course journey. Requires a paid AI creation credit.",
    pageData: {
      pageType: "create-course",
      mainTab,
      createMode,
      phase,
      hasAiCredit: credits.ai,
      hasUploadCredit: credits.upload,
      uploadedFileCount: uploadedFiles.length,
      uploadDifficulty,
      ...(activeJobId ? { activeJobId } : {}),
      ...(progressDetail ? { progressDetail } : {}),
      ...(error ? { lastError: error } : {}),
    },
    suggestedChips:
      mainTab === "browse"
        ? ["How do I add a course?", "What's in the library?"]
        : createMode === "upload"
          ? ["What file types can I upload?", "How long does upload take?"]
          : ["How does AI creation work?", "What topics work best?"],
  })

  const refreshCredits = useCallback(async () => {
    if (!user) return
    const c = await getCourseCreationCredits(user.uid)
    setCredits(c)
  }, [user])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const tab = searchParams.get("tab")
    const mode = searchParams.get("mode")
    const topic = searchParams.get("topic")
    if (tab === "browse") setMainTab("browse")
    if (mode === "upload") setCreateMode("upload")
    if (mode === "ai") setCreateMode("ai")
    if (topic) {
      setCourseInput(decodeURIComponent(topic))
      setMainTab("create")
      setCreateMode("ai")
    }
  }, [searchParams])

  useEffect(() => {
    if (!user || authLoading) return
    let cancelled = false
    ;(async () => {
      setCreditsLoading(true)
      try {
        const c = await getCourseCreationCredits(user.uid)
        if (!cancelled) setCredits(c)
      } finally {
        if (!cancelled) setCreditsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const hasCreditForMode = (mode: CreateMode) =>
    mode === "ai" ? credits.ai : credits.upload

  const handlePay = async (type: CreationCreditType) => {
    if (!user) return
    setPaying(type)
    setError("")
    try {
      const result =
        type === "ai"
          ? await purchaseAiCreationCredit(user.uid)
          : await purchaseUploadCreationCredit(user.uid)
      if (!result.ok) {
        setError(result.error || "Payment failed")
        return
      }
      await refreshCredits()
    } finally {
      setPaying(null)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ""
  }

  const addFiles = (files: File[]) => {
    const valid = files.filter((f) => {
      const n = f.name.toLowerCase()
      return n.endsWith(".pdf") || n.endsWith(".docx") || n.endsWith(".pptx")
    })
    if (valid.length !== files.length) {
      setError("Only PDF, DOCX, and PPTX files are supported")
      return
    }
    const oversized = valid.filter((f) => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) {
      setError(`${oversized[0].name} exceeds 10MB limit`)
      return
    }
    setUploadedFiles((prev) => {
      const combined = [...prev, ...valid]
      return combined.slice(0, 10)
    })
    setError("")
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (hasCreditForMode("upload")) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (!hasCreditForMode("upload")) return
    addFiles(Array.from(e.dataTransfer.files))
  }

  const applyJobSnapshot = useCallback(
    (job: CourseCreationJob) => {
      if (job.status === "running" || job.status === "pending") {
        setPhase("working")
        setProgressDetail(job.detail || "Working…")
      }
      if (job.status === "completed" && job.courseId) {
        router.push(`/journey/${job.courseId}`)
      }
      if (job.status === "failed") {
        setError(job.error || "Course creation failed")
        setPhase("idle")
        setActiveJobId(null)
      }
    },
    [router]
  )

  useEffect(() => {
    if (!user || !activeJobId) return
    const unsub = onSnapshot(doc(db, "courseCreationJobs", activeJobId), (snap) => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() } as CourseCreationJob
      if (data.userId !== user.uid) return
      applyJobSnapshot(data)
    })
    return () => unsub()
  }, [user, activeJobId, applyJobSnapshot])

  useEffect(() => {
    if (!user || authLoading) return
    import("@/lib/course-creation-job-actions").then(({ fetchActiveCourseCreationJob }) => {
      fetchActiveCourseCreationJob(user.uid)
        .then((job) => {
          if (job?.status === "running") {
            setActiveJobId(job.id)
            setPhase("working")
            setProgressDetail(job.detail || "Resuming…")
            setCreateMode(job.type)
            setMainTab("create")
          }
        })
        .catch((err) => {
          console.error("Failed to resume active creation job:", err)
        })
    })
  }, [user, authLoading])

  const handleCancelJob = async () => {
    setCancelling(true)
    setError("")
    try {
      if (user && activeJobId) {
        await cancelCourseCreationJob(activeJobId, user.uid)
      }
    } catch (err) {
      console.error("Failed to cancel creation job:", err)
    } finally {
      setPhase("idle")
      setActiveJobId(null)
      setProgressDetail("")
      setCancelling(false)
    }
  }

  const runAiFlow = async (difficulty?: DifficultyOption | null) => {
    if (!user || !courseInput.trim()) return
    setPhase("working")
    setError("")
    setProgressDetail("Starting…")

    try {
      const start = await startCourseCreationJob(user.uid, "ai", {
        topic: courseInput.trim(),
        difficultyJson: difficulty
          ? JSON.stringify(difficulty)
          : selectedDifficulty
            ? JSON.stringify(selectedDifficulty)
            : undefined,
      })
      if (!start.ok || !start.jobId) {
        throw new Error(start.error || "Failed to start job")
      }
      setActiveJobId(start.jobId)

      const idToken = await user.getIdToken()
      const res = await fetch("/api/course-creation/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId: user.uid,
          jobId: start.jobId,
          topic: courseInput.trim(),
          difficulty: difficulty ?? selectedDifficulty,
          difficultyAnalysis,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || "AI course creation failed")
      }
      if (payload.courseId) {
        router.push(`/journey/${payload.courseId}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create course")
      setPhase("idle")
      setActiveJobId(null)
    }
  }

  const handleCreateAi = async () => {
    if (!user || !courseInput.trim()) return
    if (!hasCreditForMode("ai")) {
      setError("Pay the creation fee to continue with AI generation.")
      return
    }

    setError("")
    setDifficultyAnalysis(null)
    setSelectedDifficulty(null)
    setPhase("working")
    setProgressDetail("Analyzing your topic…")

    try {
      const { analyzeTopicDifficulty } = await import("@/lib/gemini")
      const analysis = await analyzeTopicDifficulty(courseInput.trim())
      if (analysis.errorMessage) {
        setError(analysis.errorMessage)
        setPhase("idle")
        return
      }
      setDifficultyAnalysis(analysis)

      if (analysis.hasVariableDifficulty && analysis.options?.length) {
        setPhase("pick-difficulty")
        return
      }

      await runAiFlow({
        level: analysis.difficulty || "beginner",
        title: analysis.title || courseInput,
        modules: analysis.modules || 3,
        lessonsPerModule: analysis.lessonsPerModule || [2, 3, 2],
        xpMultiplier: analysis.xpMultiplier || 1,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to analyze topic")
      setPhase("idle")
    }
  }

  const handleCreateUpload = async () => {
    if (!user || uploadedFiles.length === 0) return
    if (!hasCreditForMode("upload")) {
      setError("Pay the creation fee to continue with upload.")
      return
    }

    setPhase("working")
    setError("")
    setProgressDetail("Starting…")

    try {
      const start = await startCourseCreationJob(user.uid, "upload", {
        difficulty: uploadDifficulty,
        toneInstruction,
      })
      if (!start.ok || !start.jobId) {
        throw new Error(start.error || "Failed to start job")
      }
      setActiveJobId(start.jobId)

      const { uploadCourseMaterialFiles } = await import(
        "@/lib/course-material-file-upload-client"
      )
      const uploadedRefs = await uploadCourseMaterialFiles(uploadedFiles, setProgressDetail)

      setProgressDetail("Processing your materials…")

      const idToken = await user.getIdToken()
      const res = await fetch("/api/course-creation/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          jobId: start.jobId,
          difficulty: uploadDifficulty,
          toneInstruction,
          files: uploadedRefs,
        }),
      })
      const rawText = await res.text()
      let payload: { error?: string; courseId?: string } = {}
      try {
        payload = rawText ? JSON.parse(rawText) : {}
      } catch {
        payload = {}
      }
      if (!res.ok) {
        throw new Error(
          payload.error ||
            (rawText && rawText.length < 200 ? rawText : null) ||
            `Upload course creation failed (${res.status})`
        )
      }
      if (payload.courseId) {
        router.push(`/journey/${payload.courseId}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create course from upload")
      setPhase("idle")
      setActiveJobId(null)
    }
  }

  if (authLoading || creditsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!user) return null

  const isWorking = phase === "working"
  const uploadPreset = DIFFICULTY_STRUCTURE[uploadDifficulty]

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav title="Create Course" />

      <main className="flex-1 min-w-0">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create Your Course</h1>
              <p className="text-muted-foreground">
                Generate from a topic, upload your materials, or browse the community library — all
                in one place.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {isWorking && (
              <Card>
                <CardContent className="p-8 text-center space-y-4">
                  <ProcessingSpinner className="mx-auto" />
                  <h3 className="text-lg font-semibold">Building your journey…</h3>
                  <p className="text-sm text-muted-foreground">{progressDetail}</p>
                  <p className="text-xs text-muted-foreground">
                    Please keep this tab open until your course is ready.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelJob}
                    disabled={cancelling}
                  >
                    {cancelling ? "Cancelling…" : "Cancel and go back"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isWorking && (
              <Tabs
                value={mainTab}
                onValueChange={(v) => setMainTab(v as MainTab)}
                className="space-y-6"
              >
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="create" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Create
                  </TabsTrigger>
                  <TabsTrigger value="browse" className="gap-2">
                    <BookOpen className="h-4 w-4" />
                    Browse Library
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-6 mt-0">
                  <div className="flex gap-2 p-1 rounded-lg bg-muted/50 w-full max-w-md">
                    <Button
                      type="button"
                      variant={createMode === "ai" ? "default" : "ghost"}
                      className="flex-1 gap-2"
                      onClick={() => {
                        setCreateMode("ai")
                        setError("")
                      }}
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Topic
                    </Button>
                    <Button
                      type="button"
                      variant={createMode === "upload" ? "default" : "ghost"}
                      className="flex-1 gap-2"
                      onClick={() => {
                        setCreateMode("upload")
                        setError("")
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      Upload Files
                    </Button>
                  </div>

                  {!hasCreditForMode(createMode) && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Creation fee required</CardTitle>
                        <CardDescription>
                          One-time {COURSE_GENERATION_NEXON_COST} Nexon per{" "}
                          {createMode === "ai" ? "AI" : "upload"} course. You won&apos;t be charged
                          again until a journey is successfully created.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => handlePay(createMode)}
                          disabled={paying === createMode}
                          size="lg"
                        >
                          {paying === createMode ? (
                            <>
                              <Spinner className="h-4 w-4 mr-2" />
                              Processing…
                            </>
                          ) : (
                            <>
                              Pay &amp; unlock
                              <NexonIcon className="h-4 w-4 ml-2" />
                              {COURSE_GENERATION_NEXON_COST}
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {createMode === "ai" && phase === "pick-difficulty" && difficultyAnalysis?.options && (
                    <Card className="border-primary/30">
                      <CardHeader>
                        <CardTitle>Choose difficulty</CardTitle>
                        <CardDescription>
                          Your topic supports multiple paths — pick one to continue.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          {difficultyAnalysis.options.map((option, index) => (
                            <Card
                              key={index}
                              className={cn(
                                "cursor-pointer transition-all",
                                selectedDifficulty?.level === option.level
                                  ? "border-primary bg-primary/5 shadow-md"
                                  : "hover:border-primary/50"
                              )}
                              onClick={() => setSelectedDifficulty(option)}
                            >
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base capitalize">{option.level}</CardTitle>
                                <CardDescription className="text-xs line-clamp-2">
                                  {option.title}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="text-xs text-muted-foreground">
                                {option.modules} modules ·{" "}
                                {option.lessonsPerModule.reduce((a, b) => a + b, 0)} lessons
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        <Button
                          className="w-full"
                          size="lg"
                          disabled={!selectedDifficulty}
                          onClick={() => selectedDifficulty && runAiFlow(selectedDifficulty)}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Continue — Create Journey
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {createMode === "ai" && phase !== "pick-difficulty" && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Generate from topic</CardTitle>
                        <CardDescription>
                          Enter a subject — we analyze it and build your full journey automatically.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Input
                          placeholder="e.g., Biology, Python, World History…"
                          value={courseInput}
                          onChange={(e) => {
                            setCourseInput(e.target.value)
                            setError("")
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateAi()
                          }}
                          disabled={!hasCreditForMode("ai")}
                        />
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleCreateAi}
                          disabled={!courseInput.trim() || !hasCreditForMode("ai")}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Create Journey
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {createMode === "upload" && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Upload your materials</CardTitle>
                        <CardDescription>
                          PDF, DOCX, or PPTX — we extract, analyze, and create your journey in one
                          step (no outline review).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div
                          className={cn(
                            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                            isDragOver
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/25",
                            !hasCreditForMode("upload") && "opacity-50 cursor-not-allowed"
                          )}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                          <label
                            htmlFor="unified-file-upload"
                            className={cn(
                              "cursor-pointer text-primary font-medium",
                              !hasCreditForMode("upload") && "pointer-events-none"
                            )}
                          >
                            {isDragOver ? "Drop files here" : "Drag & drop or click to upload"}
                          </label>
                          <input
                            id="unified-file-upload"
                            type="file"
                            multiple
                            accept=".pdf,.docx,.pptx"
                            onChange={handleFileSelect}
                            className="hidden"
                            disabled={!hasCreditForMode("upload")}
                          />
                          <p className="text-xs text-muted-foreground mt-2">Up to 10MB per file</p>
                        </div>

                        {uploadedFiles.length > 0 && (
                          <div className="space-y-2">
                            {uploadedFiles.map((file, index) => (
                              <div
                                key={`${file.name}-${index}`}
                                className="flex items-center justify-between p-3 rounded-lg border"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="text-sm truncate">{file.name}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 shrink-0"
                                  onClick={() =>
                                    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Tone (optional)</Label>
                            <Textarea
                              placeholder={'e.g. "Explain like I\'m 5" or exam-prep style'}
                              value={toneInstruction}
                              onChange={(e) => setToneInstruction(e.target.value)}
                              rows={2}
                              className="text-sm"
                              disabled={!hasCreditForMode("upload")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Difficulty</Label>
                            <Select
                              value={uploadDifficulty}
                              onValueChange={(v) => setUploadDifficulty(v as CourseDifficulty)}
                              disabled={!hasCreditForMode("upload")}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="beginner">Beginner</SelectItem>
                                <SelectItem value="intermediate">Intermediate</SelectItem>
                                <SelectItem value="expert">Expert</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {uploadPreset.modules} modules,{" "}
                              {uploadPreset.lessonsPerModule.reduce((a, b) => a + b, 0)} lessons
                            </p>
                          </div>
                        </div>

                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleCreateUpload}
                          disabled={
                            uploadedFiles.length === 0 || !hasCreditForMode("upload")
                          }
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Create Journey
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="browse" className="mt-0">
                  <CommunityLibraryPanel />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
