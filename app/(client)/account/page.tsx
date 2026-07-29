import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AccountForm from "@/components/client/AccountForm"

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/account")

  const { data: profile } = await supabase
    .from("users")
    .select("email, full_name, phone, role")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-muted-foreground mt-1">Manage your contact details</p>
      </div>
      <AccountForm email={profile.email} fullName={profile.full_name} phone={profile.phone} role={profile.role} />
    </div>
  )
}
