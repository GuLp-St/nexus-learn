"use client"

import { useState } from "react"
import { LayoutDashboard, Trophy, Menu, X, User, Users, Moon, Sun, ShoppingBag, LogOut, Map, Shield, Globe, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTheme } from "@/components/theme-provider"
import { NotificationBell } from "@/components/notification-bell"
import { useSocialNotifications } from "@/hooks/use-social-notifications"
import { useClaimableQuestCount } from "@/hooks/use-claimable-quests"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { HoldToLogoutButton } from "@/components/hold-to-logout-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SidebarNavProps {
  currentPath?: string
  title?: string
  leftAction?: React.ReactNode
}

export function SidebarNav({ currentPath, title = "NexusLearn", leftAction }: SidebarNavProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { totalSocialNotifications } = useSocialNotifications()
  const { user, nickname, avatarUrl, signOut, isAdmin } = useAuth()
  const claimableQuests = useClaimableQuestCount(user?.uid)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await signOut()
      setLogoutDialogOpen(false)
    } catch (error) {
      console.error("Error signing out:", error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const navItems = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      href: "/",
      badge: claimableQuests > 0 ? claimableQuests : undefined,
    },
    { icon: Map, label: "Journey", href: "/journey" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard" },
    { icon: Users, label: "Social", href: "/friends", badge: totalSocialNotifications > 0 ? totalSocialNotifications : undefined },
    { icon: ShoppingBag, label: "Store", href: "/store" },
  ]

  const adminNavItems = isAdmin
    ? [
        { icon: Shield, label: "Users", href: "/admin/users" },
        { icon: Globe, label: "Community Courses", href: "/admin/courses" },
        { icon: KeyRound, label: "Keys", href: "/admin/keys" },
      ]
    : []

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center border-b border-border bg-background px-4 lg:hidden shrink-0">
        <div className="flex items-center shrink-0">
          {leftAction}
          <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <div className="ml-2 flex items-center gap-2 overflow-hidden min-w-0 flex-1">
          <img src="/icon.svg" alt="Nexon" className="h-7 w-7 shrink-0 object-contain" />
          <h1 className="text-lg font-semibold text-foreground truncate leading-none flex items-center">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell size="icon-sm" />
          <Link href="/profile">
            <Button variant="ghost" size="icon-sm">
              <User className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Desktop layout spacer — keeps main content aligned while aside stays fixed */}
      <div className="hidden lg:block w-64 shrink-0" aria-hidden />

      {/* Sidebar — fixed to viewport on all breakpoints */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-background transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Logo/Header */}
          <div className="flex h-16 shrink-0 items-center justify-start border-b border-border px-4 relative">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="Nexon" className="h-7 w-7 shrink-0 object-contain" />
              <h1 className="text-[1.1rem] font-bold tracking-tighter text-foreground whitespace-nowrap leading-none flex items-center">NexusLearn</h1>
              <div className="hidden lg:flex items-center gap-0.5 shrink-0">
                <NotificationBell align="left" size="icon-sm" />
                <Link href="/profile">
                  <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                    <User className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon-sm" className="h-8 w-8" onClick={toggleTheme}>
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden absolute right-4" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href}>
                <button
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative ${
                    currentPath === item.href
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <Badge variant="destructive" className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 min-w-[1.25rem] h-5 flex items-center justify-center text-[10px]">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              </Link>
            ))}
            {adminNavItems.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Admin
                  </span>
                </div>
                {adminNavItems.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <button
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        currentPath === item.href
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </button>
                  </Link>
                ))}
              </>
            )}
          </nav>

          <div className="shrink-0 border-t border-border p-4">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive border-dashed border-destructive/30" 
              onClick={() => setLogoutDialogOpen(true)}
            >
              <LogOut className="h-5 w-5" />
              <span>Log Out</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
            <DialogDescription>
              Press and hold the button below for 3 seconds to end your session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <HoldToLogoutButton disabled={isLoggingOut} onConfirm={handleLogout} />
            <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)} disabled={isLoggingOut} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default SidebarNav
