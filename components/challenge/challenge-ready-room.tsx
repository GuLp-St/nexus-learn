"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Challenge } from "@/lib/challenge-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { Zap, Clock, AlertTriangle, Loader2 } from "lucide-react"

interface ChallengeReadyRoomProps {
  challenge: Challenge
  isChallenger: boolean
  friendNickname: string
  courseTitle: string
  starting: boolean
  onStart: () => void
  onBack: () => void
}

export function ChallengeReadyRoom({
  challenge,
  isChallenger,
  friendNickname,
  courseTitle,
  starting,
  onStart,
  onBack,
}: ChallengeReadyRoomProps) {
  const needsAccept = !isChallenger && challenge.status === "pending"
  const bet = challenge.betAmount || 0
  const quizLabel =
    challenge.quizType === "course"
      ? "Final Quiz"
      : `Module ${Number(challenge.moduleIndex) + 1} Quiz`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20 shadow-xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <Zap className="h-10 w-10 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Challenge Ready Room</h1>
            <p className="text-sm text-muted-foreground">
              {isChallenger
                ? `You challenged ${friendNickname}`
                : `${friendNickname} challenged you`}
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Course: </span>
              <span className="font-semibold">{courseTitle}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Quiz: </span>
              <span className="font-semibold">{quizLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Questions: </span>
              <span className="font-semibold">{challenge.questionIds.length}</span>
            </p>
            {bet > 0 && (
              <p className="flex items-center gap-2">
                <NexonIcon className="h-4 w-4 text-primary" />
                <span>
                  Wager: <strong>{bet}</strong> Nexon (winner takes {bet * 2})
                </span>
              </p>
            )}
            {bet > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Wagered duels use objective questions only for fair grading.
              </p>
            )}
          </div>

          {needsAccept && bet > 0 && (
            <p className="text-sm text-center text-orange-600 dark:text-orange-400 font-medium">
              Press below to accept and lock in your {bet} Nexon bet.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full gap-2" onClick={onStart} disabled={starting}>
              {starting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : needsAccept && bet > 0 ? (
                <>Start &amp; Pay Bet</>
              ) : needsAccept ? (
                <>Accept &amp; Start</>
              ) : (
                <>Enter Arena</>
              )}
            </Button>
            <Button variant="outline" onClick={onBack} disabled={starting}>
              <Clock className="h-4 w-4 mr-2" />
              Back to chat
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
