"use client"

import { useState, useEffect } from "react"
import { Bell, Check, X, Zap, Trophy, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import {
  getNotifications,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  Notification,
} from "@/lib/notification-utils"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatDateForDisplay } from "@/lib/date-utils"

export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const { user } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  // Fetch notifications and subscribe to updates
  useEffect(() => {
    if (!user) return

    const loadNotifications = async () => {
      const [notifs, count] = await Promise.all([
        getNotifications(user.uid, 20),
        getUnreadNotificationCount(user.uid),
      ])
      setNotifications(notifs)
      setUnreadCount(count)
    }

    loadNotifications()

    // Subscribe to real-time updates
    const unsubscribe = subscribeToNotifications(
      user.uid,
      (updatedNotifications) => {
        setNotifications(updatedNotifications)
        // Update unread count
        const unread = updatedNotifications.filter((n) => !n.read).length
        setUnreadCount(unread)
      },
      20
    )

    return () => {
      unsubscribe()
    }
  }, [user])

  const handleNotificationClick = async (notification: Notification) => {
    if (!user) return

    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id)
    }

    // Handle navigation based on notification type
    if (notification.type === "challenge" && notification.data.challengeId) {
      router.push(`/challenges/${notification.data.challengeId}/quiz`)
      setIsOpen(false)
    } else if (notification.type === "friend_request" && notification.data.requesterId) {
      router.push("/friends")
      setIsOpen(false)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!user) return
    await markAllNotificationsAsRead(user.uid)
  }

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "friend_request":
        return <UserPlus className="h-4 w-4" />
      case "challenge":
        return <Zap className="h-4 w-4" />
      case "challenge_result":
        return <Trophy className="h-4 w-4" />
      case "xp_award":
        return <Trophy className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
    }
  }

  const getNotificationMessage = (notification: Notification): string => {
    switch (notification.type) {
      case "friend_request":
        return `${notification.data.requesterName || "Someone"} sent you a friend request`
      case "challenge":
        return `${notification.data.challengerName || "Someone"} challenged you to a quiz!`
      case "challenge_result":
        if (notification.data.winnerId === user?.uid) {
          const nexonText = notification.data.nexonWon ? ` and ${notification.data.nexonWon} Nexon` : ""
          return `You won the challenge! +${notification.data.xpAwarded || 0} XP${nexonText}`
        } else {
          return `You lost the challenge. Better luck next time!`
        }
      case "xp_award":
        return `You earned ${notification.data.amount || 0} XP${notification.data.source ? ` from ${notification.data.source}` : ""}${
          notification.data.newLevel ? ` (Level ${notification.data.newLevel})` : ""
        }`
      default:
        return "New notification"
    }
  }

  if (!user) return null

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 z-50 w-80 max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg overflow-hidden ${
            align === "right" ? "sm:right-0 right-[-0.5rem]" : "sm:left-0 left-[-0.5rem]"
          }`}
          style={{
            maxHeight: "calc(100vh - 6rem)",
          }}>
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="text-xs"
                >
                  Mark all as read
                </Button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full p-4 text-left transition-colors hover:bg-accent ${
                        !notification.read ? "bg-accent/50" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className={`mt-0.5 flex-shrink-0 ${!notification.read ? "text-primary" : "text-muted-foreground"}`}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notification.read ? "font-semibold" : ""}`}>
                            {getNotificationMessage(notification)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateForDisplay(notification.createdAt, "MMM d, HH:mm")}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t p-2">
                <Link href="/friends">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setIsOpen(false)}>
                    View all
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
