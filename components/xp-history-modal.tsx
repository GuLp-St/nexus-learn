"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getAggregatedXPHistory, AggregatedXPHistoryEntry } from "@/lib/xp-history-utils"
import { Spinner } from "@/components/ui/spinner"
import { TrendingUp, TrendingDown } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { formatDateForDisplay } from "@/lib/date-utils"

interface XPHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function XPHistoryModal({ open, onOpenChange, userId }: XPHistoryModalProps) {
  const [history, setHistory] = useState<AggregatedXPHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && userId) {
      const fetchHistory = async () => {
        setLoading(true)
        try {
          const entries = await getAggregatedXPHistory(userId, 100)
          setHistory(entries)
        } catch (error) {
          console.error("Error fetching XP history:", error)
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
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>XP History</DialogTitle>
          <DialogDescription>
            All XP gains and losses with their sources and dates
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No XP history available
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => {
                const isGain = entry.totalAmount > 0
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`flex-shrink-0 rounded-full p-2 ${
                          isGain ? "bg-green-500/10" : "bg-red-500/10"
                        }`}
                      >
                        {isGain ? (
                          <TrendingUp className={`h-4 w-4 ${isGain ? "text-green-500" : "text-red-500"}`} />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isGain ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {isGain ? "+" : ""}{entry.totalAmount} XP
                          </span>
                          <span className="text-sm text-muted-foreground">•</span>
                          <span className="font-medium text-sm truncate">{entry.source}</span>
                        </div>
                        {entry.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
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
      </DialogContent>
    </Dialog>
  )
}

