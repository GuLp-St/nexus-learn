"use client"

import Link from "next/link"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSocialNotifications } from "@/hooks/use-social-notifications"
import { cn } from "@/lib/utils"

interface SocialNotificationBadgeProps {
  size?: "icon" | "icon-sm"
  className?: string
  showLabel?: boolean
}

export function SocialNotificationBadge({
  size = "icon-sm",
  className,
  showLabel = false,
}: SocialNotificationBadgeProps) {
  const { totalSocialNotifications } = useSocialNotifications()
  const count = totalSocialNotifications
  const display = count > 99 ? "99+" : count > 0 ? String(count) : null

  return (
    <Link href="/friends" className={cn("inline-flex", className)}>
      <Button variant="ghost" size={size} className="relative h-9 w-9 shrink-0 p-0">
        <Users className="h-5 w-5" />
        {display && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
            aria-label={`${count} social notifications`}
          >
            {display}
          </span>
        )}
        {showLabel && <span className="sr-only">Social</span>}
      </Button>
    </Link>
  )
}
