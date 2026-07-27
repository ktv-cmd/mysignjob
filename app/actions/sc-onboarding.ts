"use server"

import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { stripe } from "@/lib/stripe/server"
import type { SupabaseClient } from "@supabase/supabase-js"

// Shared gate check used both by the client-triggered poll below (checkAndActivateSC)
// and by the Stripe webhook (account.updated), so an SC can go active purely from
// the webhook firing — not just when the user happens to be back in the app polling.
// Takes the sc_companies row's known gate fields directly so callers can pass
// either a freshly-fetched row (client path) or the webhook's own lookup.
export async function activateSCIfEligible(
  supabase: SupabaseClient,
  sc: {
    id: string
    status: string
    agreement_signed_at: string | null
    insurance_verified: boolean
    insurance_reviewed_at: string | null
    stripe_onboarding_complete: boolean
  }
): Promise<{ status: string; missing: string[] }> {
  const missing: string[] = []

  if (!sc.agreement_signed_at) missing.push("agreement")
  if (!sc.insurance_verified) missing.push("insurance")
  // insurance_verified only means the AI-extracted certificate passed rule checks —
  // an admin still has to confirm the extraction before the SC can go live.
  if (sc.insurance_verified && !sc.insurance_reviewed_at) missing.push("admin_review")
  if (!sc.stripe_onboarding_complete) missing.push("stripe")

  if (missing.length === 0 && sc.status !== "active") {
    await supabase.from("sc_companies").update({ status: "active" }).eq("id", sc.id)
    return { status: "active", missing: [] }
  }

  return { status: sc.status, missing }
}

// ─── Step 1: Sign SC agreement ───────────────────────────────────────────────

export async function signSCAgreement() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const hdrs = await headers()
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

  await supabase
    .from("sc_companies")
    .update({ agreement_signed_at: new Date().toISOString(), agreement_ip: ip })
    .eq("user_id", user.id)

  redirect("/sc/onboarding/business")
}

// ─── Step 2: Save business info ──────────────────────────────────────────────

export type SCOnboardingState = { error: string } | null

export async function saveBusinessInfo(
  _prev: SCOnboardingState,
  formData: FormData
): Promise<SCOnboardingState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const ein = String(formData.get("ein") ?? "").replace(/\D/g, "")
  const address_line1 = String(formData.get("address_line1") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const zip = String(formData.get("zip") ?? "").trim()
  const service_radius_miles = parseInt(String(formData.get("service_radius_miles") ?? "25"), 10)

  if (ein.length !== 9) return { error: "EIN must be 9 digits (e.g. 12-3456789)." }
  if (!address_line1 || !city || !state || !zip)
    return { error: "Please fill in all address fields." }
  // City feeds a jurisdiction lookup key elsewhere — keep it to characters a
  // real city name can contain so that key can never smuggle query syntax.
  if (!/^[a-zA-Z\s\-'.]+$/.test(city))
    return { error: "City can only contain letters, spaces, and hyphens." }
  if (isNaN(service_radius_miles) || service_radius_miles < 1 || service_radius_miles > 500)
    return { error: "Service radius must be between 1 and 500 miles." }

  // Geocode the address via a free/simple approach using the US Census geocoder
  let lat: number | null = null
  let lng: number | null = null
  try {
    const geocodeUrl =
      `https://geocoding.geo.census.gov/geocoder/locations/address?` +
      `street=${encodeURIComponent(address_line1)}&city=${encodeURIComponent(city)}` +
      `&state=${encodeURIComponent(state)}&zip=${encodeURIComponent(zip)}` +
      `&benchmark=2020&format=json`
    const geo = await fetch(geocodeUrl)
    const geoData = await geo.json()
    const match = geoData?.result?.addressMatches?.[0]?.coordinates
    if (match) { lat = match.y; lng = match.x }
  } catch { /* geocoding is best-effort */ }

  const { error } = await supabase
    .from("sc_companies")
    .update({
      ein,
      address_line1,
      address_line2: String(formData.get("address_line2") ?? "").trim() || null,
      city,
      state,
      zip,
      service_radius_miles: isNaN(service_radius_miles) ? 25 : service_radius_miles,
      lat,
      lng,
    })
    .eq("user_id", user.id)

  if (error) {
    console.error("[saveBusinessInfo] failed to save business info", error)
    return { error: "Something went wrong saving your business info. Please try again." }
  }
  redirect("/sc/onboarding/insurance")
}

// ─── Step 4: Create Stripe Connect account + onboarding link ─────────────────

export async function startStripeConnect(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const { data: profile } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", user.id)
    .single()

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, name, stripe_account_id, city, state")
    .eq("user_id", user.id)
    .single()

  if (!sc) return { error: "SC profile not found." }

  let accountId = sc.stripe_account_id

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: profile?.email ?? undefined,
      business_type: "company",
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { supabase_user_id: user.id, sc_id: sc.id },
    })
    accountId = account.id

    await supabase
      .from("sc_companies")
      .update({ stripe_account_id: accountId })
      .eq("user_id", user.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/sc/onboarding/stripe?refresh=1`,
    return_url: `${appUrl}/sc/onboarding/stripe?complete=1`,
    type: "account_onboarding",
  })

  return { url: link.url }
}

// ─── Auto status-flip: check all gates and activate if all pass ───────────────

export async function checkAndActivateSC(): Promise<{ status: string; missing: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: "unauthenticated", missing: [] }

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!sc) return { status: "not_found", missing: [] }

  // Check Stripe payouts_enabled directly (live poll) in case the webhook hasn't
  // landed yet — the webhook is the primary path, this is the client-side fallback.
  let stripeOnboardingComplete = sc.stripe_onboarding_complete
  if (sc.stripe_account_id && !stripeOnboardingComplete) {
    try {
      const account = await stripe.accounts.retrieve(sc.stripe_account_id)
      stripeOnboardingComplete = account.payouts_enabled ?? false
      if (stripeOnboardingComplete) {
        await supabase
          .from("sc_companies")
          .update({ stripe_onboarding_complete: true })
          .eq("user_id", user.id)
      }
    } catch { /* stripe error — keep as false */ }
  }

  return activateSCIfEligible(supabase, { ...sc, stripe_onboarding_complete: stripeOnboardingComplete })
}
