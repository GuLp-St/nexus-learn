import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import "./globals.css"
import { ChatbotOverlay } from "@/components/chatbot-overlay"
import { ChatContextProvider } from "@/context/ChatContext"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth-provider"
import { XPContextProvider } from "@/components/xp-context-provider"
import { QuestInitializer } from "@/components/quest-initializer"
import { NexonToastHandler } from "@/components/nexon-toast-handler"
import { LevelUpModalWrapper } from "@/components/level-up-modal-wrapper"
import { ImpersonationBanner } from "@/components/impersonation-banner"
import { CourseCreationWatcher } from "@/components/course-creation-watcher"
import { QuizPrepWatcher } from "@/components/quiz-prep-watcher"
import { ChallengeReadyWatcher } from "@/components/challenge-ready-watcher"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "NexusLearn - Your Learning Dashboard",
  description: "A modern learning platform to track your courses and progress",
  generator: "NexusLearn",
  applicationName: "NexusLearn",
  appleWebApp: {
    capable: true,
    title: "NexusLearn",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/icon-167x167.png", sizes: "167x167", type: "image/png" },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <ThemeProvider>
          <XPContextProvider>
            <AuthProvider>
              <ChatContextProvider>
                <QuestInitializer />
                <NexonToastHandler />
                <LevelUpModalWrapper />
                <ImpersonationBanner />
                <CourseCreationWatcher />
                <QuizPrepWatcher />
                <ChallengeReadyWatcher />
                {children}
                <ChatbotOverlay />
              </ChatContextProvider>
            </AuthProvider>
          </XPContextProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors expand={true} gap={12} />
        <Analytics />
      </body>
    </html>
  )
}
