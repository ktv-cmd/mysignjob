"use server"

import { createClient } from "@/lib/supabase/server"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: "Not authenticated." }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") return { supabase, user: null as null, error: "Forbidden." }

  return { supabase, user, error: null as null }
}

// Confirms a human reviewed the AI-extracted insurance certificate for this SC.
// Only flips status to 'active' if every other onboarding gate (agreement,
// Stripe payouts) already passed — otherwise the SC stays 'pending_review'
// until those catch up, and checkAndActivateSC finishes the job.
export async function approveSCInsuranceReview(scId: string): Promise<{ error?: string; status?: string }> {
  const { supabase, user, error } = await requireAdmin()
  if (error || !user) return { error }

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("agreement_signed_at, stripe_onboarding_complete, insurance_verified, status")
    .eq("id", scId)
    .single()

  if (!sc) return { error: "SC not found." }
  if (!sc.insurance_verified) return { error: "Insurance has not passed automated verification yet." }

  const nextStatus =
    sc.agreement_signed_at && sc.stripe_onboarding_complete ? "active" : sc.status

  const { error: updateErr } = await supabase
    .from("sc_companies")
    .update({
      insurance_reviewed_at: new Date().toISOString(),
      insurance_reviewed_by: user.id,
      status: nextStatus,
    })
    .eq("id", scId)

  if (updateErr) return { error: updateErr.message }
  return { status: nextStatus }
}
