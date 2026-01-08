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

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "NexusLearn - Your Learning Dashboard",
  description: "A modern learning platform to track your courses and progress",
  generator: "NexusLearn",
  icons: {
    icon: [
      {
        url: "/icon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/icon-64x64.png",
        sizes: "64x64",
        type: "image/png",
      },
      {
        url: "/icon-128x128.png",
        sizes: "128x128",
        type: "image/png",
      },
      {
        url: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
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
