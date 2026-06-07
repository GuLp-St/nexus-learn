"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Challenge } from "@/lib/challenge-utils"
import { NexonIcon } from "@/components/ui/nexon-icon"
import { Zap, Clock, AlertTriangle, Loader2, Users, CheckCircle2 } from "lucide-react"

interface ChallengeReadyRoomProps {
  challenge: Challenge
  isChallenger: boolean
  friendNickname: string
  courseTitle: string
  starting: boolean
  startError?: string | null
  liveCountdown?: number | null
  onStart: () => void
  onMarkReady?: () => void
  onAccept?: () => void
  accepting?: boolean
  onBack: () => void
}

export function ChallengeReadyRoom({
  challenge,
  isChallenger,
  friendNickname,
  courseTitle,
  starting,
  startError,
  liveCountdown,
  onStart,
  onMarkReady,
  onAccept,
  accepting,
  onBack,
}: ChallengeReadyRoomProps) {
  const isLive = challenge.settings?.mode === "live"
  const needsAccept = !isChallenger && challenge.status === "pending"
  const bet = challenge.betAmount || 0
  const quizLabel =
    challenge.quizType === "course"
      ? "Final Quiz"
      : `Module ${Number(challenge.moduleIndex) + 1} Quiz`

  const myReady = isChallenger ? challenge.challengerReady : challenge.challengedReady
  const oppReady = isChallenger ? challenge.challengedReady : challenge.challengerReady
  const waitingAccept = isLive && isChallenger && challenge.status === "pending"
  const bothReady = !!challenge.challengerReady && !!challenge.challengedReady
  const canSyncStart = isLive && bothReady && challenge.status === "accepted"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20 shadow-xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <Zap className="h-10 w-10 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">
              {isLive ? "Live Duel Lobby" : "Challenge Ready Room"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isChallenger
                ? `You challenged ${friendNickname}`
                : `${friendNickname} challenged you`}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {isLive && <Badge variant="secondary">Live 1v1</Badge>}
              {challenge.settings?.hint && <Badge variant="outline">Hints</Badge>}
              {challenge.settings?.sabotage && isLive && (
                <Badge variant="outline">Sabotage</Badge>
              )}
              {challenge.settings?.timer && <Badge variant="outline">Timer</Badge>}
              {challenge.settings?.combo && <Badge variant="outline">Combo</Badge>}
              {challenge.settings?.immediateFeedback && (
                <Badge variant="outline">Flash feedback</Badge>
              )}
            </div>
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
              <span className="text-xs text-muted-foreground ml-1">(objective only)</span>
            </p>
            {bet > 0 && (
              <p className="flex items-center gap-2">
                <NexonIcon className="h-4 w-4 text-primary" />
                <span>
                  Wager: <strong>{bet}</strong> Nexon (winner takes {bet * 2})
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Challenge quizzes use objective questions only for fair scoring.
            </p>
          </div>

          {isLive && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Live lobby
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`rounded-md p-2 border ${myReady ? "border-green-500/40 bg-green-500/10" : "border-border bg-background"}`}>
                  <p className="text-muted-foreground mb-0.5">You</p>
                  <p className="font-semibold flex items-center gap-1">
                    {myReady ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Ready
                      </>
                    ) : (
                      "Not ready"
                    )}
                  </p>
                </div>
                <div className={`rounded-md p-2 border ${oppReady ? "border-green-500/40 bg-green-500/10" : "border-border bg-background"}`}>
                  <p className="text-muted-foreground mb-0.5">{friendNickname}</p>
                  <p className="font-semibold flex items-center gap-1">
                    {oppReady ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Ready
                      </>
                    ) : waitingAccept ? (
                      "Must accept first"
                    ) : (
                      "Not ready"
                    )}
                  </p>
                </div>
              </div>
              {waitingAccept && (
                <p className="text-xs text-muted-foreground text-center">
                  Waiting for {friendNickname} to accept the challenge…
                </p>
              )}
              {canSyncStart && liveCountdown != null && liveCountdown > 0 && (
                <p className="text-center text-2xl font-black text-primary tabular-nums">
                  Starting in {liveCountdown}…
                </p>
              )}
              {canSyncStart && liveCountdown === 0 && (
                <p className="text-center text-sm font-semibold text-primary animate-pulse">
                  Launching duel…
                </p>
              )}
            </div>
          )}

          {needsAccept && bet > 0 && (
            <p className="text-sm text-center text-orange-600 dark:text-orange-400 font-medium">
              Accept to lock in your {bet} Nexon bet, then mark ready.
            </p>
          )}

          {startError && (
            <p className="text-sm text-center text-destructive bg-destructive/10 rounded-lg p-3">
              {startError}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {needsAccept && onAccept && (
              <Button size="lg" className="w-full" onClick={onAccept} disabled={accepting || starting}>
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Accepting…
                  </>
                ) : bet > 0 ? (
                  "Accept challenge"
                ) : (
                  "Accept challenge"
                )}
              </Button>
            )}

            {isLive ? (
              <>
                {!needsAccept && !myReady && onMarkReady && (
                  <Button size="lg" className="w-full gap-2" onClick={onMarkReady} disabled={starting || waitingAccept}>
                    I&apos;m Ready
                  </Button>
                )}
                {!needsAccept && myReady && !canSyncStart && (
                  <Button size="lg" className="w-full" disabled>
                    Waiting for {friendNickname}…
                  </Button>
                )}
                {canSyncStart && (
                  <Button size="lg" className="w-full gap-2" disabled>
                    {starting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Preparing…
                      </>
                    ) : liveCountdown != null && liveCountdown > 0 ? (
                      <>Match starts in {liveCountdown}s</>
                    ) : (
                      <>Starting match…</>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <Button size="lg" className="w-full gap-2" onClick={onStart} disabled={starting || needsAccept}>
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing…
                  </>
                ) : needsAccept ? (
                  "Accept above to start"
                ) : (
                  "Enter Arena"
                )}
              </Button>
            )}

            <Button variant="outline" onClick={onBack} disabled={starting || accepting}>
              <Clock className="h-4 w-4 mr-2" />
              Back to chat
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
