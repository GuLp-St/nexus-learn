"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { useXP } from "./xp-context-provider"

interface AuthContextType {
  user: User | null
  nickname: string | null
  avatarUrl: string | null
  theme: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { showXPAward } = useXP()
  const router = useRouter()

  const fetchUserProfile = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId))
      if (userDoc.exists()) {
        const data = userDoc.data()
        setNickname(data.nickname || null)
        setAvatarUrl(data.avatarUrl || null)
        setTheme(data.cosmetics?.theme || "theme-teal")
      } else {
        setNickname(null)
        setAvatarUrl(null)
        setTheme("theme-teal")
      }
    } catch (error) {
      console.error("Error fetching user profile:", error)
      setNickname(null)
      setAvatarUrl(null)
      setTheme("theme-teal")
    }
  }

  // Handle Cosmetic Theme Injection
  useEffect(() => {
    if (!theme) return

    const applyTheme = async () => {
      const { getCosmeticById } = await import("@/lib/cosmetics-utils")
      const cosmetic = await getCosmeticById(theme)
      
      const root = document.documentElement
      const body = document.body

      // Remove RGB class by default
      body.classList.remove("theme-rgb-chroma")

      if (theme === "theme-rgb") {
        body.classList.add("theme-rgb-chroma")
        // Reset primary to default while RGB is active to ensure fallback
        root.style.setProperty("--primary", "oklch(0.55 0.15 195)")
        return
      }

      if (cosmetic && cosmetic.category === "theme") {
        const config = cosmetic.config
        const isDark = root.classList.contains("dark")
        
        let primaryColor = config.primary
        
        if (theme === "theme-noir") {
          primaryColor = isDark ? config.primaryDark : config.primaryLight
        }

        if (primaryColor) {
          // If it's a hex code, we can just set it. 
          // Note: globals.css uses oklch, but CSS variables can be anything.
          root.style.setProperty("--primary", primaryColor)
          
          // We might want to set primary-foreground too for contrast
          if (theme === "theme-noir") {
            root.style.setProperty("--primary-foreground", isDark ? "#000000" : "#ffffff")
          } else {
            root.style.setProperty("--primary-foreground", "#ffffff")
          }
        } else {
          // Reset to default
          root.style.setProperty("--primary", "oklch(0.55 0.15 195)")
          root.style.setProperty("--primary-foreground", "oklch(1 0 0)")
        }
      } else {
        // Default Teal
        root.style.setProperty("--primary", "oklch(0.55 0.15 195)")
        root.style.setProperty("--primary-foreground", "oklch(1 0 0)")
      }
    }

    applyTheme()
    
    // Set up an observer for dark mode changes to re-apply theme if needed (especially for Noir)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          applyTheme()
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })

    return () => observer.disconnect()
  }, [theme])

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user)
      
      if (user) {
        // Real-time user profile updates
        unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data()
            setNickname(data.nickname || null)
            setAvatarUrl(data.avatarUrl || null)
            setTheme(data.cosmetics?.theme || "theme-teal")
          }
        })

        // Initialize presence system (set user online)
        const { initializePresence } = await import("@/lib/presence-utils")
        await initializePresence(user.uid).catch((error) => {
          console.error("Error initializing presence:", error)
        })
        
        // Check and award daily login XP
        const { checkAndAwardDailyLoginXP } = await import("@/lib/xp-utils")
        const result = await checkAndAwardDailyLoginXP(user.uid)
        if (result) {
          showXPAward(result)
        }

        // Check badges after daily login (early-bird badge)
        const { checkAndUpdateBadges } = await import("@/lib/badge-utils")
        await checkAndUpdateBadges(user.uid).catch((error) => {
          console.error("Error checking badges:", error)
          // Don't throw - badge check failure shouldn't block login
        })
      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile()
          unsubscribeProfile = undefined
        }
        setNickname(null)
        setAvatarUrl(null)
      }
      
      setLoading(false)
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeProfile) unsubscribeProfile()
      // Cleanup presence when component unmounts (user logs out)
      if (auth.currentUser) {
        const { cleanupPresence } = require("@/lib/presence-utils")
        cleanupPresence(auth.currentUser.uid).catch(console.error)
      }
    }
  }, [])

  const signOut = async () => {
    if (user) {
      // Set user offline before signing out
      const { cleanupPresence } = await import("@/lib/presence-utils")
      await cleanupPresence(user.uid).catch(console.error)
    }
    await firebaseSignOut(auth)
    setNickname(null)
    setAvatarUrl(null)
    setTheme(null)
    router.push("/auth")
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid)
    }
  }

  return (
    <AuthContext.Provider value={{ user, nickname, avatarUrl, theme, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

