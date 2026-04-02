"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Upload, ArrowLeft, FileText, X, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingScreen } from "@/components/ui/LoadingScreen"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { processFile } from "@/lib/file-processor"
import { analyzeCourseFromFiles, CourseMaterialAnalysis, FileProcessedData } from "@/lib/gemini-upload"
import { generateCourseSkeleton } from "@/lib/gemini"
import { createOrGetCourse } from "@/lib/course-utils"
import { generateAndUploadImage, uploadCourseMaterialImagesBatch } from "@/lib/upload-actions"
import { db } from "@/lib/firebase"
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore"

type ProcessingState = "idle" | "extracting" | "analyzing" | "complete"

export default function UploadCoursePage() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [processingState, setProcessingState] = useState<ProcessingState>("idle")
  const [extractedData, setExtractedData] = useState<{ text: string; images: Array<{ index: number; base64: string }> } | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<CourseMaterialAnalysis | null>(null)
  const [sourceMaterialId, setSourceMaterialId] = useState<string | null>(null)
  const [materialImages, setMaterialImages] = useState<{ ufsUrl: string; key: string; index: number }[]>([])
  const [imageMap, setImageMap] = useState<{ [index: number]: string }>({}) // Index -> URL mapping
  const [extractedCount, setExtractedCount] = useState(0)
  const [analyzedCount, setAnalyzedCount] = useState(0)
  const [error, setError] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
    }
  }, [user, authLoading, router])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter((file) => {
      const name = file.name.toLowerCase()
      return name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".pptx")
    })

    if (validFiles.length !== files.length) {
      setError("Only PDF, DOCX, and PPTX files are supported")
      return
    }

    setUploadedFiles((prev) => [...prev, ...validFiles])
    setError("")
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProcessFiles = async () => {
    if (uploadedFiles.length === 0) {
      setError("Please select at least one file")
      return
    }

    if (!user) {
      router.push("/auth")
      return
    }

    setProcessingState("extracting")
    setExtractedCount(0)
    setAnalyzedCount(0)
    setError("")

    try {
      const fileData: FileProcessedData[] = []

      // Process each file
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i]
        try {
          const result = await processFile(file)
          fileData.push({
            fileName: file.name,
            text: result.text,
            images: result.images,
          })
          setExtractedCount(i + 1)
        } catch (err: any) {
          console.error(`Error processing ${file.name}:`, err)
          setError(`Failed to process ${file.name}: ${err.message}`)
          setProcessingState("idle")
          return
        }
      }

      // Upload all visuals from the materials to Uploadthing so they can be reused in lessons
      // Process in batches to avoid exceeding Server Action body size limits
      // Flatten images while preserving their indices
      const allImages: Array<{ index: number; base64: string }> = []
      fileData.forEach((file) => {
        file.images.forEach((img) => {
          allImages.push(img) // Images already have their indices from file processing
        })
      })

      // Create imageMap: Index -> URL mapping
      const imageMapLocal: { [index: number]: string } = {}
      let uploadedImages: { ufsUrl: string; key: string; index: number }[] = []
      
      if (allImages.length > 0) {
        const BATCH_SIZE = 1 // Upload 1 image per batch to avoid payload size issues (base64 can be very large)
        for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
          const batch = allImages.slice(i, i + BATCH_SIZE)
          const batchBase64 = batch.map(img => img.base64)
          try {
            const batchResults = await uploadCourseMaterialImagesBatch(batchBase64)
            // Map results back to original indices
            batchResults.forEach((result, batchIdx) => {
              const originalIndex = batch[batchIdx].index
              uploadedImages.push({
                ...result,
                index: originalIndex,
              })
              imageMapLocal[originalIndex] = result.ufsUrl
            })
          } catch (err: any) {
            console.error(`Error uploading batch ${i / BATCH_SIZE + 1}:`, err)
            // Continue with next batch even if one fails
          }
        }
      }
      setMaterialImages(uploadedImages)
      setImageMap(imageMapLocal)

      // Store combined text/images for reference/debugging
      const combinedText = fileData.map((f) => f.text).join("\n\n")
      setExtractedData({ text: combinedText.trim(), images: allImages })

      // Analyze each file separately, then aggregate with Gemini
      setProcessingState("analyzing")
      const analysis = await analyzeCourseFromFiles(fileData, (processed, total) => {
        setAnalyzedCount(processed)
      })
      setAiAnalysis(analysis)
      setProcessingState("complete")
    } catch (err: any) {
      console.error("Error processing files:", err)
      setError(err.message || "Failed to process files. Please try again.")
      setProcessingState("idle")
    }
  }

  const handleGenerateJourney = async () => {
    if (!aiAnalysis || !extractedData || !user) {
      return
    }

    setIsGenerating(true)
    setError("")

    try {
      // Merge Gemini visual descriptions with UploadThing URLs using imageIndex
      const processedImages = aiAnalysis.visualDescriptions
        .map((visualDesc) => {
          const url = imageMap[visualDesc.imageIndex]
          if (!url) {
            // Skip if URL not found for this index
            return null
          }
          return {
            url,
            description: visualDesc.description,
            tags: visualDesc.tags || [],
            imageIndex: visualDesc.imageIndex,
          }
        })
        .filter((img): img is NonNullable<typeof img> => img !== null)

      // Save analysis to Firestore
      const materialRef = doc(collection(db, "course_materials"))
      await setDoc(materialRef, {
        userId: user.uid,
        summary: aiAnalysis.summary,
        visualDescriptions: aiAnalysis.visualDescriptions, // Keep original for backward compatibility
        suggestedModules: aiAnalysis.suggestedModules,
        modules: aiAnalysis.modules || [], // Store detailed module/lesson structure
        extractedText: extractedData.text,
        imageCount: extractedData.images.length,
        imageUrls: materialImages.map((img) => img.ufsUrl), // Keep for backward compatibility
        imageKeys: materialImages.map((img) => img.key), // Keep for backward compatibility
        imageMap: imageMap, // Store Index -> URL mapping
        processedImages: processedImages, // New: Merged URLs + Descriptions + Tags
        createdAt: serverTimestamp(),
      })

      const materialId = materialRef.id
      setSourceMaterialId(materialId)

      // Determine course structure from AI suggestions
      // Use detailed modules structure if available, otherwise fall back to suggestedModules
      const moduleCount = (aiAnalysis.modules && aiAnalysis.modules.length > 0) 
        ? aiAnalysis.modules.length 
        : (aiAnalysis.suggestedModules.length || 3)
      const lessonsPerModule = (aiAnalysis.modules && aiAnalysis.modules.length > 0)
        ? aiAnalysis.modules.map(mod => mod.lessons ? mod.lessons.length : 3)
        : Array(moduleCount).fill(3) // Default to 3 lessons per module

      // Generate course skeleton using source material
      const courseData = await generateCourseSkeleton(
        aiAnalysis.summary.substring(0, 100), // Use first 100 chars as topic
        "intermediate", // Default difficulty
        moduleCount,
        lessonsPerModule,
        materialId
      )

      // Generate course image
      try {
        const prompt = `A high-quality, professional educational cover image for a course. Style: modern, clean, digital art. Topics: ${aiAnalysis.suggestedModules.slice(0, 3).join(", ")}`
        const result = await generateAndUploadImage(prompt)
        courseData.imageUrl = result.ufsUrl
        courseData.imageKey = result.key
      } catch (imageErr) {
        console.error("Error generating course image:", imageErr)
        courseData.imageUrl = "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=800"
      }

      // Create course
      const courseId = await createOrGetCourse(courseData, user.uid, materialId)
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
      <SidebarNav title="Upload Course Materials" />

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
              <h1 className="text-3xl font-bold tracking-tight">Upload Your Course Materials</h1>
              <p className="text-muted-foreground">
                Upload PDF, DOCX, or PPTX files to create a gamified course journey
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="p-4">
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* File Upload Section */}
            {processingState === "idle" && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Files</CardTitle>
                  <CardDescription>
                    Upload multiple files (PDF, DOCX, PPTX). Maximum 10 files, 10MB each.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <span className="text-primary font-medium">Click to upload</span> or drag and drop
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.pptx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      PDF, DOCX, PPTX up to 10MB each
                    </p>
                  </div>

                  {/* File List */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Selected Files ({uploadedFiles.length})</h3>
                      <div className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleProcessFiles}
                        className="w-full"
                        size="lg"
                        disabled={uploadedFiles.length === 0}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Process Files
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Processing States */}
            {processingState === "extracting" && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                  <h3 className="text-lg font-semibold mb-2">Extracting Content...</h3>
                  <p className="text-muted-foreground">
                    Processing file {Math.min(extractedCount + 1, uploadedFiles.length)} of {uploadedFiles.length}...
                  </p>
                </CardContent>
              </Card>
            )}

            {processingState === "analyzing" && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                  <h3 className="text-lg font-semibold mb-2">Analyzing with Gemini...</h3>
                  <p className="text-muted-foreground">
                    AI is analyzing file {Math.min(analyzedCount + 1, uploadedFiles.length)} of {uploadedFiles.length} and suggesting course structure...
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Review Section */}
            {processingState === "complete" && aiAnalysis && (
              <div className="space-y-6">
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle>AI Analysis Complete</CardTitle>
                    <CardDescription>
                      Review the suggested course structure
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Summary */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Summary</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {aiAnalysis.summary}
                      </p>
                    </div>

                    {/* Suggested Modules */}
                    {aiAnalysis.modules && aiAnalysis.modules.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Suggested Course Structure ({aiAnalysis.modules.length} modules)</h3>
                        <div className="space-y-4">
                          {aiAnalysis.modules.map((module, moduleIdx) => (
                            <div
                              key={moduleIdx}
                              className="p-4 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-8 w-8 rounded bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                  {moduleIdx + 1}
                                </div>
                                <p className="text-sm font-semibold">{module.title}</p>
                              </div>
                              {module.lessons && module.lessons.length > 0 && (
                                <div className="ml-11 space-y-2">
                                  {module.lessons.map((lesson, lessonIdx) => (
                                    <div key={lessonIdx} className="text-sm text-muted-foreground">
                                      <span className="font-medium">{lessonIdx + 1}. {lesson.title}</span>
                                      {lesson.keyPoints && lesson.keyPoints.length > 0 && (
                                        <span className="ml-2 text-xs">({lesson.keyPoints.length} key points)</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : aiAnalysis.suggestedModules.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Suggested Modules ({aiAnalysis.suggestedModules.length})</h3>
                        <div className="space-y-2">
                          {aiAnalysis.suggestedModules.map((module, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                            >
                              <div className="h-8 w-8 rounded bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                {idx + 1}
                              </div>
                              <p className="text-sm font-medium">{module}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Generate Button */}
                    <Button
                      onClick={handleGenerateJourney}
                      className="w-full"
                      size="lg"
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Spinner className="h-4 w-4 mr-2" />
                          Generating Course...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Journey
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
