"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Search, X, AlertCircle, Sparkles, Upload, Image as ImageIcon, Move, ZoomIn } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "./ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UploadButton } from "@/lib/uploadthing"
import { generateAndUploadImage, deleteFileFromUploadthing, uploadGeneratedImage, generateAIImageAction } from "@/lib/upload-actions"

interface UniversalImagePickerProps {
  value: string
  imageKey?: string
  initialKey?: string // The key already saved in the database
  onChange: (url: string, key?: string, config?: { fit: "cover" | "contain", position: { x: number, y: number }, scale: number }) => void
  onDelete?: (key: string) => void
  routeSlug?: "courseImage" | "avatarImage"
  allowedModes?: ("unsplash" | "ai" | "upload")[]
  isCircular?: boolean
  initialObjectFit?: "cover" | "contain"
  initialPosition?: { x: number; y: number }
  initialScale?: number
  hidePreview?: boolean
}

const ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY

const AI_MODELS = [
  { id: "black-forest-labs/FLUX.1-dev", name: "Flux Dev (High Quality)" },
  { id: "black-forest-labs/FLUX.1-schnell", name: "Flux Schnell (Fast)" },
  { id: "stabilityai/stable-diffusion-xl-base-1.0", name: "Stable Diffusion XL" },
]

export function UniversalImagePicker({ 
  value, 
  imageKey, 
  initialKey,
  onChange, 
  onDelete,
  routeSlug = "courseImage",
  allowedModes = ["unsplash", "ai", "upload"],
  isCircular = false,
  initialObjectFit = "cover",
  initialPosition = { x: 50, y: 50 },
  initialScale = 1,
  hidePreview = false
}: UniversalImagePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(value)
  const [selectedKey, setSelectedKey] = useState(imageKey)
  
  // Fit/Position state
  const [objectFit, setObjectFit] = useState<"cover" | "contain">(initialObjectFit)
  const [position, setPosition] = useState(initialPosition)
  const [scale, setScale] = useState(initialScale)

  // Track the most recently generated/uploaded key during THIS session
  // to avoid deleting the "active" one when switching, but still cleanup intermediate ones.
  const lastGeneratedKeyRef = useRef<string | undefined>(undefined)

  // Sync internal state with props
  useEffect(() => {
    setSelectedUrl(value || "")
  }, [value])

  useEffect(() => {
    setSelectedKey(imageKey)
  }, [imageKey])

  // Only notify parent when fit/position changes if we have a URL
  useEffect(() => {
    if (selectedUrl && (objectFit !== initialObjectFit || position.x !== initialPosition.x || position.y !== initialPosition.y || scale !== initialScale)) {
      onChange(selectedUrl, selectedKey, { fit: objectFit, position, scale })
    }
  }, [objectFit, position, scale])
  
  // Default to first allowed mode
  const defaultTab = allowedModes.length > 0 ? allowedModes[0] : "unsplash"
  
  // Unsplash state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [unsplashLoading, setUnsplashLoading] = useState(false)
  const [unsplashError, setUnsplashError] = useState<string | null>(null)

  // AI state
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id)
  const [tempAiUrl, setTempAiUrl] = useState<string | null>(null)

  // Upload state
  const [tempUploadFile, setTempUploadFile] = useState<File | null>(null)
  const [tempUploadUrl, setTempUploadUrl] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const fetchUnsplashImages = async (query: string = "") => {
    if (!ACCESS_KEY) {
      setUnsplashError("Unsplash Access Key is missing.")
      return
    }

    setUnsplashLoading(true)
    setUnsplashError(null)
    try {
      const endpoint = query 
        ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`
        : `https://api.unsplash.com/photos?per_page=12`
      
      const response = await fetch(endpoint, {
        headers: { Authorization: `Client-ID ${ACCESS_KEY}` }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.errors?.[0] || "Failed to fetch images from Unsplash")
      }
      
      const data = await response.json()
      const results = query ? data.results : data
      
      if (Array.isArray(results)) {
        setSearchResults(results.map((img: any) => img.urls.regular))
      } else {
        setSearchResults([])
      }
    } catch (err: any) {
      console.error("Error fetching images:", err)
      setUnsplashError(err.message || "Failed to load images.")
    } finally {
      setUnsplashLoading(false)
    }
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    
    setAiLoading(true)
    setAiError(null)
    try {
      // Use the server action instead of direct client-side call to avoid API key issues
      const base64Image = await generateAIImageAction(aiPrompt, selectedModel)
      if (!base64Image) throw new Error("Failed to generate image")
      
      setTempAiUrl(base64Image)
      // We'll convert base64 to blob only when confirming to save memory
    } catch (err: any) {
      console.error("Error generating AI image:", err)
      setAiError(err.message || "Failed to generate AI image.")
    } finally {
      setAiLoading(false)
    }
  }

  const handleConfirmAiImage = async () => {
    if (!tempAiUrl) return
    
    setAiLoading(true)
    try {
      // Convert base64 back to blob for uploading
      const response = await fetch(tempAiUrl)
      const blob = await response.blob()

      // Clean up previous AI image if it was generated in this session
      if (selectedKey && selectedKey !== initialKey) {
        await deleteFileFromUploadthing(selectedKey)
      }

      const result = await uploadGeneratedImage(blob, `ai-${Date.now()}.png`)
      lastGeneratedKeyRef.current = result.key
      handleSelectImage(result.url, result.key)
      
      // Clear temp state
      setTempAiUrl(null)
    } catch (err: any) {
      console.error("Error uploading AI image:", err)
      setAiError("Failed to save image. Please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  const handleFileSelect = (file: File) => {
    if (tempUploadUrl) URL.revokeObjectURL(tempUploadUrl)
    const url = URL.createObjectURL(file)
    setTempUploadFile(file)
    setTempUploadUrl(url)
  }

  const handleConfirmUpload = async () => {
    if (!tempUploadFile) return
    
    setUploadLoading(true)
    try {
      // Clean up previous image if it was generated/uploaded in this session
      if (selectedKey && selectedKey !== initialKey) {
        await deleteFileFromUploadthing(selectedKey)
      }

      // We need to use UTApi via server action or a custom upload logic.
      // Since UTApi is for server-side, and we have uploadGeneratedImage which takes a Blob,
      // we can reuse it.
      const result = await uploadGeneratedImage(tempUploadFile, tempUploadFile.name)
      lastGeneratedKeyRef.current = result.key
      handleSelectImage(result.url, result.key)
      
      setTempUploadFile(null)
      setTempUploadUrl(null)
    } catch (err: any) {
      console.error("Error uploading image:", err)
      alert("Failed to upload image.")
    } finally {
      setUploadLoading(false)
    }
  }

  const handleSelectImage = (url: string, key?: string) => {
    setSelectedUrl(url)
    setSelectedKey(key)
    onChange(url, key, { fit: objectFit, position, scale })
    setIsOpen(false)
  }

  const handleClear = async () => {
    if (selectedKey) {
      if (onDelete) {
        onDelete(selectedKey)
      } else {
        await deleteFileFromUploadthing(selectedKey)
      }
    }
    setSelectedUrl("")
    setSelectedKey(undefined)
    onChange("", undefined)
  }

  useEffect(() => {
    if (isOpen && searchResults.length === 0 && !unsplashLoading && !unsplashError) {
      fetchUnsplashImages("education")
    }
  }, [isOpen])

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (tempAiUrl) URL.revokeObjectURL(tempAiUrl)
      if (tempUploadUrl) URL.revokeObjectURL(tempUploadUrl)
    }
  }, [tempAiUrl, tempUploadUrl])

  return (
    <div className="space-y-2">
      {!hidePreview && (
        selectedUrl ? (
          <div className="relative group">
            <div className={`w-full h-48 overflow-hidden border bg-muted ${isCircular ? "rounded-full aspect-square max-w-[192px] mx-auto" : "rounded-md"}`}>
              <img
                src={selectedUrl}
                alt="Preview"
                className="w-full h-full"
                style={{ 
                  objectFit: objectFit,
                  transform: `scale(${scale}) translate(${position.x - 50}%, ${position.y - 50}%)`
                }}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className={`border-2 border-dashed p-8 text-center bg-muted/30 ${isCircular ? "rounded-full aspect-square max-w-[192px] mx-auto flex flex-col items-center justify-center" : "rounded-md"}`}>
            <ImageIcon className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-xs text-muted-foreground mb-2">No image selected</p>
          </div>
        )
      )}

      {selectedUrl && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-medium flex items-center gap-1.5">
                  <ZoomIn className="h-3 w-3" /> Zoom
                </Label>
                <span className="text-[10px] text-muted-foreground">{Math.round(scale * 100)}%</span>
              </div>
              <Slider 
                value={[scale * 100]} 
                min={50} 
                max={300} 
                step={1} 
                onValueChange={([val]) => setScale(val / 100)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-medium flex items-center gap-1.5">
                  <Move className="h-3 w-3" /> Horizontal
                </Label>
                <span className="text-[10px] text-muted-foreground">{position.x}%</span>
              </div>
              <Slider 
                value={[position.x]} 
                min={0} 
                max={100} 
                step={1} 
                onValueChange={([val]) => setPosition(prev => ({ ...prev, x: val }))}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-medium flex items-center gap-1.5">
                  <Move className="h-3 w-3" /> Vertical
                </Label>
                <span className="text-[10px] text-muted-foreground">{position.y}%</span>
              </div>
              <Slider 
                value={[position.y]} 
                min={0} 
                max={100} 
                step={1} 
                onValueChange={([val]) => setPosition(prev => ({ ...prev, y: val }))}
              />
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full h-11"
      >
        <ImageIcon className="h-4 w-4 mr-2" />
        {selectedUrl ? "Change Image" : "Choose Image"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Select Image</DialogTitle>
            <DialogDescription>
              Find, generate, or upload an image
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 border-b">
              <TabsList className={`grid w-full mb-4 ${
                allowedModes.length === 3 ? "grid-cols-3" : 
                allowedModes.length === 2 ? "grid-cols-2" : 
                "grid-cols-1"
              }`}>
                {allowedModes.includes("unsplash") && (
                  <TabsTrigger value="unsplash" className="gap-2">
                    <Search className="h-4 w-4" /> Find
                  </TabsTrigger>
                )}
                {allowedModes.includes("ai") && (
                  <TabsTrigger value="ai" className="gap-2">
                    <Sparkles className="h-4 w-4" /> Generate
                  </TabsTrigger>
                )}
                {allowedModes.includes("upload") && (
                  <TabsTrigger value="upload" className="gap-2">
                    <Upload className="h-4 w-4" /> Upload
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {allowedModes.includes("unsplash") && (
                <TabsContent value="unsplash" className="mt-0 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search Unsplash (e.g. 'coding', 'galaxy')..."
                      onKeyDown={(e) => e.key === "Enter" && fetchUnsplashImages(searchQuery)}
                    />
                    <Button onClick={() => fetchUnsplashImages(searchQuery)} disabled={unsplashLoading}>
                      {unsplashLoading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {unsplashError && <Alert variant="destructive"><AlertDescription>{unsplashError}</AlertDescription></Alert>}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {searchResults.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectImage(url)}
                        className="aspect-video rounded-md overflow-hidden border-2 hover:border-primary transition-all relative"
                      >
                        <img src={url} className="w-full h-full object-cover" loading="lazy" />
                        {selectedUrl === url && <div className="absolute inset-0 bg-primary/20 border-2 border-primary" />}
                      </button>
                    ))}
                  </div>
                </TabsContent>
              )}

              {allowedModes.includes("ai") && (
                <TabsContent value="ai" className="mt-0 space-y-6">
                  {!tempAiUrl ? (
                    <div className="space-y-4 max-w-lg mx-auto py-8">
                      <div className="space-y-2 text-center">
                        <Sparkles className="h-10 w-10 mx-auto text-primary" />
                        <h3 className="text-lg font-semibold">AI Image Generator</h3>
                        <p className="text-sm text-muted-foreground">
                          Describe the image you want to generate.
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_MODELS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="prompt">Prompt</Label>
                        <Input
                          id="prompt"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="e.g. A futuristic library in space, digital art style"
                        />
                      </div>
                      <Button 
                        className="w-full gap-2" 
                        onClick={handleAiGenerate} 
                        disabled={aiLoading || !aiPrompt.trim()}
                      >
                        {aiLoading ? (
                          <><Spinner className="h-4 w-4" /> Generating...</>
                        ) : (
                          <><Sparkles className="h-4 w-4" /> Generate Image</>
                        )}
                      </Button>
                      {aiError && <Alert variant="destructive"><AlertDescription>{aiError}</AlertDescription></Alert>}
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-md mx-auto py-4">
                      <div className="aspect-square w-full overflow-hidden rounded-lg border-2 shadow-inner bg-muted relative">
                        {aiLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 backdrop-blur-sm">
                            <Spinner className="h-8 w-8" />
                          </div>
                        )}
                        <img src={tempAiUrl} className="w-full h-full object-contain" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" onClick={handleAiGenerate} disabled={aiLoading}>
                          Generate Again
                        </Button>
                        <Button onClick={handleConfirmAiImage} disabled={aiLoading}>
                          Confirm & Save
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setTempAiUrl(null); }} className="w-full">
                        Back to Settings
                      </Button>
                    </div>
                  )}
                </TabsContent>
              )}

              {allowedModes.includes("upload") && (
                <TabsContent value="upload" className="mt-0 space-y-6">
                  {!tempUploadUrl ? (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg bg-muted/10 space-y-4">
                      <Upload className="h-10 w-10 text-muted-foreground opacity-50" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Upload from your computer</p>
                        <p className="text-xs text-muted-foreground">Max 4MB for courses, 2MB for avatars</p>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        id="avatar-file-upload" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                      />
                      <Button asChild>
                        <label htmlFor="avatar-file-upload" className="cursor-pointer">
                          Select File
                        </label>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-md mx-auto py-4">
                      <div className="aspect-square w-full overflow-hidden rounded-lg border-2 shadow-inner bg-muted">
                        <img src={tempUploadUrl} className="w-full h-full object-contain" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" asChild disabled={uploadLoading}>
                          <label htmlFor="avatar-file-upload" className="cursor-pointer text-center">
                            Reupload
                          </label>
                        </Button>
                        <Button onClick={handleConfirmUpload} disabled={uploadLoading}>
                          {uploadLoading ? <Spinner className="h-4 w-4" /> : "Confirm & Save"}
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setTempUploadUrl(null); setTempUploadFile(null); }} className="w-full">
                        Cancel
                      </Button>
                    </div>
                  )}
                </TabsContent>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
