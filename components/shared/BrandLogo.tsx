import Image from "next/image"

// The wordmark's letterforms are near-black — legible on the light theme's
// white/near-white surfaces, but they'd disappear against the dark theme's
// near-black background. logo-horizontal-dark.png is the same file with only
// the wordmark recolored to white (the pin mark's own gradient + checkmark
// are untouched). Swapped via the dark: variant (see globals.css's
// @custom-variant dark, keyed to next-themes' .dark class) so there's no
// client-side flash while the theme resolves — both images ship in the
// markup and CSS picks the right one immediately.
export default function BrandLogo({ className = "h-9 w-auto", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <>
      <Image
        src="/brand/logo-horizontal.png"
        alt="Mysignjobs.com"
        width={160}
        height={47}
        className={`${className} dark:hidden`}
        priority={priority}
      />
      <Image
        src="/brand/logo-horizontal-dark.png"
        alt="Mysignjobs.com"
        width={160}
        height={47}
        className={`${className} hidden dark:block`}
        priority={priority}
      />
    </>
  )
}
