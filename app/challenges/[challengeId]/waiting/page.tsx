"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Trophy, Clock, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import SidebarNav from "@/components/sidebar-nav"
import { useAuth } from "@/components/auth-provider"
import { getChallenge, Challenge } from "@/lib/challenge-utils"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { NexonIcon } from "@/components/ui/nexon-icon"

export default function ChallengeWaitingPage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const challengeId = params.challengeId as string

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push("/auth")
      return
    }

    const loadChallenge = async () => {
      try {
        const challengeData = await getChallenge(challengeId)
        if (!challengeData) {
          router.push("/friends")
          return
        }

        // Verify user is part of this challenge
        if (challengeData.challengerId !== user.uid && challengeData.challengedId !== user.uid) {
          router.push("/friends")
          return
        }

        setChallenge(challengeData)
        setLoading(false)

        // Subscribe to real-time updates
        const challengeRef = doc(db, "challenges", challengeId)
        const unsubscribe = onSnapshot(challengeRef, (snapshot) => {
          if (snapshot.exists()) {
            setChallenge({
              id: snapshot.id,
              ...snapshot.data(),
            } as Challenge)
          }
        })

        return () => unsubscribe()
      } catch (error) {
        console.error("Error loading challenge:", error)
        router.push("/friends")
      }
    }

    if (user) {
      loadChallenge()
    }
  }, [challengeId, router, user, authLoading])

  const isChallenger = challenge?.challengerId === user?.uid
  const isCompleted = challenge?.status === "completed"
  const isPending = challenge?.status === "pending"
  const isAccepted = challenge?.status === "accepted"

  // Fetch user names
  const [challengerName, setChallengerName] = useState<string>("")
  const [challengedName, setChallengedName] = useState<string>("")

  useEffect(() => {
    const fetchNames = async () => {
      if (!challenge) return

      try {
        const { doc: getUserDoc, getDoc: getUserDocGet } = await import("firebase/firestore")
        const [challengerDoc, challengedDoc] = await Promise.all([
          getUserDocGet(getUserDoc(db, "users", challenge.challengerId)),
          getUserDocGet(getUserDoc(db, "users", challenge.challengedId)),
        ])

        setChallengerName(challengerDoc.data()?.nickname || "Someone")
        setChallengedName(challengedDoc.data()?.nickname || "Someone")
      } catch (error) {
        console.error("Error fetching user names:", error)
      }
    }

    fetchNames()
  }, [challenge])

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading challenge...</p>
        </div>
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Challenge not found</p>
          <Link href="/friends">
            <Button>Go to Friends</Button>
          </Link>
        </div>
      </div>
    )
  }

  // If challenger and challenge is pending, show waiting message with their score
  if (isChallenger && isPending) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-6">
              <div className="rounded-full bg-primary/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Challenge Sent!</h2>
                <p className="text-muted-foreground">
                  You scored <strong>{challenge.challengerScore}/{challenge.questionIds.length}</strong> in <strong>{Math.floor(challenge.challengerTime / 60)}:{(challenge.challengerTime % 60).toString().padStart(2, "0")}</strong>.
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Waiting for {challengedName} to accept and take the quiz...
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={() => router.push('/friends')}>
                  Back to Social
                </Button>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">or</p>
                <p className="text-xs text-muted-foreground">Stay here to see real-time results!</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // If challenged user and challenge is pending, show accept option (should redirect to quiz, but show message if somehow here)
  if (!isChallenger && isPending) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-6">
              <div className="rounded-full bg-primary/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Challenge Pending</h2>
                <p className="text-muted-foreground">
                  Please check your notifications to accept the challenge.
                </p>
              </div>
              <Link href="/friends">
                <Button className="w-full">Go to Friends</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // If challenger and challenge is accepted, show waiting for completion
  if (isChallenger && isAccepted) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-6">
              <div className="rounded-full bg-primary/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Challenge in Progress</h2>
                <p className="text-muted-foreground">
                  {challengedName} is taking the quiz. Results will appear here when they finish.
                </p>
              </div>
              <Link href="/friends">
                <Button variant="outline" className="w-full">Go to Friends</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // Show results if completed
  if (isCompleted && challenge.challengerScore !== null && challenge.challengedScore !== null && challenge.winnerId) {
    const userScore = isChallenger ? challenge.challengerScore : challenge.challengedScore
    const opponentScore = isChallenger ? challenge.challengedScore : challenge.challengerScore
    const userTime = (isChallenger ? challenge.challengerTime : challenge.challengedTime) ?? 0
    const opponentTime = (isChallenger ? challenge.challengedTime : challenge.challengerTime) ?? 0
    const userWon = challenge.winnerId === user?.uid
    const opponentName = isChallenger ? challengedName : challengerName

    return (
      <div className="flex flex-col lg:flex-row min-h-screen bg-background">
        <SidebarNav currentPath="/friends" />
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Link href="/friends">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Challenge Results</h1>
            </div>

            {/* Results Card */}
            <Card>
              <CardContent className="p-8 space-y-6">
                {/* Winner Badge */}
                <div className={`text-center p-6 rounded-lg ${userWon ? "bg-green-500/10" : "bg-muted"}`}>
                  <Trophy className={`h-12 w-12 mx-auto mb-4 ${userWon ? "text-yellow-500" : "text-muted-foreground"}`} />
                  <h2 className="text-3xl font-bold mb-2">
                    {userWon ? "You Won!" : `${opponentName} Won`}
                  </h2>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {userWon
                        ? "Congratulations on your victory!"
                        : "Better luck next time!"}
                    </p>
                    {challenge.betAmount > 0 && userWon && (
                      <div className="flex items-center justify-center gap-2 text-primary font-bold animate-bounce mt-2">
                        <span>You won the pot:</span>
                        <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                          <NexonIcon className="h-5 w-5" />
                          <span>{challenge.betAmount * 2} Nexon</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scores Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Your Score */}
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Your Score</p>
                    <div className={`text-2xl font-bold ${userWon ? "text-green-500" : "text-foreground"}`}>
                      {userScore}/{challenge.questionIds.length}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {Math.floor(userTime / 60)}:{(userTime % 60).toString().padStart(2, "0")}
                    </div>
                  </div>

                  {/* Opponent Score */}
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{opponentName}'s Score</p>
                    <div className={`text-2xl font-bold ${!userWon ? "text-green-500" : "text-foreground"}`}>
                      {opponentScore}/{challenge.questionIds.length}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {Math.floor(opponentTime / 60)}:{(opponentTime % 60).toString().padStart(2, "0")}
                    </div>
                  </div>
                </div>

                <Link href="/friends">
                  <Button className="w-full">Back to Friends</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Spinner className="h-8 w-8 mx-auto" />
        <p className="text-muted-foreground">Loading challenge status...</p>
      </div>
    </div>
  )
}

