import type { Metadata } from "next"
import { IBM_Plex_Mono, Inter, Sora } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import Providers from "@/components/shared/Providers"

// Site-wide body face — soft, neutral, close to the humanist feel of SF Pro.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
// Display face — a rounded geometric sans that echoes the wordmark's soft
// weight without the condensed, industrial edge Big Shoulders had.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" })
// Reserved for literal measurements in this product: order IDs, prices,
// W x H dimensions — not a general-purpose accent face.
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" })

export const metadata: Metadata = {
  title: "Mysignjobs.com — Get Your Business Sign Done",
  description:
    "The easiest way to get a professional business sign. Upload a photo, get an instant AI preview, receive competitive quotes from local sign companies.",
  icons: {
    // The mark's checkmark is near-black — legible in a light browser tab
    // bar but nearly invisible in a dark one, same issue the wordmark had.
    // These media-scoped entries key off the OS/browser color scheme (Chrome
    // dark mode etc.), independent of this site's own light/dark toggle —
    // /favicon.ico stays the file-convention default for browsers that don't
    // support prefers-color-scheme on <link rel="icon">.
    icon: [
      { url: "/favicon.ico", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.png", type: "image/png", sizes: "512x512", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.png", type: "image/png", sizes: "512x512", media: "(prefers-color-scheme: dark)" },
    ],
  },
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
