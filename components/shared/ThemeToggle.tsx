"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"

const noopSubscribe = () => () => {}

// True only once hydrated on the client. next-themes can't know the
// resolved theme (it depends on the OS preference / localStorage, neither
// available during SSR) until after hydration, so rendering a concrete icon
// any earlier would mismatch between server and client markup.
// useSyncExternalStore's getServerSnapshot/getSnapshot split gives this for
// free without an effect+setState (which itself would trigger an extra
// render pass right after mount).
function useIsMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

export default function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useIsMounted()

  if (!mounted) return <div className="h-8 w-8" aria-hidden />

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      }
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
        </svg>
      )}
    </button>
  )
}
