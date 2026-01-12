"use client"

import { useState, useEffect } from "react"
import { Shuffle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generateAvatarUrl, AvatarStyle } from "@/lib/avatar-generator"
import { UniversalImagePicker } from "./universal-image-picker"

interface AvatarBuilderProps {
  currentSeed?: string
  currentStyle?: AvatarStyle
  currentUrl?: string
  currentImageKey?: string
  currentImageConfig?: { fit: "cover" | "contain"; position: { x: number; y: number }; scale: number }
  onSave: (
    avatarUrl: string, 
    style: AvatarStyle, 
    seed: string, 
    imageKey?: string,
    imageConfig?: { fit: "cover" | "contain"; position: { x: number; y: number }; scale: number }
  ) => Promise<void>
  onCancel?: () => void
  isLoading?: boolean
  allowedStyles?: string[] // Array of allowed style names (from owned cosmetics)
}

const AVATAR_STYLES: { value: AvatarStyle; label: string }[] = [
  // Common
  { value: "initials", label: "Initials" },
  { value: "icons", label: "Icons" },
  { value: "identicon", label: "Identicon" },
  // Uncommon
  { value: "rings", label: "Rings" },
  { value: "shapes", label: "Shapes" },
  { value: "fun-emoji", label: "Fun Emoji" },
  { value: "bottts", label: "Bottts" },
  // Rare
  { value: "thumbs", label: "Thumbs" },
  { value: "personas", label: "Personas" },
  { value: "pixel-art", label: "Pixel Art" },
  { value: "dylan", label: "Dylan" },
  { value: "croodles", label: "Croodles" },
  { value: "big-ears", label: "Big Ears" },
  { value: "adventurer", label: "Adventurer" },
  // Epic
  { value: "miniavs", label: "Miniavs" },
  { value: "notionists", label: "Notionists" },
  { value: "open-peeps", label: "Open Peeps" },
  { value: "big-smile", label: "Big Smile" },
  { value: "avataaars", label: "Avataaars" },
  // Legendary
  { value: "lorelei", label: "Lorelei" },
  { value: "micah", label: "Micah" },
  // Unique / Custom
  { value: "hf", label: "AI Generated (HF)" },
  { value: "unsplash", label: "Unsplash Pro" },
  { value: "upload", label: "Masterpiece Upload" },
]

export function AvatarBuilder({
  currentSeed = "",
  currentStyle = "initials",
  currentUrl = "",
  currentImageKey,
  currentImageConfig,
  onSave,
  onCancel,
  isLoading = false,
  allowedStyles = [], // If empty, allow all styles (for backward compatibility)
}: AvatarBuilderProps) {
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>(currentStyle)
  const [seed, setSeed] = useState(currentSeed || "")
  const [avatarUrl, setAvatarUrl] = useState(currentUrl)
  const [imageKey, setImageKey] = useState<string | undefined>(currentImageKey)
  const [imageConfig, setImageConfig] = useState(currentImageConfig || { fit: "cover" as const, position: { x: 50, y: 50 }, scale: 1 })

  const isCustomStyle = ["hf", "unsplash", "upload"].includes(selectedStyle)
  
  // Sync internal state with props
  useEffect(() => {
    setAvatarUrl(currentUrl)
  }, [currentUrl])

  useEffect(() => {
    setImageKey(currentImageKey)
  }, [currentImageKey])

  useEffect(() => {
    if (currentImageConfig) {
      setImageConfig(currentImageConfig)
    }
  }, [currentImageConfig])
  
  // Sync selected style if prop changes
  useEffect(() => {
    setSelectedStyle(currentStyle)
    // If switching to a custom style, and it matches the currently equipped style,
    // restore the equipped URL and image key.
    if (["hf", "unsplash", "upload"].includes(currentStyle)) {
      setAvatarUrl(currentUrl)
      setImageKey(currentImageKey)
    }
  }, [currentStyle, currentUrl, currentImageKey])

  // Sync seed if prop changes
  useEffect(() => {
    setSeed(currentSeed || "")
  }, [currentSeed])

  // Handle style switching logic
  useEffect(() => {
    const isNowCustom = ["hf", "unsplash", "upload"].includes(selectedStyle)
    const wasOriginallyCustom = ["hf", "unsplash", "upload"].includes(currentStyle)

    if (isNowCustom) {
      if (selectedStyle === currentStyle && wasOriginallyCustom) {
        // Switching back to the currently equipped custom style
        setAvatarUrl(currentUrl)
        setImageKey(currentImageKey)
      } else {
        // Switching to a DIFFERENT custom style (or first time)
        // If it's not the currently equipped one, we might want to clear or keep.
        // Let's clear if it's a different custom style to avoid confusion.
        if (selectedStyle !== currentStyle) {
          setAvatarUrl("")
          setImageKey(undefined)
        }
      }
    }
  }, [selectedStyle, currentStyle, currentUrl, currentImageKey])
  
  // Filter available styles based on owned cosmetics
  const availableStyles = allowedStyles.length > 0
    ? AVATAR_STYLES.filter(style => allowedStyles.includes(style.value))
    : AVATAR_STYLES
  
  // If current style is not available, use first available or default
  useEffect(() => {
    if (allowedStyles.length > 0 && !allowedStyles.includes(selectedStyle)) {
      if (availableStyles.length > 0) {
        setSelectedStyle(availableStyles[0].value as AvatarStyle)
      }
    }
  }, [allowedStyles, selectedStyle, availableStyles])

  // Generate avatar URL whenever style or seed changes
  useEffect(() => {
    if (isCustomStyle) {
      // For custom styles, the URL is handled by the UniversalImagePicker
      return
    }
    const url = generateAvatarUrl(selectedStyle, seed || "default")
    setAvatarUrl(url)
  }, [selectedStyle, seed, isCustomStyle])

  const handleRandomize = () => {
    // Generate a random seed
    const randomSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    setSeed(randomSeed)
  }

  const handleSave = async () => {
    await onSave(avatarUrl, selectedStyle, seed, imageKey, isCustomStyle ? imageConfig : undefined)
  }

  return (
    <Card className="w-full max-w-2xl mx-auto border-2 border-primary/20 bg-gradient-to-br from-background to-accent/5">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Avatar Creator
        </CardTitle>
        <CardDescription className="text-base">
          Design your unique avatar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Live Preview */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-64 h-64 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 shadow-lg border-2 border-primary/20 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  className="w-full h-full"
                  style={isCustomStyle ? {
                    objectFit: imageConfig.fit,
                    transform: `scale(${imageConfig.scale || 1}) translate(${imageConfig.position.x - 50}%, ${imageConfig.position.y - 50}%)`
                  } : {
                    objectFit: "cover"
                  }}
                />
              ) : (
                <div className="text-muted-foreground">Loading...</div>
              )}
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold shadow-md">
              Preview
            </div>
          </div>
        </div>

        {/* Custom Image Picker for Unique Styles */}
        {isCustomStyle && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
              <Label className="text-base font-semibold mb-2 block">
                {selectedStyle === "hf" ? "Generate AI Avatar" : 
                 selectedStyle === "unsplash" ? "Pick Unsplash Photo" : 
                 "Upload Your Own Avatar"}
              </Label>
              <UniversalImagePicker
                value={avatarUrl}
                imageKey={imageKey}
                initialKey={currentImageKey}
                onChange={(url, key, config) => {
                  setAvatarUrl(url)
                  setImageKey(key)
                  if (config) {
                    setImageConfig(config)
                  }
                }}
                routeSlug="avatarImage"
                isCircular={true}
                hidePreview={true}
                initialObjectFit={imageConfig.fit}
                initialPosition={imageConfig.position}
                initialScale={imageConfig.scale}
                allowedModes={
                  selectedStyle === "hf" ? ["ai"] :
                  selectedStyle === "unsplash" ? ["unsplash"] :
                  ["upload"]
                }
              />
            </div>
          </div>
        )}

        {/* Style Selection */}
        <div className="space-y-2">
          <Label htmlFor="avatar-style" className="text-base font-semibold">
            Style
          </Label>
          <Select
            value={selectedStyle}
            onValueChange={(value) => setSelectedStyle(value as AvatarStyle)}
            disabled={isLoading}
          >
            <SelectTrigger id="avatar-style" className="w-full h-11">
              <SelectValue placeholder="Select a style" />
            </SelectTrigger>
            <SelectContent>
              {availableStyles.length > 0 ? (
                availableStyles.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  No avatar styles available. Purchase from the Store.
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Seed Input with Randomize - Only show for non-custom styles */}
        {!isCustomStyle && (
          <div className="space-y-2">
            <Label htmlFor="avatar-seed" className="text-base font-semibold">
              Seed (Unique Identifier)
            </Label>
            <div className="flex gap-2">
              <Input
                id="avatar-seed"
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Enter seed or click randomize"
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleRandomize}
                disabled={isLoading}
                className="px-4"
                title="Generate random seed"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                Randomize
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The seed determines your avatar's appearance. Same seed = same avatar.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || (!isCustomStyle && !seed.trim()) || (isCustomStyle && !avatarUrl) || availableStyles.length === 0}
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {isLoading ? "Saving..." : availableStyles.length === 0 ? "No Styles Available" : "Save Avatar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
