"use client"

import { useCallback, useEffect, useState } from "react"
import { Search, Shield, Trash2, UserCog, Zap, Coins, BookOpen, VenetianMask, RefreshCw, Gem, Sparkles } from "lucide-react"
import {
  AdminCourseProgressControls,
  type AdminCourseProgress,
} from "@/components/admin/admin-course-progress-controls"
import { AdminUserExtrasPanel } from "@/components/admin/admin-user-extras-panel"
import { startImpersonation } from "@/lib/admin-impersonation-client"
import SidebarNav from "@/components/sidebar-nav"
import { AdminGuard } from "@/components/admin/admin-guard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminJson } from "@/lib/admin-api-client"
import { toast } from "sonner"
import { NexonIcon } from "@/components/ui/nexon-icon"

type UserRow = {
  id: string
  nickname: string | null
  email: string | null
  xp: number
  nexon: number
  role: string | null
}

type UserCourse = AdminCourseProgress & { isPublic: boolean }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [editXp, setEditXp] = useState("")
  const [editNexon, setEditNexon] = useState("")
  const [editQuestTokens, setEditQuestTokens] = useState("3")
  const [editStyleShards, setEditStyleShards] = useState("0")
  const [editFreeCaches, setEditFreeCaches] = useState("0")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""
      const data = await adminJson<{ users: UserRow[] }>(`/api/admin/users${q}`)
      setUsers(data.users)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const loadDetail = async (userId: string) => {
    setSelectedId(userId)
    setDetailLoading(true)
    try {
      const data = await adminJson<{
        user: UserRow & {
          questRefreshTokens?: number | null
          styleShards?: number
          freeNexusCaches?: number
        }
        courses: UserCourse[]
      }>(
        `/api/admin/users/${userId}`
      )
      setEditXp(String(data.user.xp))
      setEditNexon(String(data.user.nexon))
      setEditQuestTokens(
        data.user.questRefreshTokens != null ? String(data.user.questRefreshTokens) : "3"
      )
      setEditStyleShards(String(data.user.styleShards ?? 0))
      setEditFreeCaches(String(data.user.freeNexusCaches ?? 0))
      setCourses(data.courses)
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u))
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load user")
    } finally {
      setDetailLoading(false)
    }
  }

  const saveBalances = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await adminJson(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        body: {
          xp: parseInt(editXp, 10),
          nexon: parseInt(editNexon, 10),
        },
      })
      toast.success("Balances updated")
      await loadDetail(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const saveStyleShards = async () => {
    if (!selectedId) return
    const shards = parseInt(editStyleShards, 10)
    const freeCaches = parseInt(editFreeCaches, 10)
    if (Number.isNaN(shards) || shards < 0) {
      toast.error("Style Shards must be 0 or greater")
      return
    }
    if (Number.isNaN(freeCaches) || freeCaches < 0) {
      toast.error("Free Nexus Caches must be 0 or greater")
      return
    }
    setSaving(true)
    try {
      await adminJson(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        body: { styleShards: shards, freeNexusCaches: freeCaches },
      })
      toast.success("Style Shards updated")
      await loadDetail(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const saveQuestTokens = async () => {
    if (!selectedId) return
    const tokens = parseInt(editQuestTokens, 10)
    if (Number.isNaN(tokens) || tokens < 0 || tokens > 3) {
      toast.error("Quest refresh tokens must be 0–3")
      return
    }
    setSaving(true)
    try {
      await adminJson(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        body: { questRefreshTokens: tokens },
      })
      toast.success("Quest refresh tokens updated")
      await loadDetail(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const toggleAdmin = async () => {
    if (!selectedId) return
    const current = users.find((u) => u.id === selectedId)
    const makeAdmin = current?.role !== "admin"
    setSaving(true)
    try {
      await adminJson(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        body: { role: makeAdmin ? "admin" : null },
      })
      toast.success(makeAdmin ? "Granted admin" : "Removed admin")
      await loadDetail(selectedId)
      await loadUsers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  const handleImpersonate = async () => {
    if (!selectedId) return
    setImpersonating(true)
    try {
      await startImpersonation(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonation failed")
      setImpersonating(false)
    }
  }

  const deleteUser = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await adminJson(`/api/admin/users/${selectedId}`, { method: "DELETE" })
      toast.success("User deleted")
      setSelectedId(null)
      setDeleteOpen(false)
      await loadUsers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setSaving(false)
    }
  }

  const selected = users.find((u) => u.id === selectedId)

  return (
    <AdminGuard>
      <div className="flex flex-col min-h-screen bg-background lg:flex-row">
        <SidebarNav currentPath="/admin/users" title="Admin — Users" />
        <main className="flex-1 min-w-0 overflow-auto p-4 lg:p-8">
          <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">User management</h1>
              <p className="text-muted-foreground text-sm mt-1">
                View and edit accounts, balances, course progress, or delete users.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 min-w-0 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search nickname, email, or UID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                />
              </div>
              <Button variant="secondary" onClick={loadUsers}>
                Search
              </Button>
            </div>

            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">Users</CardTitle>
                  <CardDescription>{loading ? "Loading…" : `${users.length} shown`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => loadDetail(u.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        selectedId === u.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-medium truncate min-w-0 flex-1">
                          {u.nickname || u.email || u.id.slice(0, 8)}
                        </span>
                        {u.role === "admin" && (
                          <Badge variant="secondary" className="shrink-0">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {u.email || u.id}
                      </p>
                    </button>
                  ))}
                  {!loading && users.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No users found</p>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 min-w-0">
                    <UserCog className="h-5 w-5 shrink-0" />
                    <span className="truncate">
                      {selected ? selected.nickname || "User detail" : "Select a user"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                  {!selectedId && (
                    <p className="text-sm text-muted-foreground">Choose a user from the list.</p>
                  )}
                  {selectedId && detailLoading && (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  )}
                  {selected && !detailLoading && (
                    <div className="space-y-6">
                      <p className="text-xs font-mono text-muted-foreground break-all">{selected.id}</p>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="admin-xp" className="flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" /> XP
                          </Label>
                          <Input
                            id="admin-xp"
                            type="number"
                            value={editXp}
                            onChange={(e) => setEditXp(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="admin-nexon" className="flex items-center gap-1">
                            <NexonIcon className="h-3.5 w-3.5" /> Nexon
                          </Label>
                          <Input
                            id="admin-nexon"
                            type="number"
                            value={editNexon}
                            onChange={(e) => setEditNexon(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <Label htmlFor="admin-quest-tokens" className="flex items-center gap-1">
                            <RefreshCw className="h-3.5 w-3.5" /> Quest refresh tokens (0–3)
                          </Label>
                          <Input
                            id="admin-quest-tokens"
                            type="number"
                            min={0}
                            max={3}
                            value={editQuestTokens}
                            onChange={(e) => setEditQuestTokens(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <Button variant="outline" onClick={saveQuestTokens} disabled={saving}>
                          Save tokens
                        </Button>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <Label htmlFor="admin-style-shards" className="flex items-center gap-1">
                            <Gem className="h-3.5 w-3.5" /> Style Shards
                          </Label>
                          <Input
                            id="admin-style-shards"
                            type="number"
                            min={0}
                            value={editStyleShards}
                            onChange={(e) => setEditStyleShards(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="admin-free-caches" className="flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" /> Free Nexus Caches
                          </Label>
                          <Input
                            id="admin-free-caches"
                            type="number"
                            min={0}
                            value={editFreeCaches}
                            onChange={(e) => setEditFreeCaches(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <Button variant="outline" onClick={saveStyleShards} disabled={saving}>
                          Save shards
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button onClick={saveBalances} disabled={saving} className="w-full">
                          <Coins className="h-4 w-4 mr-2" />
                          Save balances
                        </Button>
                        <Button variant="outline" onClick={toggleAdmin} disabled={saving} className="w-full">
                          <Shield className="h-4 w-4 mr-2" />
                          {selected.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                        {selected.role !== "admin" && (
                          <Button
                            variant="outline"
                            onClick={handleImpersonate}
                            disabled={saving || impersonating}
                            className="w-full"
                          >
                            <VenetianMask className="h-4 w-4 mr-2" />
                            {impersonating ? "Starting…" : "Impersonate"}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          onClick={() => setDeleteOpen(true)}
                          disabled={saving}
                          className="w-full"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete account
                        </Button>
                      </div>

                      <div>
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          Journey courses ({courses.length})
                        </h3>
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                          {courses.map((c) => (
                            <div key={c.courseId}>
                              {c.isPublic && (
                                <Badge variant="secondary" className="text-xs mb-1">
                                  Published
                                </Badge>
                              )}
                              {selectedId && (
                                <AdminCourseProgressControls
                                  userId={selectedId}
                                  course={c}
                                  onUpdated={() => loadDetail(selectedId)}
                                />
                              )}
                            </div>
                          ))}
                          {courses.length === 0 && (
                            <p className="text-sm text-muted-foreground">No courses in library</p>
                          )}
                        </div>
                      </div>

                      {selectedId && (
                        <AdminUserExtrasPanel userId={selectedId} />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user permanently?</DialogTitle>
            <DialogDescription>
              This removes their Firebase account, profile, and library entries. Private courses
              they solely own are deleted too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteUser} disabled={saving}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminGuard>
  )
}
