/**
 * Central Event Bus (Observer Pattern)
 * 
 * Provides a centralized event system for cross-cutting concerns.
 * Used primarily for quest progress tracking but extensible for other features.
 */

export type QuestEventType =
  | "quest.lesson_completed"
  | "quest.module_completed"
  | "quest.quiz_completed"
  | "quest.course_rated"
  | "quest.xp_earned"
  | "quest.course_added"
  | "nexon_awarded"
  | "quest.interaction_streak"
  | "quest.review_quiz"
  | "quest.send_challenge"
  | "quest.win_challenge"
  | "quest.visit_leaderboard"
  | "quest.chat_hint"
  | "quest.generate_course"
  | "quest.add_library"
  | "quest.visit_shop"
  | "quest.check_stats"

export interface QuestEventMetadata {
  courseId?: string
  moduleIndex?: number
  lessonIndex?: number
  quizType?: "lesson" | "module" | "course"
  rating?: number
  xpAmount?: number
  isReward?: boolean
  questId?: string
  questType?: string
  // For nexon_awarded
  amount?: number
  source?: string
  description?: string
  [key: string]: any // Allow additional metadata
}

export interface QuestEvent {
  type: QuestEventType
  userId: string
  metadata: QuestEventMetadata
}

type EventHandler<T extends QuestEvent = QuestEvent> = (event: T) => void | Promise<void>

class EventBus {
  private handlers: Map<QuestEventType, Set<EventHandler>> = new Map()

  /**
   * Subscribe to an event type
   * @param eventType The event type to listen for
   * @param handler Function to call when event is emitted
   * @returns Unsubscribe function
   */
  subscribe(eventType: QuestEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, handler)
    }
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(eventType: QuestEventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }

  /**
   * Emit an event to all subscribers
   */
  async emit(event: QuestEvent): Promise<void> {
    const handlers = this.handlers.get(event.type)
    if (!handlers || handlers.size === 0) {
      return
    }

    // Call all handlers (support async handlers)
    const promises = Array.from(handlers).map((handler) => {
      try {
        return Promise.resolve(handler(event))
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error)
        return Promise.resolve()
      }
    })

    await Promise.all(promises)
  }

  /**
   * Clear all handlers for an event type
   */
  clear(eventType?: QuestEventType): void {
    if (eventType) {
      this.handlers.delete(eventType)
    } else {
      this.handlers.clear()
    }
  }

  /**
   * Get count of subscribers for an event type
   */
  getSubscriberCount(eventType: QuestEventType): number {
    return this.handlers.get(eventType)?.size || 0
  }
}

// Singleton instance
export const eventBus = new EventBus()

/**
 * Convenience wrapper function for emitting quest events
 */
export function emitQuestEvent(event: QuestEvent): Promise<void> {
  return eventBus.emit(event)
}

