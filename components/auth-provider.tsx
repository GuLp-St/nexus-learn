"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { useXP } from "./xp-context-provider"

interface AuthContextType {
  user: User | null
  nickname: string | null
  avatarUrl: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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
      } else {
        setNickname(null)
        setAvatarUrl(null)
      }
    } catch (error) {
      console.error("Error fetching user profile:", error)
      setNickname(null)
      setAvatarUrl(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)
      
      if (user) {
        // Fetch user profile from Firestore
        await fetchUserProfile(user.uid)
        
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
        setNickname(null)
        setAvatarUrl(null)
      }
      
      setLoading(false)
    })

    return () => {
      unsubscribe()
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
    router.push("/auth")
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid)
    }
  }

  return (
    <AuthContext.Provider value={{ user, nickname, avatarUrl, loading, signOut, refreshProfile }}>
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

