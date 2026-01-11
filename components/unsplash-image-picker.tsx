"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Search, X, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface UnsplashImagePickerProps {
  value: string
  onChange: (url: string) => void
}

const ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY

export function UnsplashImagePicker({ value, onChange }: UnsplashImagePickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(value)
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchImages = async (query: string = "") => {
    if (!ACCESS_KEY) {
      setError("Unsplash Access Key is missing. Please add NEXT_PUBLIC_UNSPLASH_ACCESS_KEY to your .env.local file.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Use search endpoint if query is provided, otherwise get editorial photos
      const endpoint = query 
        ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`
        : `https://api.unsplash.com/photos?per_page=12`
      
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Client-ID ${ACCESS_KEY}`
        }
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
      setError(err.message || "Failed to load images. Please check your API key.")
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      fetchImages(searchQuery)
    }
  }

  const handleSelectImage = (url: string) => {
    setSelectedUrl(url)
    onChange(url)
    setIsOpen(false)
  }

  const handleClear = () => {
    setSelectedUrl("")
    onChange("")
  }

  // Load initial images when dialog opens
  useEffect(() => {
    if (isOpen && searchResults.length === 0 && !loading && !error) {
      fetchImages("education") // Default search for education
    }
  }, [isOpen])

  return (
    <div className="space-y-2">
      {selectedUrl ? (
        <div className="relative group">
          <img
            src={selectedUrl}
            alt="Course preview"
            className="w-full h-48 object-cover rounded-md border"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-md p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">No image selected</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        <Search className="h-4 w-4 mr-2" />
        {selectedUrl ? "Change Image" : "Select Image from Unsplash"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Course Image</DialogTitle>
            <DialogDescription>
              Search high-quality images from Unsplash for your course
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSearch()
                  }
                }}
                placeholder="Search for images (e.g., 'programming', 'science', 'art')"
              />
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Image Grid */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">
                  {searchResults.map((url, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectImage(url)}
                      className="relative group aspect-video rounded-md overflow-hidden border-2 hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <img
                        src={url}
                        alt={`Unsplash result ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {selectedUrl === url && (
                        <div className="absolute inset-0 bg-primary/20 border-2 border-primary" />
                      )}
                    </button>
                  ))}
                </div>
              ) : !error && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No images found. Try a different search term.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
