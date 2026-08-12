"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import ThemeToggle from "@/components/shared/ThemeToggle"
import BrandLogo from "@/components/shared/BrandLogo"

export default function ClientNav() {
  const pathname = usePathname()

  return (
    <header className="relative border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ backgroundImage: "var(--gradient-brand)" }}
      />
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center">
          <BrandLogo className="h-9 w-auto" priority />
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center py-3 text-sm font-medium transition-colors",
              pathname === "/dashboard"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Orders
          </Link>
          <Link
            href="/order/new"
            className="rounded-full flex items-center text-accent-foreground px-3.5 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            + New Sign
          </Link>
          <Link
            href="/account"
            className="flex items-center py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Account
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
