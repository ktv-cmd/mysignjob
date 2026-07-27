import type { Metadata } from "next"
import { Inter, Sora, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import Providers from "@/components/shared/Providers"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
// Display face — deliberately paired to echo the logo wordmark's confident,
// rounded weight without going fully playful.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" })
// Reserved for literal measurements in this product: order IDs, prices,
// W x H dimensions — not a general-purpose accent face.
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" })

export const metadata: Metadata = {
  title: "Mysignjobs.com — Get Your Business Sign Done",
  description:
    "The easiest way to get a professional business sign. Upload a photo, get an instant AI preview, receive competitive quotes from local sign companies.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${sora.variable} ${plexMono.variable}`}>
      <body className="min-h-full antialiased">
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
