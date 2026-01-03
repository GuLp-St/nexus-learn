"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { sendMessage, subscribeToChatMessages, markMessagesAsRead, setTypingStatus, subscribeToTypingStatus, ChatMessage } from "@/lib/chat-utils"
import { useAuth } from "@/components/auth-provider"
import { format } from "date-fns"
import { Send, Check, CheckCheck, Zap, Trophy, Play, Share2, BookOpen, Plus, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ChallengeSelectionModal } from "./challenge-selection-modal"
import { CourseShareModal } from "./course-share-modal"
import { getChallenge, Challenge } from "@/lib/challenge-utils"
import { getCourseWithProgress, CourseWithProgress } from "@/lib/course-utils"
import { copyCourseToUserLibrary } from "@/lib/course-copy-utils"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface FriendChatModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendNickname: string
  friendAvatarUrl?: string
}

export function FriendChatModal({
  open,
  onOpenChange,
  friendId,
  friendNickname,
  friendAvatarUrl,
}: FriendChatModalProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [isFriendTyping, setIsFriendTyping] = useState(false)
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Scroll to bottom when messages or typing status changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isFriendTyping])

  // Subscribe to chat messages when modal opens
  useEffect(() => {
    if (!open || !user) return

    // Fetch initial messages and subscribe to real-time updates
    const unsubscribe = subscribeToChatMessages(
      user.uid,
      friendId,
      (updatedMessages) => {
        setMessages(updatedMessages)
      },
      50
    )

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

  // Mark messages as read when modal is open and messages change
  useEffect(() => {
    if (open && user && messages.length > 0) {
      const hasUnread = messages.some(m => m.receiverId === user.uid && !m.read)
      if (hasUnread) {
        markMessagesAsRead(user.uid, friendId).catch(console.error)
      }
    }
  }, [open, user, friendId, messages])

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
      <DialogContent className="flex h-[600px] max-h-[90vh] flex-col p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b px-6 py-4">
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => setIsShareModalOpen(true)}
              >
                <Share2 className="h-3 w-3" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => setIsChallengeModalOpen(true)}
              >
                <Zap className="h-3 w-3" />
                Challenge
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-accent/5"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwnMessage = message.senderId === user?.uid
              const messageDate = message.createdAt?.toDate() || new Date()

              return (
                <div
                  key={message.id}
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
              )
            })
          )}
          <div ref={messagesEndRef} />
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

        <ChallengeSelectionModal
          open={isChallengeModalOpen}
          onOpenChange={setIsChallengeModalOpen}
          friendId={friendId}
          friendNickname={friendNickname}
          inChat={true}
        />

        <CourseShareModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          friendId={friendId}
          friendNickname={friendNickname}
        />
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
  const [learningFirst, setLearningFirst] = useState(false)

  useEffect(() => {
    const fetchChallenge = async () => {
      const data = await getChallenge(challengeId)
      setChallenge(data)
      setLoading(false)
    }
    fetchChallenge()
  }, [challengeId])

  const handleLearnFirst = async () => {
    if (!user || !challenge) return

    setLearningFirst(true)
    try {
      const newCourseId = await copyCourseToUserLibrary(user.uid, challenge.courseId)
      router.push(`/courses/${newCourseId}`)
    } catch (error) {
      console.error("Error copying course:", error)
      alert("Failed to add course to library. Please try again.")
      setLearningFirst(false)
    }
  }

  if (loading) return <div className="p-4 bg-muted rounded-lg animate-pulse w-48 h-24" />
  if (!challenge) return null

  const isCompleted = challenge.status === "completed"
  const isPending = challenge.status === "pending" || challenge.status === "accepted"

  return (
    <Card className={`overflow-hidden border-2 ${isOwnMessage ? "border-primary/20 bg-primary/5" : "border-orange-500/20 bg-orange-500/5"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className={`h-4 w-4 ${isOwnMessage ? "text-primary" : "text-orange-500"}`} />
          <span className="font-bold text-sm">QUIZ CHALLENGE</span>
        </div>
        
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground capitalize">
            {challenge.quizType} Quiz
          </p>
          <p className="text-sm font-semibold truncate">
            {isOwnMessage ? `You challenged ${friendNickname}` : `${friendNickname} challenged you`}
          </p>
        </div>

        {isPending ? (
          isOwnMessage ? (
            <Link href={`/challenges/${challengeId}/waiting`}>
              <Button size="sm" variant="outline" className="w-full text-xs">
                View Status
              </Button>
            </Link>
          ) : (
            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-2"
                onClick={handleLearnFirst}
                disabled={learningFirst}
              >
                <BookOpen className="h-3 w-3" />
                {learningFirst ? "Adding..." : "Learn First"}
              </Button>
              <Link href={`/challenges/${challengeId}/quiz`}>
                <Button size="sm" className="w-full text-xs gap-2 bg-orange-500 hover:bg-orange-600">
                  <Play className="h-3 w-3" />
                  Accept Challenge
                </Button>
              </Link>
            </div>
          )
        ) : isCompleted ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400">
              <Trophy className="h-3 w-3" />
              <span>Challenge Completed</span>
            </div>
            <Link href={`/challenges/${challengeId}/waiting`}>
              <Button size="sm" variant="ghost" className="w-full text-xs">
                View Results
              </Button>
            </Link>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Challenge {challenge.status}</p>
        )}
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

  const handleAddToLibrary = async () => {
    if (!user || !course || adding || hasAddedViaThisInvite) return

    setAdding(true)
    try {
      // Add course to library
      const newCourseId = await copyCourseToUserLibrary(user.uid, courseId)
      
      // Mark this user as having used this specific invitation
      const { updateDoc, doc, arrayUnion } = await import("firebase/firestore")
      const { db } = await import("@/lib/firebase")
      await updateDoc(doc(db, "chatMessages", messageId), {
        usedBy: arrayUnion(user.uid)
      })

      setHasAddedViaThisInvite(true)
      router.push(`/courses/${newCourseId}`)
    } catch (error) {
      console.error("Error adding course to library:", error)
      alert("Failed to add course to library. Please try again.")
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
  )
}
