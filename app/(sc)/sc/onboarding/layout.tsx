import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function SCOnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "sc") redirect("/dashboard")

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="font-bold text-lg">
            My Sign Job
          </Link>
          <span className="ml-2 text-sm text-muted-foreground">· Partner Application</span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-10 max-w-2xl">{children}</main>
    </div>
  )
}
