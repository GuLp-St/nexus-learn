"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateUserNickname, updateUserEmail, updateUserPassword, updateUserAvatar } from "@/lib/profile-utils"
import { useAuth } from "@/components/auth-provider"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { AvatarBuilder } from "@/components/avatar-builder"
import { getUserCosmetics, getAllCosmetics, resolveAvatarStyle } from "@/lib/cosmetics-utils"
import { AvatarStyle } from "@/lib/avatar-generator"
import { deleteFileFromUploadthing } from "@/lib/upload-actions"

interface ProfileSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => void // Callback when profile is updated
}

export function ProfileSettingsModal({ open, onOpenChange, onUpdate }: ProfileSettingsModalProps) {
  const { user, nickname, avatarUrl } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  
  // Form state
  const [nicknameValue, setNicknameValue] = useState(nickname || "")
  const [emailValue, setEmailValue] = useState(user?.email || "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false)
  const [ownedAvatarStyles, setOwnedAvatarStyles] = useState<string[]>([])
  const [currentAvatarSeed, setCurrentAvatarSeed] = useState("")
  const [currentAvatarStyle, setCurrentAvatarStyle] = useState<AvatarStyle>("initials")
  const [currentAvatarImageKey, setCurrentAvatarImageKey] = useState<string | undefined>(undefined)
  const [currentAvatarImageConfig, setCurrentAvatarImageConfig] = useState<{ fit: "cover" | "contain", position: { x: number, y: number }, scale: number } | undefined>(undefined)

  // Load owned avatar styles and current seed when modal opens
  useEffect(() => {
    const loadUserData = async () => {
      if (!user || !open) return
      try {
        const userCosmetics = await getUserCosmetics(user.uid)
        setCurrentAvatarSeed(userCosmetics.avatarSeed || nickname || "")
        setCurrentAvatarStyle(resolveAvatarStyle(userCosmetics.avatarStyle))
        setCurrentAvatarImageKey(userCosmetics.avatarImageKey)
        setCurrentAvatarImageConfig(userCosmetics.avatarImageConfig)
        
        const ownedAvatarIds = userCosmetics.ownedCosmetics?.avatars || []
        
        // Ensure defaults are included if missing
        const defaults = ["avatar-initials", "avatar-icons", "avatar-identicon"]
        const allOwnedIds = Array.from(new Set([...ownedAvatarIds, ...defaults]))
        
        // Map owned avatar IDs to their style values using resolveAvatarStyle for safety
        const styles = allOwnedIds.map(id => resolveAvatarStyle(id))
        setOwnedAvatarStyles(styles)
      } catch (error) {
        console.error("Error loading user cosmetic data:", error)
      }
    }
    loadUserData()
  }, [user, open, nickname])

  // Reset form when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form
      setNicknameValue(nickname || "")
      setEmailValue(user?.email || "")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowAvatarBuilder(false)
      setError("")
      setSuccess("")
    }
    onOpenChange(newOpen)
  }

  const handleAvatarSave = async (
    avatarUrl: string, 
    style: string, 
    seed: string, 
    imageKey?: string,
    imageConfig?: { fit: "cover" | "contain", position: { x: number, y: number }, scale: number }
  ) => {
    if (!user) return

    setLoading(true)
    setError("")

    try {
      // If we have a previous image key, and we are saving a NEW one, delete the old one
      if (currentAvatarImageKey && imageKey && currentAvatarImageKey !== imageKey) {
        await deleteFileFromUploadthing(currentAvatarImageKey)
      }
      
      await updateUserAvatar(user.uid, avatarUrl, style, seed, imageKey, imageConfig)
      setSuccess("Avatar updated successfully!")
      setShowAvatarBuilder(false)
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate()
      }

      // Close modal after a short delay
      setTimeout(() => {
        handleOpenChange(false)
      }, 1500)
    } catch (err: any) {
      setError(err.message || "Failed to update avatar")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const updates: Promise<void>[] = []

      // Update nickname if changed
      if (nicknameValue.trim() !== nickname) {
        if (!nicknameValue.trim()) {
          throw new Error("Nickname cannot be empty")
        }
        updates.push(updateUserNickname(user.uid, nicknameValue.trim()))
      }

      // Update email if changed
      if (emailValue !== user.email) {
        if (!currentPassword) {
          throw new Error("Current password is required to change email")
        }
        updates.push(updateUserEmail(user.email || "", emailValue, currentPassword))
      }

      // Update password if provided
      if (newPassword) {
        if (!currentPassword) {
          throw new Error("Current password is required to change password")
        }
        if (newPassword.length < 6) {
          throw new Error("Password must be at least 6 characters")
        }
        if (newPassword !== confirmPassword) {
          throw new Error("Passwords do not match")
        }
        updates.push(updateUserPassword(user.email || "", currentPassword, newPassword))
      }

      // Execute all updates
      if (updates.length > 0) {
        await Promise.all(updates)
      }

      setSuccess("Profile updated successfully!")
      setCurrentPassword("") // Clear password fields
      setNewPassword("")
      setConfirmPassword("")

      // Notify parent to refresh
      if (onUpdate) {
        onUpdate()
      }

      // Close modal after a short delay
      setTimeout(() => {
        handleOpenChange(false)
      }, 1500)
    } catch (err: any) {
      setError(err.message || "Failed to update profile")
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return "U"
    const parts = name.trim().split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information. Leave fields blank to keep current values.
          </DialogDescription>
        </DialogHeader>

        {showAvatarBuilder ? (
          <div className="py-4">
            <AvatarBuilder
              currentSeed={currentAvatarSeed}
              currentStyle={currentAvatarStyle}
              currentUrl={avatarUrl || ""}
              currentImageKey={currentAvatarImageKey}
              currentImageConfig={currentAvatarImageConfig}
              onSave={handleAvatarSave}
              onCancel={() => setShowAvatarBuilder(false)}
              isLoading={loading}
              allowedStyles={ownedAvatarStyles}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Picture */}
            <div className="space-y-2">
              <Label>Profile Picture</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {avatarUrl ? (
                    <AvatarImage 
                      src={avatarUrl} 
                      alt={nickname || "User"} 
                      style={currentAvatarStyle && ["hf", "unsplash", "upload"].includes(currentAvatarStyle) && currentAvatarImageConfig ? {
                        objectFit: currentAvatarImageConfig.fit,
                        transform: `scale(${currentAvatarImageConfig.scale || 1}) translate(${currentAvatarImageConfig.position.x - 50}%, ${currentAvatarImageConfig.position.y - 50}%)`
                      } : {
                        objectFit: "cover"
                      }}
                    />
                  ) : (
                    <AvatarFallback className="text-2xl">
                      {getInitials(nickname)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAvatarBuilder(true)}
                    disabled={loading}
                  >
                    Create Avatar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Create a unique avatar using the Avatar Creator.
              </p>
            </div>

            {/* Nickname */}
            <div className="space-y-2">
              <Label htmlFor="nickname">Username</Label>
              <Input
                id="nickname"
                value={nicknameValue}
                onChange={(e) => setNicknameValue(e.target.value)}
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="Enter your email"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Changing email requires your current password.
              </p>
            </div>

            {/* Current Password (required for email/password changes) */}
            {(emailValue !== user?.email || newPassword) && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={loading}
                  required={emailValue !== user?.email || !!newPassword}
                />
                <p className="text-xs text-muted-foreground">
                  Required to change email or password.
                </p>
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password (optional)</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to keep current password. Must be at least 6 characters.
              </p>
            </div>

            {/* Confirm Password */}
            {newPassword && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={loading}
                  required={!!newPassword}
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-2 rounded-lg">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-500/10 text-green-600 text-sm px-4 py-2 rounded-lg">
                {success}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
