"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"
import { isImpersonating } from "@/lib/impersonation-client"
import {
  ONBOARDING_STEPS,
  ONBOARDING_VERSION,
  type TourStep,
} from "@/lib/onboarding-tour"

const SIDEBAR_EVENT = "nexus-tour-open-sidebar"
const CLOSE_SIDEBAR_EVENT = "nexus-tour-close-sidebar"

type ChatbotControls = {
  open: () => void
  close: () => void
}

interface OnboardingContextType {
  tourActive: boolean
  stepIndex: number
  currentStep: TourStep | null
  showWelcome: boolean
  startTour: (fromStep?: number) => void
  endTour: (completed?: boolean) => Promise<void>
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  dismissWelcome: () => void
  registerChatbotControls: (controls: ChatbotControls | null) => void
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

function sessionDismissKey(uid: string) {
  return `nexus-tour-welcome-dismissed-${uid}`
}

async function fetchOnboardingVersion(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid))
  const v = snap.data()?.onboardingVersion
  return typeof v === "number" ? v : 0
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const [tourActive, setTourActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [showWelcome, setShowWelcome] = useState(false)

  const chatbotRef = useRef<ChatbotControls | null>(null)
  const navigatingRef = useRef(false)
  const welcomeCheckedRef = useRef(false)

  const currentStep = tourActive ? ONBOARDING_STEPS[stepIndex] ?? null : null

  const registerChatbotControls = useCallback((controls: ChatbotControls | null) => {
    chatbotRef.current = controls
  }, [])

  const persistCompleted = useCallback(async () => {
    if (!user) return
    await setDoc(
      doc(db, "users", user.uid),
      { onboardingVersion: ONBOARDING_VERSION, updatedAt: serverTimestamp() },
      { merge: true }
    )
  }, [user])

  const endTour = useCallback(
    async (completed = false) => {
      setTourActive(false)
      setStepIndex(0)
      chatbotRef.current?.close()
      if (completed && user) {
        await persistCompleted()
      }
    },
    [persistCompleted, user]
  )

  const startTour = useCallback(
    (fromStep = 0) => {
      setShowWelcome(false)
      setStepIndex(fromStep)
      setTourActive(true)
      const step = ONBOARDING_STEPS[fromStep]
      if (step?.navigateTo && step.navigateTo !== pathname) {
        navigatingRef.current = true
        router.push(step.navigateTo)
      }
    },
    [pathname, router]
  )

  const skipTour = useCallback(() => {
    void endTour(false)
    if (user) {
      sessionStorage.setItem(sessionDismissKey(user.uid), "1")
    }
  }, [endTour, user])

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
    if (user) {
      sessionStorage.setItem(sessionDismissKey(user.uid), "1")
    }
  }, [user])

  const goToStep = useCallback(
    (index: number) => {
      const step = ONBOARDING_STEPS[index]
      if (!step) return
      setStepIndex(index)
      if (step.navigateTo && step.navigateTo !== pathname) {
        navigatingRef.current = true
        router.push(step.navigateTo)
      }
    },
    [pathname, router]
  )

  const nextStep = useCallback(() => {
    const next = stepIndex + 1
    if (next >= ONBOARDING_STEPS.length) {
      void endTour(true)
      return
    }
    goToStep(next)
  }, [endTour, goToStep, stepIndex])

  const prevStep = useCallback(() => {
    if (stepIndex > 0) goToStep(stepIndex - 1)
  }, [goToStep, stepIndex])

  // Welcome prompt for new / outdated onboarding users
  useEffect(() => {
    if (loading || !user || pathname === "/auth" || isImpersonating()) return
    if (welcomeCheckedRef.current) return
    welcomeCheckedRef.current = true

    let cancelled = false
    ;(async () => {
      if (sessionStorage.getItem(sessionDismissKey(user.uid))) return
      const version = await fetchOnboardingVersion(user.uid)
      if (cancelled || version >= ONBOARDING_VERSION || tourActive) return
      if (pathname === "/") {
        setShowWelcome(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loading, user, pathname, tourActive])

  // Step side-effects: sidebar, chatbot
  useEffect(() => {
    if (!tourActive || !currentStep) return

    if (currentStep.closeSidebar) {
      window.dispatchEvent(new CustomEvent(CLOSE_SIDEBAR_EVENT))
    } else if (currentStep.openSidebar) {
      window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT))
    }

    if (currentStep.openChatbot) {
      chatbotRef.current?.open()
    } else {
      chatbotRef.current?.close()
    }
  }, [tourActive, currentStep])

  // Navigate when step route requires a different page (after navigation completes)
  useEffect(() => {
    if (!tourActive || !currentStep) return
    if (navigatingRef.current) {
      navigatingRef.current = false
      return
    }
    if (currentStep.route !== "*" && currentStep.route !== pathname && !currentStep.navigateTo) {
      navigatingRef.current = true
      router.push(currentStep.route)
    }
  }, [tourActive, currentStep, pathname, router])

  return (
    <OnboardingContext.Provider
      value={{
        tourActive,
        stepIndex,
        currentStep,
        showWelcome,
        startTour,
        endTour,
        nextStep,
        prevStep,
        skipTour,
        dismissWelcome,
        registerChatbotControls,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider")
  }
  return ctx
}

export { SIDEBAR_EVENT, CLOSE_SIDEBAR_EVENT }
