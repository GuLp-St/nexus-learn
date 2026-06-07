"use client"

import { useState, useEffect } from "react"
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/auth-provider"
import { resetCosmeticTheme } from "@/lib/cosmetic-theme-reset"
import { usePageContext } from "@/hooks/usePageContext"
import { LoadingScreen } from "@/components/ui/LoadingScreen"

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [nickname, setNickname] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const { user, loading } = useAuth()

  usePageContext({
    title: activeTab === "signin" ? "Sign In" : "Sign Up",
    description:
      activeTab === "signin"
        ? "The user is on the sign-in page. They can log in with email and password. Help with login issues, password requirements, or what NexusLearn offers after signing in."
        : "The user is on the registration page. They need a nickname, email, password (min 6 characters), and password confirmation. Help with account creation, nickname rules, or getting started.",
    pageData: {
      pageType: "auth",
      activeTab,
      fields:
        activeTab === "signin"
          ? ["email", "password"]
          : ["nickname", "email", "password", "confirmPassword"],
      ...(error ? { lastError: error } : {}),
    },
    suggestedChips:
      activeTab === "signin"
        ? ["How do I create an account?", "What is NexusLearn?"]
        : ["What should my nickname be?", "What happens after I sign up?"],
  })

  // Reset cosmetic theme on auth page (no user theme on sign-in/register)
  useEffect(() => {
    if (!loading && !user) {
      resetCosmeticTheme()
    }
  }, [user, loading])

  // Redirect if already logged in — restore previous page when possible
  useEffect(() => {
    if (!loading && user) {
      const returnUrl = sessionStorage.getItem("auth-return-url")
      sessionStorage.removeItem("auth-return-url")
      router.push(returnUrl && returnUrl !== "/auth" ? returnUrl : "/")
    }
  }, [user, loading, router])

  // Show loading state
  if (loading) {
    return <LoadingScreen />
  }

  // Don't render if already authenticated (will redirect)
  if (user) {
    return null
  }

  const handleGoogleAuth = async () => {
    setError("")
    setIsSubmitting(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const gUser = result.user
      const userRef = doc(db, "users", gUser.uid)
      const existing = await getDoc(userRef)

      if (!existing.exists()) {
        if (activeTab === "signup" && !nickname.trim()) {
          setError("Choose a nickname to complete sign up with Google")
          setIsSubmitting(false)
          return
        }
        await setDoc(userRef, {
          nickname: nickname.trim() || gUser.displayName?.split(" ")[0] || "Learner",
          email: gUser.email,
          xp: 0,
          dailyLoginStreak: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        const { checkAndAwardDailyLoginXP } = await import("@/lib/xp-utils")
        await checkAndAwardDailyLoginXP(gUser.uid)
      }

      const returnUrl = sessionStorage.getItem("auth-return-url")
      sessionStorage.removeItem("auth-return-url")
      router.push(returnUrl && returnUrl !== "/auth" ? returnUrl : "/")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      const returnUrl = sessionStorage.getItem("auth-return-url")
      sessionStorage.removeItem("auth-return-url")
      router.push(returnUrl && returnUrl !== "/auth" ? returnUrl : "/")
    } catch (err: any) {
      setError(err.message || "Failed to sign in")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!nickname.trim()) {
      setError("Nickname is required")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsSubmitting(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Store nickname and initialize XP in Firestore
      await setDoc(doc(db, "users", user.uid), {
        nickname: nickname.trim(),
        email: user.email,
        xp: 0,
        dailyLoginStreak: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Award first daily login XP
      const { checkAndAwardDailyLoginXP } = await import("@/lib/xp-utils")
      await checkAndAwardDailyLoginXP(user.uid)

      router.push("/")
    } catch (err: any) {
      setError(err.message || "Failed to sign up")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome to LearnHub</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account or create a new one to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-border mb-6">
            <button
              onClick={() => {
                setActiveTab("signin")
                setError("")
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "signin"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab("signup")
                setError("")
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "signup"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Google Sign In */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={isSubmitting}
              onClick={handleGoogleAuth}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>
          </div>

          {/* Sign In Form */}
          {activeTab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="signin-email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signin-password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          )}

          {/* Sign Up Form */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="signup-nickname" className="text-sm font-medium text-foreground">
                  Nickname
                </label>
                <Input
                  id="signup-nickname"
                  type="text"
                  placeholder="Choose a nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                  Confirm Password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

