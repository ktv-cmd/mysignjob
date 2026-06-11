import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

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
      <header className="border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">My Sign Job</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link
              href="/register"
              className="bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-24 text-center max-w-3xl">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Your business sign, done right.
        </h1>
        <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
          Upload a photo of your storefront. Get an AI-powered preview. Receive competitive quotes
          from vetted local sign companies — all in one place.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/order/new"
            className="bg-accent text-accent-foreground px-8 py-3.5 rounded-xl text-base font-semibold hover:opacity-90 transition-opacity"
          >
            Get Your Sign →
          </Link>
          <Link
            href="/sc/register"
            className="border border-border px-8 py-3.5 rounded-xl text-base font-medium hover:bg-muted transition-colors"
          >
            I&apos;m a Sign Company
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-3 gap-8 text-left">
          {[
            { icon: "📸", title: "Upload a photo", desc: "Take a photo of your storefront. Our AI estimates dimensions automatically." },
            { icon: "🎨", title: "See it live", desc: "AI renders your sign on your actual building before you commit to anything." },
            { icon: "💰", title: "Get competitive quotes", desc: "Vetted sign companies bid on your job. You pick the best price and timeline." },
          ].map((f) => (
            <div key={f.title} className="border border-border rounded-xl p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
