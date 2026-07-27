"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { redirect } from "next/navigation"

export type AuthState = { error: string } | null

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const next = String(formData.get("next") ?? "").trim()

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Could not sign in." }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role === "admin") redirect("/admin")
  if (profile?.role === "sc") redirect("/sc/dashboard")
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) redirect(next)
  redirect("/dashboard")
}

export async function signUpClient(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const fullName = String(formData.get("full_name") ?? "").trim()

  if (password.length < 8) return { error: "Password must be at least 8 characters." }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "client", full_name: fullName } },
  })
  if (error) return { error: error.message }

  redirect("/check-email")
}

export async function signUpSC(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const fullName = String(formData.get("full_name") ?? "").trim()
  const companyName = String(formData.get("company_name") ?? "").trim()

  if (password.length < 8) return { error: "Password must be at least 8 characters." }
  if (!companyName) return { error: "Company name is required." }

  const supabase = await createClient()
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "sc", full_name: fullName } },
  })
  if (error) return { error: error.message }

  const user = signUpData?.user
  if (user) {
    // DB trigger hardcodes role='client'; override server-side with service role.
    // The sc_companies insert must also use the service client: at this point the
    // user has no active session yet (email confirmation is pending), so the
    // per-request client has no auth.uid() and the RLS insert policy would fail.
    const serviceClient = createServiceRoleClient()
    await serviceClient.from("users").update({ role: "sc" }).eq("id", user.id)
    const { error: scError } = await serviceClient
      .from("sc_companies")
      .insert({ user_id: user.id, name: companyName })
    if (scError) {
      console.error("[signUpSC] failed to create sc_companies row", scError)
      return { error: "Something went wrong setting up your account. Please contact support." }
    }
  }

  redirect("/check-email")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

// Called after signInAnonymously() on the client — persists name + phone to
// the public.users row that the DB trigger created for the anonymous user.
export async function saveGuestProfile(fullName: string, phone: string, email?: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }
  const update: Record<string, string> = { full_name: fullName, phone }
  if (email) update.email = email
  const { error } = await supabase.from("users").update(update).eq("id", user.id)

  if (error?.code === "23505") {
    // Every guest checkout mints a brand-new anonymous user (no login), so a
    // returning guest who reuses their email collides with the account it's
    // already attached to — expected, not a real error. Retry without the
    // email so the order still saves; phone remains the primary contact and
    // email was already optional in the UI.
    if (!email) return { error: "Something went wrong saving your details. Please try again." }
    const { error: retryError } = await supabase.from("users").update({ full_name: fullName, phone }).eq("id", user.id)
    return retryError ? { error: "Something went wrong saving your details. Please try again." } : {}
  }

  // Never surface raw database error text to the client.
  return error ? { error: "Something went wrong saving your details. Please try again." } : {}
}
