"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function AdminNav() {
  const pathname = usePathname()

  // Quotes, SC companies, and transactions all live on one consolidated
  // dashboard page rather than separate list pages.
  const links = [
    { href: "/admin", label: "Overview" },
  ]

  return (
    <header className="relative border-b border-border bg-background sticky top-0 z-50">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ backgroundImage: "var(--gradient-brand)" }}
      />
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2">
          <Image src="/brand/logo-horizontal.png" alt="Mysignjobs.com" width={160} height={47} className="h-9 w-auto" priority />
          <span className="text-muted-foreground font-normal text-sm">· Admin</span>
        </Link>

        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors",
                pathname === link.href
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
