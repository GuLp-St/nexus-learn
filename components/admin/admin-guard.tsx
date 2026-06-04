"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { LoadingScreen } from "@/components/ui/LoadingScreen"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, adminLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !adminLoading) {
      if (!user) {
        router.replace("/auth")
      } else if (!isAdmin) {
        router.replace("/")
      }
    }
  }, [user, loading, isAdmin, adminLoading, router])

  if (loading || adminLoading) {
    return <LoadingScreen />
  }

  if (!user || !isAdmin) {
    return null
  }

  return <>{children}</>
}
