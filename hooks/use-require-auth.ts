"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"

/**
 * Wait for Firebase auth to resolve before redirecting unauthenticated users.
 * Prevents refresh from bouncing through /auth → / when user is still loading.
 */
export function useRequireAuth() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      if (typeof window !== "undefined") {
        const returnUrl = window.location.pathname + window.location.search
        sessionStorage.setItem("auth-return-url", returnUrl)
      }
      router.push("/auth")
    }
  }, [user, loading, router])

  return { user, loading, isAuthenticated: !!user && !loading }
}
