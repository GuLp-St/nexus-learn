"use client"

import { useState, useEffect } from "react"
import { Search, Users, MessageCircle, Zap, Check, XIcon, Trophy, UserPlus, UserMinus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AvatarWithCosmetics } from "@/components/avatar-with-cosmetics"
import { NameWithColor } from "@/components/name-with-color"
import { Badge } from "@/components/ui/badge"
import { SidebarNav } from "@/components/sidebar-nav"
import { useChatContext } from "@/context/ChatContext"
import { useAuth } from "@/components/auth-provider"
import { getFriends, getFriendRequests, acceptFriendRequest, rejectFriendRequest, searchUsers, removeFriend, FriendInfo, FriendRequestInfo } from "@/lib/friends-utils"
import { FriendChatModal } from "@/components/friend-chat-modal"
import Link from "next/link"
import { Spinner } from "@/components/ui/spinner"
import { subscribeToChatMessages, ChatMessage } from "@/lib/chat-utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ... (rest of imports)

export default function SocialPage() {
  const { user } = useAuth()
  const { setPageContext } = useChatContext()
  
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "search">("friends")
  const [unreadMessagesMap, setUnreadMessagesMap] = useState<Record<string, number>>({})
  
  const [friends, setFriends] = useState<FriendInfo[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequestInfo[]>([])
  const [searchResults, setSearchResults] = useState<FriendRequestInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  
  const [selectedFriend, setSelectedFriend] = useState<{ id: string; nickname: string; avatarUrl?: string } | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [unfriendDialog, setUnfriendDialog] = useState<{ open: boolean; friendId: string | null; friendNickname: string }>({
    open: false,
    friendId: null,
    friendNickname: "",
  })
  const [unfriending, setUnfriending] = useState(false)

  // Subscribe to all chat messages to track unread counts for friends
  useEffect(() => {
    if (!user || friends.length === 0) return

    const unsubscribes = friends.map(friend => {
      return subscribeToChatMessages(user.uid, friend.userId, (messages) => {
        const unreadCount = messages.filter(m => m.receiverId === user.uid && !m.read).length
        setUnreadMessagesMap(prev => ({
          ...prev,
          [friend.userId]: unreadCount
        }))
      })
    })

    return () => {
      unsubscribes.forEach(unsub => unsub())
    }
  }, [user, friends])

  // Fetch friends and friend requests
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const [friendsData, requestsData] = await Promise.all([
          getFriends(user.uid),
          getFriendRequests(user.uid),
        ])
        setFriends(friendsData)
        setFriendRequests(requestsData)
      } catch (error) {
        console.error("Error fetching friends data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  // Search users
  useEffect(() => {
    if (!user || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        setSearchLoading(true)
        const results = await searchUsers(searchQuery, user.uid)
        setSearchResults(results)
      } catch (error) {
        console.error("Error searching users:", error)
      } finally {
        setSearchLoading(false)
      }
    }, 300) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchQuery, user])

  // Set chatbot context with real-time social data
  useEffect(() => {
    if (user) {
      setPageContext({
        title: "Social",
        description: `Social page showing ${friends.length} friends and ${friendRequests.length} pending friend requests. The user can connect with friends, send challenges, and see what their friends are learning. The user can ask about friends, challenges, or social features.`,
        data: {
          friendsCount: friends.length,
          friendRequestsCount: friendRequests.length,
          friends: friends.map((friend) => ({
            friendId: friend.userId,
            nickname: friend.nickname,
            avatarUrl: friend.avatarUrl,
            isOnline: friend.isOnline,
          })),
          friendRequests: friendRequests.map((request) => ({
            requesterId: request.userId,
            requesterNickname: request.nickname,
            requesterAvatarUrl: request.avatarUrl,
          })),
        },
      })
    }
  }, [user, friends, friendRequests, setPageContext])

  const handleAcceptRequest = async (requesterId: string) => {
    if (!user) return

    try {
      await acceptFriendRequest(user.uid, requesterId)
      // Refresh data
      const [friendsData, requestsData] = await Promise.all([
        getFriends(user.uid),
        getFriendRequests(user.uid),
      ])
      setFriends(friendsData)
      setFriendRequests(requestsData)
    } catch (error) {
      console.error("Error accepting friend request:", error)
    }
  }

  const handleRejectRequest = async (requesterId: string) => {
    if (!user) return

    try {
      await rejectFriendRequest(user.uid, requesterId)
      // Refresh requests
      const requestsData = await getFriendRequests(user.uid)
      setFriendRequests(requestsData)
    } catch (error) {
      console.error("Error rejecting friend request:", error)
    }
  }

  const handleOpenChat = (friend: FriendInfo) => {
    setSelectedFriend({
      id: friend.userId,
      nickname: friend.nickname,
      avatarUrl: friend.avatarUrl,
    })
    setChatOpen(true)
  }

  const handleUnfriendClick = (friend: FriendInfo) => {
    setUnfriendDialog({
      open: true,
      friendId: friend.userId,
      friendNickname: friend.nickname,
    })
  }

  const handleUnfriendConfirm = async () => {
    if (!user || !unfriendDialog.friendId) return

    try {
      setUnfriending(true)
      await removeFriend(user.uid, unfriendDialog.friendId)
      // Refresh friends list
      const friendsData = await getFriends(user.uid)
      setFriends(friendsData)
      setUnfriendDialog({ open: false, friendId: null, friendNickname: "" })
    } catch (error) {
      console.error("Error removing friend:", error)
      alert("Failed to remove friend")
    } finally {
      setUnfriending(false)
    }
  }

  const filteredFriends = friends.filter(
    (friend) =>
      friend.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex flex-col min-h-screen bg-background lg:flex-row">
      <SidebarNav currentPath="/friends" title="Social" />

      {/* Main Content */}
      <main className="flex-1">
        {/* Content Area */}
        <div className="p-4 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Social</h2>
              <p className="text-muted-foreground">Connect with friends and challenge each other to learn together</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border">
              <button
                onClick={() => setActiveTab("friends")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "friends"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Friends ({friends.length})
              </button>
              <button
                onClick={() => setActiveTab("requests")}
                className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "requests"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pending Requests
                {friendRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                    {friendRequests.length}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab("search")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "search"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Find Friends
              </button>
            </div>

            {/* Friends Tab */}
            {activeTab === "friends" && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Friends List */}
                {loading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="h-8 w-8" />
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-center text-muted-foreground">
                        {searchQuery ? "No friends found" : "No friends yet. Start adding friends!"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredFriends.map((friend) => (
                      <Card key={friend.userId} className="transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {/* Avatar with Status */}
                            <div className="relative">
                              <Link href={`/profile/${friend.userId}`}>
                                <AvatarWithCosmetics
                                  userId={friend.userId}
                                  nickname={friend.nickname}
                                  avatarUrl={friend.avatarUrl}
                                  size="lg"
                                />
                              </Link>
                              <div
                                className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background ${
                                  friend.isOnline ? "bg-green-500" : "bg-gray-400"
                                }`}
                              />
                            </div>

                            {/* Friend Info */}
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Link href={`/profile/${friend.userId}`}>
                                  <h3 className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer">
                                    <NameWithColor
                                      userId={friend.userId}
                                      name={friend.nickname}
                                    />
                                  </h3>
                                </Link>
                              </div>
                              {friend.currentCourse && (
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  Currently learning: {friend.currentCourse}
                                </p>
                              )}
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-sm font-medium text-primary">
                                  <Trophy className="h-4 w-4" />
                                  <span>{friend.xp.toLocaleString()} XP</span>
                                </div>
                                <span className="text-sm text-muted-foreground">Level {friend.level}</span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                title="Send message"
                                onClick={() => handleOpenChat(friend)}
                                className="relative"
                              >
                                <MessageCircle className="h-4 w-4" />
                                {unreadMessagesMap[friend.userId] > 0 && (
                                  <Badge variant="destructive" className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center border-2 border-background">
                                    {unreadMessagesMap[friend.userId]}
                                  </Badge>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                title="Remove friend"
                                onClick={() => handleUnfriendClick(friend)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Friend Requests Tab */}
            {activeTab === "requests" && (
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="h-8 w-8" />
                  </div>
                ) : friendRequests.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-center text-muted-foreground">No pending friend requests</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {friendRequests.map((request) => (
                      <Card key={request.userId} className="transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <Link href={`/profile/${request.userId}`}>
                              <AvatarWithCosmetics
                                userId={request.userId}
                                nickname={request.nickname}
                                avatarUrl={request.avatarUrl}
                                size="lg"
                              />
                            </Link>

                            {/* Request Info */}
                            <div className="flex-1 space-y-1">
                              <Link href={`/profile/${request.userId}`}>
                                <h3 className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer">
                                  {request.nickname}
                                </h3>
                              </Link>
                              {request.mutualFriends !== undefined && request.mutualFriends > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  {request.mutualFriends} mutual {request.mutualFriends === 1 ? "friend" : "friends"}
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleAcceptRequest(request.userId)}
                              >
                                <Check className="h-4 w-4" />
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 bg-transparent"
                                onClick={() => handleRejectRequest(request.userId)}
                              >
                                <XIcon className="h-4 w-4" />
                                Decline
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Find Friends Tab */}
            {activeTab === "search" && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by username (min 2 characters)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Search Results */}
                {searchLoading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="h-8 w-8" />
                  </div>
                ) : searchQuery.trim().length < 2 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-center text-muted-foreground">Type at least 2 characters to search</p>
                    </CardContent>
                  </Card>
                ) : searchResults.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-center text-muted-foreground">No users found</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {searchResults.map((searchUser) => (
                      <Card key={searchUser.userId} className="transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <Link href={`/profile/${searchUser.userId}`}>
                              <AvatarWithCosmetics
                                userId={searchUser.userId}
                                nickname={searchUser.nickname}
                                avatarUrl={searchUser.avatarUrl}
                                size="lg"
                              />
                            </Link>

                            {/* User Info */}
                            <div className="flex-1">
                              <Link href={`/profile/${searchUser.userId}`}>
                                <h3 className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer">
                                  {searchUser.nickname}
                                </h3>
                              </Link>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1"
                                onClick={async () => {
                                  if (!user) return
                                  try {
                                    const { sendFriendRequest } = await import("@/lib/friends-utils")
                                    await sendFriendRequest(user.uid, searchUser.userId)
                                    // Refresh search results
                                    const results = await searchUsers(searchQuery, user.uid)
                                    setSearchResults(results)
                                  } catch (error: any) {
                                    console.error("Error sending friend request:", error)
                                    alert(error.message || "Failed to send friend request")
                                  }
                                }}
                              >
                                <UserPlus className="h-4 w-4" />
                                Add Friend
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Chat Modal */}
      {selectedFriend && (
        <FriendChatModal
          open={chatOpen}
          onOpenChange={setChatOpen}
          friendId={selectedFriend.id}
          friendNickname={selectedFriend.nickname}
          friendAvatarUrl={selectedFriend.avatarUrl}
        />
      )}

      {/* Unfriend Confirmation Dialog */}
      <Dialog open={unfriendDialog.open} onOpenChange={(open) => setUnfriendDialog({ open, friendId: null, friendNickname: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Friend</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{unfriendDialog.friendNickname}</strong> from your friends list? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnfriendDialog({ open: false, friendId: null, friendNickname: "" })}
              disabled={unfriending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnfriendConfirm}
              disabled={unfriending}
            >
              {unfriending ? "Removing..." : "Remove Friend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
