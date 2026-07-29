import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import ThemeToggle from "@/components/shared/ThemeToggle"
import BrandLogo from "@/components/shared/BrandLogo"

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
      <header className="relative border-b border-border">
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        />
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <BrandLogo className="h-9 w-auto" priority />
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link
              href="/register"
              className="cut-corner-sm text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              Get Started
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="container mx-auto px-4 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p
              className="font-mono text-xs font-semibold tracking-[0.14em] uppercase mb-5"
              style={{ color: "var(--color-brand-plum)" }}
            >
              Local sign companies · vetted &amp; insured
            </p>
            <h1
              className="font-heading font-bold tracking-tight mb-6 text-balance"
              style={{ fontSize: "clamp(2.25rem, 1.4rem + 3.6vw, 3.5rem)", lineHeight: 1.06 }}
            >
              See it lit up{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                before it&apos;s built.
              </span>
            </h1>
            <p
              className="text-muted-foreground mb-9 leading-relaxed text-balance max-w-md"
              style={{ fontSize: "clamp(1rem, 0.9rem + 0.3vw, 1.125rem)" }}
            >
              Upload a photo of your storefront. Get an AI preview of your new sign — lit the way
              it&apos;ll actually look at night — then real quotes from vetted sign companies near you.
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-10">
              <Link
                href="/order/new"
                className="cut-corner w-full sm:w-auto text-accent-foreground px-8 py-3.5 text-base font-semibold hover:opacity-90 transition-opacity text-center"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                Get Your Sign →
              </Link>
              <Link
                href="/sc/register"
                className="w-full sm:w-auto border border-border px-8 py-3.5 rounded-xl text-base font-medium hover:bg-muted transition-colors text-center"
              >
                I&apos;m a Sign Company
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No cost to get quotes", "Vetted & insured companies", "Quotes within 24 hours"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckMark />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Hero visual — our own mark, fabricated: the logo transforms from
              flat artwork into a real dimensional sign, mounted and lit on a
              storefront. This is literally what the product delivers, using
              the brand's own identity rather than a stock photo standing in
              for one. Corner brackets echo the actual "mark your sign area"
              step from the order flow. Falls back to a still frame when the
              viewer has reduced motion set. */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] opacity-[0.14] blur-2xl"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            />
            <div className="relative cut-corner overflow-hidden border border-border/60 shadow-xl shadow-black/10">
              <video
                className="w-full aspect-square object-cover motion-reduce:hidden"
                src="/video/logo-reveal.mp4"
                poster="/video/logo-reveal-poster.jpg"
                autoPlay
                loop
                muted
                playsInline
                aria-label="Mysignjobs.com logo transforming from flat artwork into a fabricated dimensional sign, mounted and lit on a storefront"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/video/logo-reveal-poster.jpg"
                alt="Mysignjobs.com logo fabricated as a dimensional sign, mounted and lit on a storefront"
                className="hidden w-full aspect-square object-cover motion-reduce:block"
              />
              <CornerBrackets />
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2.5 rounded-xl bg-black/55 backdrop-blur-sm px-3.5 py-2.5">
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundImage: "var(--gradient-brand)" }}
                >
                  <CheckMark stroke="white" />
                </span>
                <span className="text-xs font-medium text-white">Your logo. Fabricated. Installed.</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── How it works — a real sequence, so numbering earns its place ── */}
        <div className="mt-28 sm:mt-36">
          <div className="max-w-xl mb-12">
            <p className="font-mono text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-3">
              How it works
            </p>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
              Three steps, in order, start to finish.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {[
              {
                step: "01",
                title: "Upload a photo",
                desc: "A photo of your storefront is all the AI needs to measure your sign area and mark where it goes.",
              },
              {
                step: "02",
                title: "Preview it lit up",
                desc: "Watch your new sign appear on your actual building — daylight and lit-at-night — before anyone touches metal.",
              },
              {
                step: "03",
                title: "Compare real quotes",
                desc: "Vetted sign companies near you bid within 24 hours. You pick the price and timeline.",
              },
            ].map((f) => (
              <div key={f.step} className="cut-corner-sm bg-background p-7">
                <p
                  className="font-mono text-3xl font-semibold mb-4 bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--gradient-brand)" }}
                >
                  {f.step}
                </p>
                <h3 className="font-heading font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function CheckMark({ stroke = "currentColor" }: { stroke?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 flex-shrink-0" style={{ color: stroke === "currentColor" ? "var(--color-brand-indigo)" : undefined }}>
      <path d="M3 8.5L6.2 11.5L13 4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// L-shaped marks at two opposite corners of the hero photo, matching the
// actual quad-selector's zone-marking UI from the order flow — a direct
// visual quote of the product's own interaction, not decoration.
function CornerBrackets() {
  const armStyle = "absolute h-6 w-6 border-white/80"
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`${armStyle} top-3.5 left-3.5 border-t-2 border-l-2`} />
      <div className={`${armStyle} bottom-3.5 right-3.5 border-b-2 border-r-2`} />
    </div>
  )
}
