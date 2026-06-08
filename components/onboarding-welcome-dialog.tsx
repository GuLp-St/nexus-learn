"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useOnboarding } from "@/context/OnboardingContext"
import { useAuth } from "@/components/auth-provider"

export function OnboardingWelcomeDialog() {
  const { showWelcome, startTour, dismissWelcome } = useOnboarding()
  const { nickname } = useAuth()

  return (
    <Dialog open={showWelcome} onOpenChange={(open) => !open && dismissWelcome()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <img src="/icon.svg" alt="Nexus" className="h-16 w-16 mx-auto mb-2" />
          <DialogTitle className="text-xl">
            {nickname ? `Hey ${nickname}!` : "Welcome!"} I'm Nexus
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Want a quick guided tour? I'll highlight the important parts of NexusLearn — creating
            courses, daily quests, friends, challenges, and how to reach me anytime in chat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => startTour(0)}>
            Start the tour
          </Button>
          <Button variant="ghost" className="w-full" onClick={dismissWelcome}>
            I'll explore on my own
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
