import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import SCNav from "@/components/sc/SCNav"

export default async function SCLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "sc") redirect("/dashboard")

  // Onboarding sub-routes (/sc/onboarding/*) have their own layout that also
  // checks role, so they are intentionally not redirected away here — the
  // role === "sc" check above is sufficient to gate the whole (sc) group while
  // still letting incomplete-onboarding users progress through those pages.

  return (
    <div className="min-h-screen bg-background">
      <SCNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
