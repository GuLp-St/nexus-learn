import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import "./globals.css"
import { ChatbotOverlay } from "@/components/chatbot-overlay"
import { ChatbotContextProvider } from "@/components/chatbot-context-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth-provider"
import { XPContextProvider } from "@/components/xp-context-provider"
import { QuestInitializer } from "@/components/quest-initializer"
import { NexonToastHandler } from "@/components/nexon-toast-handler"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LearnHub - Your Learning Dashboard",
  description: "A modern learning platform to track your courses and progress",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
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
              <ChatbotContextProvider>
                <QuestInitializer />
                <NexonToastHandler />
                {children}
                <ChatbotOverlay />
              </ChatbotContextProvider>
            </AuthProvider>
          </XPContextProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors expand={true} gap={12} />
        <Analytics />
      </body>
    </html>
  )
}
