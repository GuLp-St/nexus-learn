"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface UnsplashImagePickerProps {
  value: string
  onChange: (url: string) => void
}

// Using Unsplash Source API (no API key needed for basic usage)
const UNSPLASH_SOURCE_URL = "https://source.unsplash.com"

export function UnsplashImagePicker({ value, onChange }: UnsplashImagePickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(value)
  const [searchResults, setSearchResults] = useState<string[]>([])

  // Generate placeholder image URLs based on search query
  const generateImageUrls = (query: string): string[] => {
    if (!query.trim()) {
      // Default images if no search
      return [
        `${UNSPLASH_SOURCE_URL}/800x450/?education`,
        `${UNSPLASH_SOURCE_URL}/800x450/?learning`,
        `${UNSPLASH_SOURCE_URL}/800x450/?study`,
        `${UNSPLASH_SOURCE_URL}/800x450/?books`,
        `${UNSPLASH_SOURCE_URL}/800x450/?knowledge`,
        `${UNSPLASH_SOURCE_URL}/800x450/?course`,
      ]
    }

    // Generate images based on search query
    const keywords = query.trim().toLowerCase().replace(/\s+/g, ",")
    return Array.from({ length: 6 }, (_, i) => 
      `${UNSPLASH_SOURCE_URL}/800x450/?${keywords}&sig=${i}`
    )
  }

  const handleSearch = () => {
    const urls = generateImageUrls(searchQuery)
    setSearchResults(urls)
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
        onClick={() => {
          setIsOpen(true)
          if (!searchResults.length) {
            const urls = generateImageUrls(searchQuery)
            setSearchResults(urls)
          }
        }}
        className="w-full"
      >
        <Search className="h-4 w-4 mr-2" />
        {selectedUrl ? "Change Image" : "Select Image"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Course Image</DialogTitle>
            <DialogDescription>
              Search for an image or browse suggested images
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                placeholder="Search for images (e.g., 'programming', 'math', 'science')"
              />
              <Button onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {searchResults.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectImage(url)}
                  className="relative group aspect-video rounded-md overflow-hidden border-2 hover:border-primary transition-colors"
                >
                  <img
                    src={url}
                    alt={`Option ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedUrl === url && (
                    <div className="absolute inset-0 bg-primary/20 border-2 border-primary" />
                  )}
                </button>
              ))}
            </div>

            {!searchResults.length && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Enter a search term and click search to find images</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

