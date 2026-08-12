import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import ThemeToggle from "@/components/shared/ThemeToggle"
import BrandLogo from "@/components/shared/BrandLogo"
import CompareSlider from "@/components/home/CompareSlider"

// Soft, Apple-leaning redesign — generous rounded corners, floating cards
// with soft shadows instead of hairline grids, Sora headlines in sentence
// case. Every section, including the header/hero/CTA band, follows the
// site's light/dark toggle via the theme tokens (bg-background,
// text-foreground, etc.) rather than a fixed color, so switching themes
// actually changes the whole page.

const STEPS = [
  {
    num: "01",
    title: "Upload a photo",
    desc: "Snap your storefront. We estimate wall dimensions and the mounting surface automatically.",
    status: "Instant",
    icon: <><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M8 6l1.5-2.5h5L16 6" /><circle cx="12" cy="12.5" r="3.2" /></>,
  },
  {
    num: "02",
    title: "See the AI preview",
    desc: "Your sign is rendered on your actual building — real materials, real lighting, exact placement.",
    status: "~30 seconds",
    icon: <><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /><circle cx="12" cy="12" r="3.4" /></>,
  },
  {
    num: "03",
    title: "Get competitive quotes",
    desc: "Vetted local sign companies bid on the job file. Compare price and timeline, pick a winner.",
    status: "You choose",
    icon: <><path d="M4 9h16M4 15h10" /><circle cx="18" cy="15" r="2.6" /></>,
  },
]

const TRUST = [
  {
    title: "Vetted companies only",
    desc: "Every sign company on the platform is screened before they can bid on a job.",
    icon: <path d="M12 2l2.6 5.9 6.4.6-4.8 4.4 1.4 6.3L12 16.6l-5.6 2.6 1.4-6.3-4.8-4.4 6.4-.6z" />,
  },
  {
    title: "Real competitive bids",
    desc: "Multiple local shops quote the same job file, side by side — no single-source pricing.",
    icon: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18" /></>,
  },
  {
    title: "Escrow-protected payment",
    desc: "Funds release in stages as the job progresses — kickoff, approval, completion.",
    icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  },
]

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role === "admin") redirect("/admin")
    if (profile?.role === "sc") redirect("/sc/dashboard")
    redirect("/dashboard")
  }

  // Marketing landing page for unauthenticated users
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-7 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-7">
            <a href="#how" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How it works</a>
            <a href="#trust" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Why us</a>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Log in</Link>
            <Link
              href="/register"
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-soft"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              Get Started
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="py-20 sm:py-24">
        <div className="container mx-auto px-4 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-14 items-center">
          <div>
            <div className="flex items-center gap-2.5 mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-brand-sky)", boxShadow: "0 0 0 3px rgba(76,127,179,0.25)" }}
              />
              Upload · Preview · Get Quotes
            </div>
            <h1
              className="font-semibold text-foreground mb-6 text-balance"
              style={{ fontSize: "clamp(2.5rem, 1.4rem + 4.5vw, 4.4rem)", lineHeight: 1.06, letterSpacing: "-0.02em" }}
            >
              See your sign<br />
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>
                before you build it.
              </span>
            </h1>
            <p className="text-muted-foreground mb-8 leading-relaxed max-w-md text-lg text-balance">
              Upload a photo of your storefront. Our AI renders your new sign on the actual building in seconds — then vetted local sign companies bid on the job.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3.5 mb-10">
              <Link
                href="/order/new"
                className="rounded-full px-8 py-3.5 text-base font-semibold text-white text-center hover:opacity-90 transition-opacity shadow-soft"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                Get Your Sign →
              </Link>
              <Link
                href="/sc/register"
                className="rounded-full border border-border px-8 py-3.5 text-base font-medium text-foreground text-center hover:border-foreground/40 hover:bg-muted/40 transition-colors"
              >
                I&apos;m a Sign Company
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-0 border-t border-border/70 pt-5">
              {[
                { k: "Preview", v: "AI-rendered, on your wall" },
                { k: "Bidders", v: "Vetted local companies" },
                { k: "Payment", v: "Escrow-protected" },
              ].map((t, i) => (
                <div key={t.k} className={`flex-1 sm:pr-5 ${i < 2 ? "sm:border-r sm:border-border" : ""}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t.k}</div>
                  <div className="text-sm font-medium text-foreground">{t.v}</div>
                </div>
              ))}
            </div>
          </div>

          <CompareSlider
            afterSrc="/examples/letters-lighting-bg/front_light_night.jpg"
            afterAlt="AI-rendered channel letter sign lit up on a brick storefront at night"
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="py-20 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">The process</p>
            <h2 className="font-semibold text-3xl sm:text-4xl mb-3.5" style={{ letterSpacing: "-0.02em" }}>
              Three steps, one job ticket.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              No showroom visits, no guesswork. Everything from first photo to final install runs through one job file.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <div key={s.num} className="bg-card border border-border/70 rounded-2xl shadow-soft p-7">
                <div className="font-semibold text-3xl mb-4" style={{ color: "var(--color-border)" }}>
                  {s.num}
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8.5 w-8.5 mb-4" style={{ color: "var(--color-brand-indigo)" }}>
                  {s.icon}
                </svg>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.desc}</p>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-brand-indigo)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3.5 w-3.5"><path d="M4 12l5 5L20 6" /></svg>
                  {s.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why us ── */}
      <section id="trust" className="pb-20 sm:pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">Why Mysignjobs.com</p>
            <h2 className="font-semibold text-3xl sm:text-4xl" style={{ letterSpacing: "-0.02em" }}>
              Built like a fabrication shop, not an ad platform.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TRUST.map((t) => (
              <div key={t.title} className="bg-card border border-border/70 rounded-2xl shadow-soft p-7">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6.5 w-6.5 mb-3.5" style={{ color: "var(--color-brand-plum)" }}>
                  {t.icon}
                </svg>
                <h4 className="font-semibold text-[15.5px] mb-2">{t.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="relative py-20 text-center overflow-hidden border-t border-border/70">
        <div
          aria-hidden
          className="absolute left-1/2 -top-40 h-80 w-[640px] -translate-x-1/2 opacity-25 blur-[110px]"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        />
        <div className="relative container mx-auto px-4">
          <h2
            className="font-semibold text-foreground mb-4 text-balance"
            style={{ fontSize: "clamp(2rem, 1.2rem + 3vw, 3.4rem)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Ready to see it<br />on your wall?
          </h2>
          <p className="text-muted-foreground mb-8">Upload a photo and get your first AI preview in under a minute.</p>
          <Link
            href="/order/new"
            className="inline-block rounded-full px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-soft-lg"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            Get Your Sign →
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="container mx-auto px-4 flex items-center justify-between flex-wrap gap-4">
          <BrandLogo className="h-5 w-auto opacity-80" />
          <p className="text-xs text-muted-foreground">© Mysignjobs.com</p>
        </div>
      </footer>
    </div>
  )
}
