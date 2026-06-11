"use server"

import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export async function signClientAgreement() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const hdrs = await headers()
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

  await supabase
    .from("users")
    .update({ agreement_signed_at: new Date().toISOString(), agreement_ip: ip })
    .eq("id", user.id)

  redirect("/onboarding/payment")
}

export async function confirmPaymentMethod() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_customer_id) return { error: "No payment profile found." }

  const { stripe } = await import("@/lib/stripe/server")
  const methods = await stripe.paymentMethods.list({
    customer: profile.stripe_customer_id,
    type: "card",
    limit: 1,
  })

  if (methods.data.length === 0) return { error: "No card on file yet." }

  await supabase.from("users").update({ payment_method_added: true }).eq("id", user.id)
  redirect("/dashboard")
}
