"use server"

import { createClient } from "@/lib/supabase/server"
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
  if (next && next.startsWith("/")) redirect(next)
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
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "sc", full_name: fullName } },
  })
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from("sc_companies").insert({ user_id: user.id, name: companyName })
  }

  redirect("/check-email")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
