"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function SCNav() {
  const pathname = usePathname()

  const links = [
    { href: "/sc/dashboard", label: "Dashboard" },
    { href: "/sc/quotes", label: "Quotes" },
    { href: "/sc/jobs", label: "Jobs" },
    { href: "/sc/payouts", label: "Payouts" },
  ]

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-2 overflow-x-auto">
        <Link href="/sc/dashboard" className="font-bold text-lg tracking-tight whitespace-nowrap flex-shrink-0">
          My Sign Job <span className="text-muted-foreground font-normal text-sm">· SC Portal</span>
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
        </nav>
      </div>
    </header>
  )
}
