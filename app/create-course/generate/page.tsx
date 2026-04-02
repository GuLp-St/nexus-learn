"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { analyzeTopicDifficulty, generateCourseSkeleton, TopicDifficultyAnalysis, DifficultyOption } from "@/lib/gemini"
import { createOrGetCourse } from "@/lib/course-utils"
import { generateAndUploadImage } from "@/lib/upload-actions"

export default function GenerateCoursePage() {
  const [courseInput, setCourseInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState("")
  const [difficultyAnalysis, setDifficultyAnalysis] = useState<TopicDifficultyAnalysis | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyOption | null>(null)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  const handleAnalyze = async () => {
    if (!courseInput.trim()) return
    if (!user) {
      router.push("/auth")
      return
    }

    setIsAnalyzing(true)
    setError("")
    setDifficultyAnalysis(null)
    setSelectedDifficulty(null)

    try {
      const analysis = await analyzeTopicDifficulty(courseInput.trim())
      
      if (analysis.errorMessage) {
        setError(analysis.errorMessage)
        return
      }

      setDifficultyAnalysis(analysis)
    } catch (err: any) {
      console.error("Error analyzing topic:", err)
      setError(err.message || "Failed to analyze topic. Please try again.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (!courseInput.trim()) return
    if (!user) {
      router.push("/auth")
      return
    }

    setIsGenerating(true)
    setError("")

    try {
      let courseData
      
      if (difficultyAnalysis && selectedDifficulty) {
        // Generate skeleton with selected difficulty
        courseData = await generateCourseSkeleton(
          courseInput.trim(),
          selectedDifficulty.level,
          selectedDifficulty.modules,
          selectedDifficulty.lessonsPerModule
        )
      } else if (difficultyAnalysis && !difficultyAnalysis.hasVariableDifficulty) {
        // Single difficulty option
        courseData = await generateCourseSkeleton(
          courseInput.trim(),
          difficultyAnalysis.difficulty || "beginner",
          difficultyAnalysis.modules || 3,
          difficultyAnalysis.lessonsPerModule || [2, 3, 2]
        )
      } else {
        // Fallback - should not happen if analyze was called first
        setError("Please analyze the topic first")
        setIsGenerating(false)
        return
      }

      // Automatically generate a relevant AI image
      try {
        const prompt = `A high-quality, professional educational cover image for a course titled "${courseData.title}". Style: modern, clean, digital art. Topics: ${courseData.tags?.join(", ")}`;
        const result = await generateAndUploadImage(prompt);
        courseData.imageUrl = result.ufsUrl;
        courseData.imageKey = result.key;
      } catch (imageErr) {
        console.error("Error generating course image:", imageErr);
        // Set a default fallback image if AI fails entirely
        courseData.imageUrl = "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800";
      }

      const courseId = await createOrGetCourse(courseData, user.uid)
      router.push(`/journey/${courseId}`)
    } catch (err: any) {
      console.error("Error generating course:", err)
      setError(err.message || "Failed to generate course. Please try again.")
      setIsGenerating(false)
    }
  }

  if (isGenerating) {
    return <LoadingScreen />
  }

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
      <SidebarNav title="Generate Course" />

      <main className="flex-1">
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Back Button */}
            <Button
              variant="ghost"
              onClick={() => router.push("/create-course")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Options
            </Button>

            {/* Header */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Generate Your Course</h1>
              <p className="text-muted-foreground">
                Enter a topic and let AI create a custom learning path for you
              </p>
            </div>

            {/* Generate Section */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">What would you like to learn?</h2>
                  <p className="text-muted-foreground">
                    Enter any topic and we'll create a structured course for you
                  </p>
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Biology, Python Programming, World History"
                    value={courseInput}
                    onChange={(e) => {
                      setCourseInput(e.target.value)
                      setError("")
                      setDifficultyAnalysis(null)
                      setSelectedDifficulty(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !difficultyAnalysis) {
                        handleAnalyze()
                      } else if (e.key === "Enter" && selectedDifficulty) {
                        handleGenerate()
                      }
                    }}
                    disabled={isGenerating || isAnalyzing}
                    className="flex-1"
                  />
                  {!difficultyAnalysis ? (
                    <Button
                      onClick={handleAnalyze}
                      disabled={!courseInput.trim() || isAnalyzing}
                      size="lg"
                      className="gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <Spinner className="h-4 w-4" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Analyze Topic
                        </>
                      )}
                    </Button>
                  ) : (
                  <Button
                    onClick={handleGenerate}
                      disabled={!selectedDifficulty || isGenerating}
                    size="lg"
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Course
                  </Button>
                  )}
                </div>

                {/* Difficulty Selection */}
                {difficultyAnalysis && (
                  <div className="space-y-4 pt-4 border-t">
                    {difficultyAnalysis.hasVariableDifficulty && difficultyAnalysis.options ? (
                      <>
                        <p className="text-sm font-medium">Select difficulty level:</p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {difficultyAnalysis.options.map((option, index) => (
                            <Card
                              key={index}
                              className={`cursor-pointer transition-all ${
                                selectedDifficulty?.level === option.level
                                  ? "border-primary bg-primary/5 shadow-md"
                                  : "hover:border-primary/50"
                              }`}
                              onClick={() => setSelectedDifficulty(option)}
                            >
                              <CardHeader className="pb-3">
                                <CardTitle className="text-lg capitalize">{option.level}</CardTitle>
                                <CardDescription className="line-clamp-2">{option.title}</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Modules:</span>
                                  <span className="font-medium">{option.modules}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Lessons:</span>
                                  <span className="font-medium">{option.lessonsPerModule.reduce((a, b) => a + b, 0)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">XP Multiplier:</span>
                                  <span className="font-medium">{option.xpMultiplier}x</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">Course Details:</p>
                        <Card className="border-primary/50 bg-primary/5">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg capitalize">{difficultyAnalysis.difficulty || "beginner"}</CardTitle>
                            <CardDescription>{difficultyAnalysis.title || courseInput}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Modules:</span>
                              <span className="font-medium">{difficultyAnalysis.modules || 3}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Lessons:</span>
                              <span className="font-medium">{(difficultyAnalysis.lessonsPerModule || []).reduce((a, b) => a + b, 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">XP Multiplier:</span>
                              <span className="font-medium">{difficultyAnalysis.xpMultiplier || 1.0}x</span>
                            </div>
                          </CardContent>
                        </Card>
                        <Button
                          onClick={() => {
                            if (difficultyAnalysis.difficulty && difficultyAnalysis.modules && difficultyAnalysis.lessonsPerModule) {
                              setSelectedDifficulty({
                                level: difficultyAnalysis.difficulty,
                                title: difficultyAnalysis.title || courseInput,
                                modules: difficultyAnalysis.modules,
                                lessonsPerModule: difficultyAnalysis.lessonsPerModule,
                                xpMultiplier: difficultyAnalysis.xpMultiplier || 1.0
                              })
                              handleGenerate()
                            }
                          }}
                          className="w-full"
                          size="lg"
                        >
                          Generate Course
                        </Button>
                      </>
                    )}
                </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
