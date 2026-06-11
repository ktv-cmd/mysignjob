"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function ClientNav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-lg tracking-tight">
          My Sign Job
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className={cn(
              "text-sm font-medium transition-colors",
              pathname === "/dashboard"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Orders
          </Link>
          <Link
            href="/order/new"
            className="bg-accent text-accent-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Sign
          </Link>
          <Link
            href="/account"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Account
          </Link>
        </nav>
      </div>
    </header>
  )
}
