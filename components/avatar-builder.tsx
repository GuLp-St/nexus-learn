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

export type AvatarStyle = "adventurer" | "bottts" | "lorelei" | "micah" | "notionists"

interface AvatarBuilderProps {
  currentSeed?: string
  currentStyle?: AvatarStyle
  onSave: (avatarUrl: string, style: AvatarStyle, seed: string) => Promise<void>
  onCancel?: () => void
  isLoading?: boolean
}

const AVATAR_STYLES: { value: AvatarStyle; label: string }[] = [
  { value: "adventurer", label: "Adventurer" },
  { value: "bottts", label: "Bottts" },
  { value: "lorelei", label: "Lorelei" },
  { value: "micah", label: "Micah" },
  { value: "notionists", label: "Notionists" },
]

export function AvatarBuilder({
  currentSeed = "",
  currentStyle = "adventurer",
  onSave,
  onCancel,
  isLoading = false,
}: AvatarBuilderProps) {
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>(currentStyle)
  const [seed, setSeed] = useState(currentSeed || "")
  const [avatarUrl, setAvatarUrl] = useState("")

  // Generate avatar URL whenever style or seed changes
  useEffect(() => {
    const url = `https://api.dicebear.com/9.x/${selectedStyle}/svg?seed=${encodeURIComponent(seed || "default")}`
    setAvatarUrl(url)
  }, [selectedStyle, seed])

  const handleRandomize = () => {
    // Generate a random seed
    const randomSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    setSeed(randomSeed)
  }

  const handleSave = async () => {
    await onSave(avatarUrl, selectedStyle, seed)
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
            <div className="w-64 h-64 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 shadow-lg border-2 border-primary/20 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  className="w-full h-full object-contain drop-shadow-lg"
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
              {AVATAR_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Seed Input with Randomize */}
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
            disabled={isLoading || !seed.trim()}
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {isLoading ? "Saving..." : "Save Avatar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

