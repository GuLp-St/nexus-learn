"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getNexonHistory, NexonHistoryEntry } from "@/lib/nexon-utils"
import { Spinner } from "@/components/ui/spinner"
import { TrendingUp, TrendingDown, Info } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { formatDateForDisplay } from "@/lib/date-utils"
import { NexonIcon } from "./ui/nexon-icon"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface NexonHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function NexonHistoryModal({ open, onOpenChange, userId }: NexonHistoryModalProps) {
  const [history, setHistory] = useState<NexonHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      const fetchHistory = async () => {
        setLoading(true)
        try {
          const entries = await getNexonHistory(userId, 100)
          setHistory(entries)
        } catch (error) {
          console.error("Error fetching Nexon history:", error)
        } finally {
          setLoading(false)
        }
      }

      fetchHistory()
    }
  }, [open, userId])

  const formatDate = (timestamp: Timestamp | undefined) => {
    return formatDateForDisplay(timestamp, "MMM d, yyyy 'at' h:mm a")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <NexonIcon className="h-6 w-6" />
            Nexon History
          </DialogTitle>
          <DialogDescription>
            Track your Nexon earnings and spending
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tutorial Section */}
          <Accordion type="single" collapsible className="w-full bg-muted/30 rounded-lg px-4 border">
            <AccordionItem value="how-to-earn" className="border-none">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="h-4 w-4 text-primary" />
                  How to earn Nexon?
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
                <p>Nexon is the premium currency of Nexus Learn. Here's how you can earn it:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><span className="font-medium text-foreground">Daily Quests:</span> Complete your 3 daily quests (25 Nexon each).</li>
                  <li><span className="font-medium text-foreground">Leveling Up:</span> Each level up awards a significant amount of Nexon.</li>
                  <li><span className="font-medium text-foreground">Course Royalties:</span> Earn Nexon when others add your published courses to their library.</li>
                  <li><span className="font-medium text-foreground">1v1 Challenges:</span> Win Nexon by challenging friends to quiz duels.</li>
                  <li><span className="font-medium text-foreground">Milestones:</span> Earn Nexon for special achievements and learning milestones.</li>
                </ul>
                <p className="text-xs italic bg-primary/5 p-2 rounded">Use Nexon in the <span className="font-semibold">Store</span> to buy avatars, frames, and exclusive profile customizations!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* History List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Recent Transactions</h3>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/10">
                No Nexon transactions yet
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => {
                  const isGain = entry.amount > 0
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div
                          className={`flex-shrink-0 rounded-full p-2.5 ${
                            isGain ? "bg-green-500/10" : "bg-red-500/10"
                          }`}
                        >
                          {isGain ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 font-bold">
                              <NexonIcon className="h-4 w-4" />
                              <span className={isGain ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                {isGain ? "+" : ""}{entry.amount.toLocaleString()}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">•</span>
                            <span className="font-semibold text-sm truncate">{entry.source}</span>
                          </div>
                          {entry.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{entry.description}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">
                            {formatDate(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

