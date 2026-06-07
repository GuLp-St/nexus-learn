"use client"

import { useState, useEffect } from "react"
import { Bell, Zap, Trophy, UserPlus, Trash2, Gift, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import {
  getNotifications,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  Notification,
} from "@/lib/notification-utils"
import { useRouter } from "next/navigation"
import { formatDateForDisplay } from "@/lib/date-utils"
import { toast } from "sonner"

export function NotificationBell({ align = "right", size = "icon" }: { align?: "left" | "right", size?: "icon" | "icon-sm" }) {
  const { user } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Opening the panel marks all notifications as read
  useEffect(() => {
    if (!isOpen || !user || unreadCount === 0) return
    void markAllNotificationsAsRead(user.uid)
  }, [isOpen, user, unreadCount])

  // Fetch notifications and subscribe to updates
  useEffect(() => {
    if (!user) return

    const loadNotifications = async () => {
      const notifs = await getNotifications(user.uid, 20)
      const filtered = notifs.filter((n) => n.type !== "xp_award")
      setNotifications(filtered)
      setUnreadCount(filtered.filter((n) => !n.read).length)
    }

    loadNotifications()

    // Subscribe to real-time updates
    const unsubscribe = subscribeToNotifications(
      user.uid,
      (updatedNotifications) => {
        const filtered = updatedNotifications.filter((n) => n.type !== "xp_award")
        setNotifications(filtered)
        setUnreadCount(filtered.filter((n) => !n.read).length)
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
    if (notification.type === "quest_claimable") {
      router.push("/")
      setIsOpen(false)
    } else if (notification.type === "challenge" && notification.data.challengeId) {
      router.push(`/challenges/${notification.data.challengeId}/quiz`)
      setIsOpen(false)
    } else if (notification.type === "friend_request" && notification.data.requesterId) {
      router.push("/friends")
      setIsOpen(false)
    } else if (notification.type === "challenge_result") {
      router.push("/friends")
      setIsOpen(false)
    } else if (notification.type === "course_ready" && notification.data.courseId) {
      router.push(`/journey/${notification.data.courseId}`)
      setIsOpen(false)
    }
  }

  const handleClearAll = async () => {
    if (!user || clearing) return
    setClearing(true)
    try {
      await clearAllNotifications(user.uid)
      setNotifications([])
      setUnreadCount(0)
      toast.success("Notifications cleared")
    } catch {
      toast.error("Failed to clear notifications")
    } finally {
      setClearing(false)
    }
  }

  const togglePanel = () => {
    setIsOpen((prev) => !prev)
  }

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "friend_request":
        return <UserPlus className="h-4 w-4" />
      case "challenge":
        return <Zap className="h-4 w-4" />
      case "challenge_result":
        return <Trophy className="h-4 w-4" />
      case "quest_claimable":
        return <Gift className="h-4 w-4" />
      case "xp_award":
        return <Trophy className="h-4 w-4" />
      case "course_ready":
        return <BookOpen className="h-4 w-4" />
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
      case "quest_claimable":
        return `Quest complete: ${notification.data.questTitle || "Daily quest"} — claim your reward on the Dashboard`
      case "challenge_result":
        if (notification.data.isDraw) {
          return `Challenge ended in a draw. Bets refunded. (${notification.data.yourScore} vs ${notification.data.opponentScore})`
        }
        if (notification.data.winnerId === user?.uid) {
          const nexonText = notification.data.nexonWon ? ` and ${notification.data.nexonWon} Nexon` : ""
          return `You won the challenge! +${notification.data.xpAwarded || 0} XP${nexonText}`
        }
        return `You lost the challenge. Better luck next time!`
      case "xp_award":
        return `You earned ${notification.data.amount || 0} XP${notification.data.source ? ` from ${notification.data.source}` : ""}${
          notification.data.newLevel ? ` (Level ${notification.data.newLevel})` : ""
        }`
      case "course_ready":
        return `Your course "${notification.data.courseTitle || "Journey"}" is ready!`
      default:
        return "New notification"
    }
  }

  if (!user) return null

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size={size}
        onClick={togglePanel}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
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
          <div 
            className={`fixed inset-x-4 top-20 z-50 mx-auto w-auto max-w-[calc(100vw-2rem)] sm:max-w-[400px] rounded-lg border bg-background shadow-xl overflow-hidden sm:absolute sm:inset-auto sm:top-full sm:mt-2 sm:w-80 sm:mx-0 ${
              align === "right" ? "sm:right-0 sm:left-auto" : "sm:left-0 sm:right-auto"
            }`}
            style={{
              maxHeight: "calc(100vh - 6rem)",
            }}
          >
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold">Notifications</h3>
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground hover:text-destructive"
                  onClick={handleClearAll}
                  disabled={clearing}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {clearing ? "Clearing…" : "Clear all"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
