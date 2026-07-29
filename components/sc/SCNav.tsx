"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import ThemeToggle from "@/components/shared/ThemeToggle"
import BrandLogo from "@/components/shared/BrandLogo"

export default function SCNav() {
  const pathname = usePathname()

  // The dashboard already shows open quote requests, active jobs, and recent
  // payouts inline — no separate list pages for those exist (or are needed).
  const links = [
    { href: "/sc/dashboard", label: "Dashboard" },
  ]

  return (
    <header className="relative border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ backgroundImage: "var(--gradient-brand)" }}
      />
      <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-2 overflow-x-auto">
        <Link href="/sc/dashboard" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
          <BrandLogo className="h-9 w-auto" priority />
          <span className="text-muted-foreground font-normal text-sm">· SC Portal</span>
        </Link>

        <nav className="flex items-center gap-3 flex-shrink-0">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center py-3 px-1 text-sm font-medium whitespace-nowrap transition-colors",
                pathname.startsWith(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
