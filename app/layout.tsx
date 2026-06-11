import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "sonner"
import Providers from "@/components/shared/Providers"

export const metadata: Metadata = {
  title: "My Sign Job — Get Your Business Sign Done",
  description:
    "The easiest way to get a professional business sign. Upload a photo, get an instant AI preview, receive competitive quotes from local sign companies.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
