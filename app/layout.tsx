import type { Metadata } from "next"
import { Inter, Sora, IBM_Plex_Mono, IBM_Plex_Sans, Big_Shoulders } from "next/font/google"
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
// Scoped to the marketing homepage's "fabrication ticket" redesign only —
// not swapped in app-wide, so the rest of the product keeps Inter/Sora.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" })
// "Big Shoulders" is a variable family (opsz axis distinguishes the "Text"
// vs "Display" cuts) but next/font/google only allows the axes option when
// weight is set to "variable" — since this is only ever used at headline
// sizes here, static 700/900 weights render condensed either way and avoid
// that variable-font wiring entirely.
const bigShoulders = Big_Shoulders({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-big-shoulders" })

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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${sora.variable} ${plexMono.variable} ${plexSans.variable} ${bigShoulders.variable}`}>
      <body className="min-h-full antialiased">
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
