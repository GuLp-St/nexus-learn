"use client"

import { useState } from "react"
import { LayoutDashboard, FileQuestion, Trophy, Menu, X, Library, User, Users, Moon, Sun, ShoppingBag, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTheme } from "@/components/theme-provider"
import { NotificationBell } from "@/components/notification-bell"
import { useSocialNotifications } from "@/hooks/use-social-notifications"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
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

export function SidebarNav({ currentPath, title = "LearnHub", leftAction }: SidebarNavProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { totalSocialNotifications } = useSocialNotifications()
  const { signOut } = useAuth()

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
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Library, label: "Library", href: "/library" },
    { icon: FileQuestion, label: "Quizzes", href: "/quizzes" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard" },
    { icon: Users, label: "Social", href: "/friends", badge: totalSocialNotifications > 0 ? totalSocialNotifications : undefined },
    { icon: ShoppingBag, label: "Store", href: "/store" },
  ]

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center border-b border-border bg-background px-4 lg:hidden shrink-0">
        {leftAction || (
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h1 className="ml-3 text-lg font-semibold text-foreground truncate">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <Link href="/friends">
            <Button variant="ghost" size="icon" className="relative">
              <Users className="h-5 w-5" />
              {totalSocialNotifications > 0 && (
                <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-[8px] flex items-center justify-center">
                  {totalSocialNotifications}
                </Badge>
              )}
            </Button>
          </Link>
          <Link href="/profile">
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-background transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:flex lg:flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">LearnHub</h1>
              <div className="flex items-center gap-1">
                <NotificationBell align="left" />
                <Link href="/profile">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
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
          </nav>

          <div className="border-t border-border p-4">
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
              Are you sure you want to log out of your account? Your current session will be ended.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)} disabled={isLoggingOut}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? "Logging out..." : "Log Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default SidebarNav
