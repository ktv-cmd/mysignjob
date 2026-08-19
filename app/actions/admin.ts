"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

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

  if (updateErr) {
    console.error("[approveSCInsuranceReview] failed to update sc_companies", updateErr)
    return { error: "Something went wrong saving the review. Please try again." }
  }
  return { status: nextStatus }
}

// The platform selects which bid "wins" on the client's behalf (per the orders
// schema's own comment: selected_bid_id is "filled after platform selects") —
// this is a concierge marketplace, not a raw multi-bid comparison the client
// picks from. Sets the order to 'quote_ready' so the client can review and pay
// the deposit, and rejects every other bid on that order.
export async function selectWinningBid(orderId: string, bidId: string): Promise<{ error?: string }> {
  const { supabase, user, error } = await requireAdmin()
  if (error || !user) return { error }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single()

  if (!order) return { error: "Order not found." }
  if (order.status !== "bidding" && order.status !== "submitted") {
    return { error: "This order is no longer open for bid selection." }
  }

  const { data: bid } = await supabase
    .from("bids")
    .select("id, order_id")
    .eq("id", bidId)
    .single()

  if (!bid || bid.order_id !== orderId) return { error: "Bid not found for this order." }

  const [{ error: winError }, { error: rejectError }, { error: orderError }] = await Promise.all([
    supabase.from("bids").update({ status: "selected" }).eq("id", bidId),
    supabase.from("bids").update({ status: "rejected" }).eq("order_id", orderId).neq("id", bidId),
    supabase.from("orders").update({ selected_bid_id: bidId, status: "quote_ready" }).eq("id", orderId),
  ])

  if (winError || rejectError || orderError) {
    console.error("[selectWinningBid] failed", { winError, rejectError, orderError })
    return { error: "Something went wrong selecting the winning bid. Please try again." }
  }

  revalidatePath("/admin/quotes")
  revalidatePath("/admin/orders")
  return {}
}

// Records the admin's written resolution for a dispute and closes it out.
// Disputes only ever move forward here (open/under_review -> resolved) —
// there's no unresolve action, matching how the dispute lifecycle is modeled
// in the schema (status defaults to 'open', admin_resolution is write-once).
export async function resolveDispute(disputeId: string, resolution: string): Promise<{ error?: string }> {
  const { supabase, user, error } = await requireAdmin()
  if (error || !user) return { error }

  const trimmed = resolution.trim()
  if (!trimmed) return { error: "A resolution note is required." }

  const { error: updateErr } = await supabase
    .from("disputes")
    .update({ status: "resolved", admin_resolution: trimmed })
    .eq("id", disputeId)

  if (updateErr) {
    console.error("[resolveDispute] failed to update disputes", updateErr)
    return { error: "Something went wrong saving the resolution. Please try again." }
  }

  revalidatePath("/admin/issues")
  return {}
}

// Thin void-returning wrappers for use directly as a <form action> — the native
// form action prop requires (formData) => void | Promise<void>, but the actions
// above return a result for potential future use elsewhere.
export async function selectWinningBidAction(orderId: string, bidId: string): Promise<void> {
  await selectWinningBid(orderId, bidId)
}

export async function approveSCInsuranceReviewAction(scId: string): Promise<void> {
  await approveSCInsuranceReview(scId)
}

export async function resolveDisputeAction(disputeId: string, formData: FormData): Promise<void> {
  await resolveDispute(disputeId, String(formData.get("resolution") ?? ""))
}
