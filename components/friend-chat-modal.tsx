"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import {
  sendMessage,
  subscribeToChatMessages,
  markMessagesAsRead,
  setTypingStatus,
  subscribeToTypingStatus,
  deleteChatHistoryForUser,
  type ChatHistoryDeleteMode,
  type ChatMessage,
} from "@/lib/chat-utils"
import { markChallengesSeen } from "@/lib/social-notification-seen"
import { useAuth } from "@/components/auth-provider"
import { format, isToday, isYesterday, isSameDay } from "date-fns"
import { Zap, Trophy, Play, Share2, BookOpen, Plus, Clock, X, Check, Trash2, AlertCircle, Send, CheckCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ChallengeSelectionModal } from "./challenge-selection-modal"
import { CourseShareModal } from "./course-share-modal"
import {
  getChallenge,
  Challenge,
  subscribeToChallenge,
  acceptChallenge,
  rejectChallenge,
  cancelChallenge,
  isPoweredChallenge,
  normalizeChallengeSettings,
} from "@/lib/challenge-utils"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { NexonIcon } from "./ui/nexon-icon"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { getUserCourseLimits, type CourseLimitInfo } from "@/lib/course-limit-utils"
import { CourseLimitDialog } from "@/components/course-limit-dialog"

interface FriendChatModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
  friendAvatarUrl?: string
  /** Open challenge settings after picking a course on journey */
  initialChallengeCourseId?: string | null
  onChallengeCourseConsumed?: () => void
}

export function FriendChatModal({
  open,
  onOpenChange,
  friendId,
  friendNickname,
  friendAvatarUrl,
  initialChallengeCourseId,
  onChallengeCourseConsumed,
}: FriendChatModalProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [isFriendTyping, setIsFriendTyping] = useState(false)
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [activeChallengeCourseId, setActiveChallengeCourseId] = useState<string | null>(null)
  const [historyDeleteOpen, setHistoryDeleteOpen] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState(false)

  useEffect(() => {
    if (open && initialChallengeCourseId) {
      setActiveChallengeCourseId(initialChallengeCourseId)
      setIsChallengeModalOpen(true)
      onChallengeCourseConsumed?.()
    }
  }, [open, initialChallengeCourseId, onChallengeCourseConsumed])

  useEffect(() => {
    if (!open) {
      setActiveChallengeCourseId(null)
      setIsChallengeModalOpen(false)
    }
  }, [open])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const shouldStickToBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [])

  // Stick to bottom when chat opens or messages update
  useEffect(() => {
    if (!open) return
    shouldStickToBottomRef.current = true
    scrollToBottom()
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom)
    })
    const timers = [50, 150, 400, 800, 1200].map((ms) => setTimeout(scrollToBottom, ms))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
  }, [open, messages, isFriendTyping, scrollToBottom])

  // Re-scroll when message area height changes (async cards, images, etc.)
  useEffect(() => {
    if (!open) return
    const container = messagesContainerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => {
      if (shouldStickToBottomRef.current) scrollToBottom()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [open, scrollToBottom])

  // Subscribe to chat messages when modal opens
  useEffect(() => {
    if (!open || !user) return

    // Fetch initial messages and subscribe to real-time updates
    const unsubscribe = subscribeToChatMessages(user.uid, friendId, (updatedMessages) => {
      setMessages(updatedMessages)
    }, 50)

    // Subscribe to typing status
    const unsubscribeTyping = subscribeToTypingStatus(user.uid, friendId, (isTyping) => {
      setIsFriendTyping(isTyping)
    })

    return () => {
      unsubscribe()
      unsubscribeTyping()
      // Ensure typing status is cleared when closing
      if (user) {
        setTypingStatus(user.uid, friendId, false).catch(console.error)
      }
    }
  }, [open, user, friendId])

  // Mark all messages as read when chat opens (including hidden-by-delete ones)
  useEffect(() => {
    if (open && user) {
      markMessagesAsRead(user.uid, friendId).catch(console.error)
    }
  }, [open, user, friendId])

  // Dismiss challenge notifications once the user has opened this chat
  useEffect(() => {
    if (!open || messages.length === 0) return
    const challengeIds = messages
      .filter((m) => m.type === "challenge" && m.challengeId)
      .map((m) => m.challengeId as string)
    if (challengeIds.length > 0) {
      markChallengesSeen(challengeIds)
    }
  }, [open, messages])

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value)

    if (!user) return

    // Handle typing status
    setTypingStatus(user.uid, friendId, true).catch(console.error)

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (user) {
        setTypingStatus(user.uid, friendId, false).catch(console.error)
      }
    }, 3000)
  }

  const handleSend = async () => {
    if (!user || !newMessage.trim() || sending) return

    setSending(true)
    try {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      await setTypingStatus(user.uid, friendId, false)
      await sendMessage(user.uid, friendId, newMessage.trim())
      setNewMessage("")
      scrollToBottom()
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const HISTORY_DELETE_OPTIONS: { mode: ChatHistoryDeleteMode; label: string; description: string }[] = [
    { mode: "keep_last_hour", label: "Keep last hour", description: "Remove everything older than 1 hour" },
    { mode: "keep_since_yesterday", label: "Keep since yesterday", description: "Remove messages before yesterday" },
    { mode: "keep_last_week", label: "Keep last week", description: "Remove everything older than 7 days" },
    { mode: "all", label: "Delete all history", description: "Clear the entire chat on your side" },
  ]

  const handleDeleteHistory = async (mode: ChatHistoryDeleteMode) => {
    if (!user || deletingHistory) return
    setDeletingHistory(true)
    try {
      const count = await deleteChatHistoryForUser(user.uid, friendId, mode)
      setHistoryDeleteOpen(false)
      toast.success(
        count > 0
          ? `Removed ${count} message${count === 1 ? "" : "s"} from your view`
          : "No messages to remove"
      )
    } catch (error) {
      console.error("Error deleting chat history:", error)
      toast.error("Failed to delete chat history")
    } finally {
      setDeletingHistory(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[90vh] min-h-0 flex-col p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogDescription className="sr-only">
            Chat with {friendNickname}. Send messages, quiz challenges, and shared courses.
          </DialogDescription>
          <div className="flex items-center justify-between w-full pr-8">
            <DialogTitle className="flex items-center gap-3">
              <AvatarWithCosmetics
                userId={friendId}
                nickname={friendNickname}
                avatarUrl={friendAvatarUrl}
                size="md"
              />
              <div className="flex flex-col">
                <span className="text-base">
                  <NameWithColor
                    userId={friendId}
                    name={friendNickname}
                  />
                </span>
                {isFriendTyping && (
                  <span className="text-xs text-primary animate-pulse">typing...</span>
                )}
              </div>
            </DialogTitle>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setHistoryDeleteOpen(true)}
                title="Clear chat history"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs px-2"
                onClick={() => {
                  onOpenChange(false)
                  router.push(
                    `/journey?action=share&friendId=${encodeURIComponent(friendId)}&friendName=${encodeURIComponent(friendNickname)}`
                  )
                }}
              >
                <Share2 className="h-3 w-3" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs px-2"
                onClick={() => {
                  onOpenChange(false)
                  router.push(
                    `/journey?action=challenge&friendId=${encodeURIComponent(friendId)}&friendName=${encodeURIComponent(friendNickname)}`
                  )
                }}
              >
                <Zap className="h-3 w-3" />
                <span className="hidden sm:inline">Challenge</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 pb-2 space-y-4 bg-accent/5 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message, msgIndex) => {
              const isOwnMessage = message.senderId === user?.uid
              const messageDate = message.createdAt?.toDate() || new Date()
              const prevDate = msgIndex > 0
                ? messages[msgIndex - 1].createdAt?.toDate()
                : null
              const showDateSep =
                !prevDate || !isSameDay(messageDate, prevDate)
              const dateLabel = isToday(messageDate)
                ? "Today"
                : isYesterday(messageDate)
                  ? "Yesterday"
                  : format(messageDate, "MMMM d, yyyy")

              return (
                <div key={message.id}>
                  {showDateSep && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        {dateLabel}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                <div
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex max-w-[85%] flex-col gap-1 ${
                      isOwnMessage ? "items-end" : "items-start"
                    }`}
                  >
                    {message.type === "challenge" ? (
                      <ChallengeMessageCard 
                        challengeId={message.challengeId!} 
                        isOwnMessage={isOwnMessage}
                        friendNickname={friendNickname}
                      />
                    ) : message.type === "course_share" ? (
                      <CourseShareMessageCard
                        messageId={message.id}
                        courseId={message.courseId!}
                        isOwnMessage={isOwnMessage}
                        isUsed={message.isUsed}
                      />
                    ) : (
                      <div
                        className={`rounded-lg px-4 py-2 shadow-sm ${
                          isOwnMessage
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-foreground border border-border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm">{message.message}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1 px-1">
                      <span className="text-[10px] text-muted-foreground">
                        {format(messageDate, "HH:mm")}
                      </span>
                      {isOwnMessage && (
                        message.read ? (
                          <CheckCheck className="h-3 w-3 text-primary" />
                        ) : (
                          <Check className="h-3 w-3 text-muted-foreground" />
                        )
                      )}
                    </div>
                  </div>
                </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
        </div>

        {/* Message Input */}
        <div className="border-t p-4 bg-background">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[44px] max-h-[120px] resize-none py-3"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              size="icon"
              className="h-11 w-11 shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {activeChallengeCourseId && (
          <ChallengeSelectionModal
            open={isChallengeModalOpen}
            onOpenChange={(next) => {
              setIsChallengeModalOpen(next)
              if (!next) setActiveChallengeCourseId(null)
            }}
            friendId={friendId}
            friendNickname={friendNickname}
            inChat
            returnToChat
            presetCourseId={activeChallengeCourseId}
          />
        )}

        <CourseShareModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          friendId={friendId}
          friendNickname={friendNickname}
        />

        <Dialog open={historyDeleteOpen} onOpenChange={setHistoryDeleteOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete chat history</DialogTitle>
              <DialogDescription>
                Removes messages from your view only. They stay on {friendNickname}&apos;s side until
                they delete them too — then they&apos;re removed from the server.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-1">
              {HISTORY_DELETE_OPTIONS.map((opt) => (
                <Button
                  key={opt.mode}
                  variant="outline"
                  className="w-full h-auto flex-col items-start gap-0.5 py-2.5 px-3 text-left"
                  disabled={deletingHistory}
                  onClick={() => void handleDeleteHistory(opt.mode)}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-normal">{opt.description}</span>
                </Button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setHistoryDeleteOpen(false)} disabled={deletingHistory}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

function ChallengeMessageCard({ 
  challengeId, 
  isOwnMessage, 
  friendNickname 
}: { 
  challengeId: string, 
  isOwnMessage: boolean,
  friendNickname: string 
}) {
  const { user } = useAuth()
  const router = useRouter()
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState<string>("")

  // Subscribe to challenge updates
  useEffect(() => {
    const unsubscribe = subscribeToChallenge(challengeId, (data) => {
      setChallenge(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [challengeId])

  // Timer effect
  useEffect(() => {
    if (!challenge) return

    const updateTimer = () => {
      const now = new Date().getTime()
      let targetTime: number | undefined

      if (challenge.status === "pending") {
        targetTime = challenge.expiresAt?.toMillis()
      } else if (challenge.status === "accepted") {
        targetTime = challenge.completionDeadline?.toMillis()
      }

      if (!targetTime) {
        setTimeLeft("")
        return
      }

      const diff = targetTime - now
      if (diff <= 0) {
        setTimeLeft("Expired")
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`)
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [challenge])

  const handleAccept = async () => {
    if (!user || actionLoading) return
    setActionLoading(true)
    try {
      await acceptChallenge(challengeId, user.uid)
      toast.success("Challenge accepted!")
    } catch (error: any) {
      toast.error(error.message || "Failed to accept challenge")
    } finally {
      setActionLoading(false)
    }
  }

  const handleDecline = async () => {
    if (!user || actionLoading) return
    setActionLoading(true)
    try {
      await rejectChallenge(challengeId)
      toast.success("Challenge declined")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to decline challenge")
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!user || actionLoading) return
    setActionLoading(true)
    try {
      await cancelChallenge(challengeId, user.uid)
      toast.success("Challenge cancelled")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel challenge")
    } finally {
      setActionLoading(false)
    }
  }

  const handleLearnFirst = async () => {
    if (!user || !challenge || actionLoading) return
    setActionLoading(true)
    try {
      const newCourseId = await copyCourseToUserLibrary(user.uid, challenge.courseId)
      router.push(`/journey/${newCourseId}`)
    } catch (error) {
      toast.error("Failed to add course to library")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-4 bg-muted rounded-lg animate-pulse w-48 h-24" />
  if (!challenge) return null

  const isChallenger = user?.uid === challenge.challengerId
  const isChallenged = user?.uid === challenge.challengedId
  const isCompleted = challenge.status === "completed"
  const isExpired = challenge.status === "expired"
  const isRejected = challenge.status === "rejected"
  
  // Progress status
  const challengerPlayed = challenge.hasChallengerPlayed
  const challengedPlayed = challenge.challengedScore !== null

  const yourRaw = isChallenger ? challenge.challengerScore : challenge.challengedScore
  const oppRaw = isChallenger ? challenge.challengedScore : challenge.challengerScore
  const yourPerf = isChallenger ? challenge.challengerPerformanceScore : challenge.challengedPerformanceScore
  const oppPerf = isChallenger ? challenge.challengedPerformanceScore : challenge.challengerPerformanceScore
  const yourTime = isChallenger ? challenge.challengerTime : challenge.challengedTime
  const oppTime = isChallenger ? challenge.challengedTime : challenge.challengerTime

  const perfTied =
    yourPerf != null && oppPerf != null && yourPerf === oppPerf
  const isDrawResult =
    !!challenge.isDraw || challenge.winnerId === null || perfTied
  const youWon = !isDrawResult && challenge.winnerId === user?.uid
  const youLost = isCompleted && !isDrawResult && !youWon
  const isGenerating =
    challenge.status === "generating" || !challenge.questionIds?.length
  const isLiveChallenge = isPoweredChallenge(normalizeChallengeSettings(challenge.settings))
  const myLiveIndex = isChallenger ? challenge.challengerLiveIndex : challenge.challengedLiveIndex
  const oppLiveIndex = isChallenger ? challenge.challengedLiveIndex : challenge.challengerLiveIndex

  const formatQuizTime = (sec: number | null | undefined) => {
    if (sec == null) return "—"
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`
  }

  return (
    <Card className={`overflow-hidden border-2 w-full max-w-[280px] ${
      isCompleted
        ? isDrawResult
          ? "border-amber-500/30 bg-amber-500/5"
          : youWon
            ? "border-green-500/20 bg-green-500/5"
            : "border-red-500/25 bg-red-500/5"
        : isExpired || isRejected
          ? "border-muted bg-muted/5 opacity-70"
          : isOwnMessage
            ? "border-primary/20 bg-primary/5"
            : "border-orange-500/20 bg-orange-500/5"
    }`}>
      <CardContent className="p-4 space-y-3">
        {/* Header & Timer */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${isOwnMessage ? "text-primary" : "text-orange-500"}`} />
            <span className="font-bold text-xs uppercase tracking-wider">
              {isLiveChallenge ? "Live Duel" : "Quiz Challenge"}
            </span>
          </div>
          {timeLeft && !isCompleted && !isExpired && !isRejected && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Clock className="h-3 w-3" />
              <span>{timeLeft}</span>
            </div>
          )}
        </div>
        
        {/* Challenge Info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground font-medium uppercase">
              {challenge.quizType === "course" ? "Final Exam" : `Module ${Number(challenge.moduleIndex) + 1} Quiz`}
            </p>
            {challenge.betAmount > 0 && (
              <div className="flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-primary">
                <NexonIcon className="h-3 w-3" />
                <span>{challenge.betAmount}</span>
              </div>
            )}
          </div>
          <p className="text-sm font-semibold truncate">
            {isChallenger ? `You challenged ${friendNickname}` : `${friendNickname} challenged you`}
          </p>
        </div>

        {/* Dynamic Status / Actions */}
        <div className="space-y-2">
          {isGenerating && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/40 p-2.5 rounded border border-dashed">
              <Spinner className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span>
                {challenge.generationError
                  ? `Quiz prep failed: ${challenge.generationError}`
                  : "Preparing quiz questions…"}
              </span>
            </div>
          )}

          {challenge.status === "pending" && (
            <>
              {isChallenger ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded italic">
                    <AlertCircle className="h-3 w-3" />
                    <span>Waiting for {friendNickname} to accept...</span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/challenges/${challengeId}/quiz`} className="flex-1">
                      <Button size="sm" className="w-full text-xs gap-2" disabled={challengerPlayed || isGenerating}>
                        <Play className="h-3 w-3" />
                        {challengerPlayed
                          ? "Score Locked"
                          : isLiveChallenge
                            ? "Join Live Lobby"
                            : "Take Quiz"}
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={handleCancel}
                      disabled={actionLoading || challengerPlayed}
                      title={
                        challengerPlayed
                          ? "Can't cancel after your score is locked in"
                          : "Cancel challenge"
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs gap-2 bg-orange-500 hover:bg-orange-600" onClick={handleAccept} disabled={actionLoading || isGenerating}>
                    <Check className="h-3 w-3" />
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-2" onClick={handleDecline} disabled={actionLoading}>
                    <X className="h-3 w-3" />
                    Decline
                  </Button>
                </div>
              )}
            </>
          )}

          {challenge.status === "accepted" && (
            <div className="space-y-2">
              {/* Opponent Progress Info */}
              <div className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded space-y-1">
                {isLiveChallenge && (myLiveIndex != null || oppLiveIndex != null) && (
                  <p className="flex items-center gap-1.5">
                    <Play className="h-3 w-3 text-primary" />
                    Live: you Q{(myLiveIndex ?? 0) + 1} · {friendNickname} Q{(oppLiveIndex ?? 0) + 1}
                  </p>
                )}
                {isChallenger ? (
                  <p className="flex items-center gap-1.5">
                    {challengedPlayed ? <CheckCheck className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                    {challengedPlayed ? `${friendNickname} already locked in answer` : `Waiting for ${friendNickname} to take quiz`}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5">
                    {challengerPlayed ? <CheckCheck className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3" />}
                    {challengerPlayed ? `${friendNickname} already locked in score` : `Waiting for ${friendNickname} to take quiz`}
                  </p>
                )}
              </div>

              {/* Player Actions */}
              {((isChallenger && !challengerPlayed) || (isChallenged && !challengedPlayed)) ? (
                <div className="flex gap-2">
                  <Link href={`/challenges/${challengeId}/quiz`} className="flex-1">
                    <Button size="sm" className="w-full text-xs gap-2">
                      <Play className="h-3 w-3" />
                      {isLiveChallenge ? "Join Live Lobby" : "Take Quiz"}
                    </Button>
                  </Link>
                  {isChallenged && (
                    <Button size="sm" variant="outline" className="text-xs gap-2" onClick={handleLearnFirst} disabled={actionLoading}>
                      <BookOpen className="h-3 w-3" />
                      Learn
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-2 px-4 bg-green-500/10 rounded-md text-green-600 dark:text-green-400 gap-2">
                  <CheckCheck className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Score Locked</span>
                </div>
              )}
            </div>
          )}

          {isCompleted && (
            <div className="space-y-2">
              <div
                className={`flex flex-col items-center justify-center p-3 rounded-lg text-center ${
                  isDrawResult
                    ? "bg-amber-500/10"
                    : youWon
                      ? "bg-green-500/10"
                      : "bg-red-500/10"
                }`}
              >
                <Trophy
                  className={`h-6 w-6 mb-1 ${
                    isDrawResult ? "text-amber-500" : youWon ? "text-yellow-500" : "text-red-400"
                  }`}
                />
                <p
                  className={`text-xs font-bold ${
                    isDrawResult
                      ? "text-amber-600 dark:text-amber-400"
                      : youWon
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {isDrawResult
                    ? challenge.betAmount
                      ? "DRAW — BETS REFUNDED"
                      : "DRAW!"
                    : youWon
                      ? "YOU WON!"
                      : "YOU LOST"}
                </p>
                {perfTied && !challenge.isDraw && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Same competitive rating — counted as a draw
                  </p>
                )}
                <div
                  className={`mt-2 grid grid-cols-2 gap-4 w-full border-t pt-2 ${
                    isDrawResult
                      ? "border-amber-500/20"
                      : youWon
                        ? "border-green-500/20"
                        : "border-red-500/20"
                  }`}
                >
                  <div className="text-[10px]">
                    <p className="text-muted-foreground uppercase">You</p>
                    <p className="font-bold">{yourRaw ?? 0} correct</p>
                    {yourPerf != null && (
                      <p className="text-muted-foreground">Rating {yourPerf.toLocaleString()}</p>
                    )}
                    <p className="text-muted-foreground">{formatQuizTime(yourTime)}</p>
                  </div>
                  <div className="text-[10px]">
                    <p className="text-muted-foreground uppercase">{friendNickname}</p>
                    <p className="font-bold">{oppRaw ?? 0} correct</p>
                    {oppPerf != null && (
                      <p className="text-muted-foreground">Rating {oppPerf.toLocaleString()}</p>
                    )}
                    <p className="text-muted-foreground">{formatQuizTime(oppTime)}</p>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 leading-tight">
                  Correct answers vs opponent · Rating uses peak combo + speed
                </p>
              </div>
            </div>
          )}

          {isExpired && (
            <div className="flex flex-col items-center justify-center p-3 bg-muted rounded-lg text-center">
              <Clock className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-bold text-muted-foreground uppercase">Challenge Expired</p>
              {challenge.winnerId && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {challenge.winnerId === user?.uid ? "Won by default" : `${friendNickname} won by default`}
                </p>
              )}
            </div>
          )}

          {isRejected && (
            <div className="flex flex-col items-center justify-center p-3 bg-red-500/5 rounded-lg text-center border border-red-500/10">
              <X className="h-5 w-5 text-red-500/50 mb-1" />
              <p className="text-xs font-bold text-red-500/50 uppercase">Declined/Cancelled</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CourseShareMessageCard({
  messageId,
  courseId,
  isOwnMessage,
  isUsed,
}: {
  messageId: string
  courseId: string
  isOwnMessage: boolean
  isUsed?: boolean
}) {
  const { user } = useAuth()
  const router = useRouter()
  const [course, setCourse] = useState<CourseWithProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [hasAddedViaThisInvite, setHasAddedViaThisInvite] = useState(false)
  const [courseLimits, setCourseLimits] = useState<CourseLimitInfo | null>(null)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserCourseLimits(user.uid)
      .then(setCourseLimits)
      .catch((error) => console.error("Error fetching course limits:", error))
  }, [user])

  useEffect(() => {
    const fetchCourse = async () => {
      if (!user) return
      try {
        const courseData = await getCourseWithProgress(courseId, user.uid)
        if (courseData) {
          setCourse(courseData)
        }
        
        // Check if this specific user has already used this specific invite
        const { getDoc, doc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const msgDoc = await getDoc(doc(db, "chatMessages", messageId))
        if (msgDoc.exists()) {
          const usedBy = msgDoc.data().usedBy || []
          if (usedBy.includes(user.uid)) {
            setHasAddedViaThisInvite(true)
          }
        }
      } catch (error) {
        console.error("Error fetching course:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchCourse()
  }, [courseId, user, messageId])

  const atAddedLimit =
    courseLimits != null && courseLimits.added >= courseLimits.maxAdded

  const handleAddToLibrary = async () => {
    if (!user || !course || adding || hasAddedViaThisInvite) return
    if (atAddedLimit) {
      setLimitDialogOpen(true)
      return
    }

    setAdding(true)
    try {
      const newCourseId = await copyCourseToUserLibrary(user.uid, courseId)

      const { updateDoc, doc, arrayUnion } = await import("firebase/firestore")
      const { db } = await import("@/lib/firebase")
      await updateDoc(doc(db, "chatMessages", messageId), {
        usedBy: arrayUnion(user.uid)
      })

      setHasAddedViaThisInvite(true)
      router.push(`/journey/${newCourseId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message.includes("added course limit")) {
        setLimitDialogOpen(true)
      } else {
        console.error("Error adding course to library:", error)
        alert("Failed to add course to library. Please try again.")
      }
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <div className="p-4 bg-muted rounded-lg animate-pulse w-48 h-24" />
  
  // If the course doesn't exist anymore, it's truly expired
  if (!course) {
    return (
      <Card className={`overflow-hidden border-2 opacity-60 grayscale-[0.5] ${isOwnMessage ? "border-primary/20 bg-primary/5" : "border-blue-500/20 bg-blue-500/5"}`}>
        <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
          <div className="rounded-full bg-muted p-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">Invitation Expired</p>
        </CardContent>
      </Card>
    )
  }

  // If the user already has the course in their library (from ANY source)
  if (course.userProgress) {
    return (
      <Card className={`overflow-hidden border-2 ${isOwnMessage ? "border-primary/20 bg-primary/5" : "border-blue-500/20 bg-blue-500/5"}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className={`h-4 w-4 ${isOwnMessage ? "text-primary" : "text-blue-500"}`} />
            <span className="font-bold text-sm">COURSE SHARED</span>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm truncate">{course.title}</h4>
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 py-2 rounded-md">
              <Check className="h-3 w-3" />
              <span>In Library</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If the user previously had the course but removed it AND already used THIS invitation
  if (hasAddedViaThisInvite) {
    return (
      <Card className={`overflow-hidden border-2 opacity-60 grayscale-[0.5] ${isOwnMessage ? "border-primary/20 bg-primary/5" : "border-blue-500/20 bg-blue-500/5"}`}>
        <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
          <div className="rounded-full bg-muted p-2">
            <Check className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">Invitation Already Used</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={`overflow-hidden border-2 ${isOwnMessage ? "border-primary/20 bg-primary/5" : "border-blue-500/20 bg-blue-500/5"}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className={`h-4 w-4 ${isOwnMessage ? "text-primary" : "text-blue-500"}`} />
            <span className="font-bold text-sm">COURSE SHARED</span>
          </div>
          
          <div className="space-y-2">
            {course.imageUrl && (
              <img 
                src={course.imageUrl} 
                alt={course.title}
                className="w-full h-32 object-cover rounded-md"
              />
            )}
            <div>
              <h4 className="font-semibold text-sm truncate">{course.title}</h4>
              {course.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {course.description}
                </p>
              )}
            </div>
          </div>

          {!isOwnMessage && (
            <Button
              size="sm"
              className="w-full text-xs gap-2 bg-blue-500 hover:bg-blue-600"
              onClick={handleAddToLibrary}
              disabled={adding}
            >
              <Plus className="h-3 w-3" />
              {adding ? "Adding..." : "Add to Library"}
            </Button>
          )}
        </CardContent>
      </Card>

      {courseLimits && (
        <CourseLimitDialog
          open={limitDialogOpen}
          onOpenChange={setLimitDialogOpen}
          type="added"
          limit={courseLimits.maxAdded}
          current={courseLimits.added}
          level={courseLimits.level}
        />
      )}
    </>
  )
}
