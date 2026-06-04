"use client"

import { useCallback, useEffect, useState } from "react"
import { Search, Shield, Trash2, UserCog, Zap, Coins, BookOpen } from "lucide-react"
import {
  AdminCourseProgressControls,
  type AdminCourseProgress,
} from "@/components/admin/admin-course-progress-controls"
import { AdminUserExtrasPanel } from "@/components/admin/admin-user-extras-panel"
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)

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
      const data = await adminJson<{ user: UserRow; courses: UserCourse[] }>(
        `/api/admin/users/${userId}`
      )
      setEditXp(String(data.user.xp))
      setEditNexon(String(data.user.nexon))
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
      toast.success("User updated")
      await loadDetail(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
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
      <div className="flex min-h-screen bg-background">
        <SidebarNav currentPath="/admin/users" title="Admin — Users" />
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">User management</h1>
              <p className="text-muted-foreground text-sm mt-1">
                View and edit accounts, balances, course progress, or delete users.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1 max-w-md">
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

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserCog className="h-5 w-5" />
                    {selected ? selected.nickname || "User detail" : "Select a user"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedId && (
                    <p className="text-sm text-muted-foreground">Choose a user from the list.</p>
                  )}
                  {selectedId && detailLoading && (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  )}
                  {selected && !detailLoading && (
                    <div className="space-y-6">
                      <p className="text-xs font-mono text-muted-foreground break-all">{selected.id}</p>

                      <div className="grid grid-cols-2 gap-4">
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

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={saveBalances} disabled={saving}>
                          <Coins className="h-4 w-4 mr-2" />
                          Save balances
                        </Button>
                        <Button variant="outline" onClick={toggleAdmin} disabled={saving}>
                          <Shield className="h-4 w-4 mr-2" />
                          {selected.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => setDeleteOpen(true)}
                          disabled={saving}
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
