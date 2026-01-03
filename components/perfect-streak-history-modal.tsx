"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getPerfectQuizHistory, QuizAttempt } from "@/lib/quiz-utils"
import { Spinner } from "@/components/ui/spinner"
import { Trophy, Calendar, CheckCircle2, Info } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { formatDateForDisplay } from "@/lib/date-utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface PerfectStreakHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function PerfectStreakHistoryModal({ open, onOpenChange, userId }: PerfectStreakHistoryModalProps) {
  const [history, setHistory] = useState<(QuizAttempt & { courseTitle?: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      const fetchHistory = async () => {
        setLoading(true)
        try {
          const entries = await getPerfectQuizHistory(userId)
          setHistory(entries)
        } catch (error) {
          console.error("Error fetching perfect streak history:", error)
        } finally {
          setLoading(false)
        }
      }

      fetchHistory()
    }
  }, [open, userId])

  const formatDate = (timestamp: Timestamp | undefined | null) => {
    if (!timestamp) return "Unknown date"
    return formatDateForDisplay(timestamp, "MMM d, yyyy 'at' h:mm a")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Perfect Streak History
          </DialogTitle>
          <DialogDescription>
            A record of all your 100% scores on Course Quizzes
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tutorial Section */}
          <Accordion type="single" collapsible className="w-full bg-muted/30 rounded-lg px-4 border">
            <AccordionItem value="how-to-earn" className="border-none">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="h-4 w-4 text-primary" />
                  How to increase Perfect Streaks?
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
                <p>Perfect Streaks represent your mastery over entire subjects. Here's how they work:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><span className="font-medium text-foreground">Course Quizzes only:</span> Only the final quiz of a course counts towards this streak.</li>
                  <li><span className="font-medium text-foreground">100% Accuracy:</span> You must answer every single question correctly.</li>
                  <li><span className="font-medium text-foreground">Mastery:</span> These reflect your ability to retain information across all modules of a course.</li>
                </ul>
                <p className="text-xs italic bg-primary/5 p-2 rounded">Keep learning and testing your knowledge to build your collection of perfect scores!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Recent Masteries</h3>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border-dashed border-2">
                <Trophy className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No perfect course quizzes yet.</p>
                <p className="text-xs">Complete a course quiz with 100% to start your streak!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all hover:shadow-sm"
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 rounded-full bg-yellow-500/10 p-2.5 h-fit mt-1">
                        <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground break-words">{entry.courseTitle}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(entry.completedAt)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Trophy className="h-3 w-3 text-yellow-600" />
                            Perfect Score ({entry.totalScore}/{entry.maxScore})
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

