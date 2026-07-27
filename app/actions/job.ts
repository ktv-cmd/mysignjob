"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"
import { revalidatePath } from "next/cache"

type ActionState = { error?: string } | null

// Client accepts the platform-selected quote and pays the 50% deposit. The
// deposit is charged off-session (card was saved during onboarding) directly
// to the platform's Stripe account, then a matching share is transferred to
// the assigned SC's connected account (price minus their commission), mirroring
// the deposit/final split described in the client + SC agreements.
export async function acceptBid(orderId: string, _prevState: ActionState): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Please log in and try again." }

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, status, selected_bid_id")
    .eq("id", orderId)
    .single()

  if (!order || order.client_id !== user.id) return { error: "Order not found." }
  if (order.status !== "quote_ready" || !order.selected_bid_id) {
    return { error: "This order doesn't have a quote ready to accept." }
  }

  const { data: bid } = await supabase
    .from("bids")
    .select("id, sc_id, price_cents")
    .eq("id", order.selected_bid_id)
    .single()

  if (!bid) return { error: "Quote not found." }

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, stripe_account_id, commission_rate, status")
    .eq("id", bid.sc_id)
    .single()

  if (!sc || sc.status !== "active" || !sc.stripe_account_id) {
    return { error: "The assigned sign company isn't ready to accept jobs yet. Please contact support." }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id, payment_method_added")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_customer_id || !profile.payment_method_added) {
    return { error: "No payment method on file. Please add a card first." }
  }

  const methods = await stripe.paymentMethods.list({
    customer: profile.stripe_customer_id,
    type: "card",
    limit: 1,
  })
  const paymentMethodId = methods.data[0]?.id
  if (!paymentMethodId) return { error: "No card on file. Please add a payment method first." }

  const depositCents = Math.round(bid.price_cents * 0.5)

  let paymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: depositCents,
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { order_id: orderId, stage: "deposit" },
    })
  } catch (err) {
    console.error("[acceptBid] deposit charge failed", err)
    const message = err instanceof Error ? err.message : "Your card was declined."
    return { error: `Payment failed: ${message}. Please update your card and try again.` }
  }

  if (paymentIntent.status !== "succeeded") {
    console.error("[acceptBid] deposit charge did not succeed", paymentIntent.status)
    return { error: "Your card requires additional verification. Please contact support to complete payment." }
  }

  // Charge succeeded — the client has been billed. From here on, failures must
  // never be reported back as "payment failed" (they weren't); log and let ops
  // reconcile instead of re-charging or confusing the client.
  //
  // These writes (payments/jobs) use the service-role client deliberately: a
  // client session has no RLS insert policy for either table (correctly so —
  // a client must never be able to write its own "payment succeeded" row or
  // spawn a job directly). This is the trusted server step that runs only
  // after the Stripe charge above has actually succeeded.
  const serviceSupabase = createServiceRoleClient()

  const { error: paymentInsertErr } = await serviceSupabase.from("payments").insert({
    order_id: orderId,
    stripe_payment_intent_id: paymentIntent.id,
    amount_cents: depositCents,
    stage: "deposit",
    status: "succeeded",
  })
  if (paymentInsertErr) {
    console.error("[acceptBid] failed to record payments row after successful charge", paymentInsertErr, paymentIntent.id)
  }

  const { error: orderUpdateErr } = await supabase
    .from("orders")
    .update({ status: "deposit_paid", assigned_sc_id: sc.id })
    .eq("id", orderId)
  if (orderUpdateErr) {
    console.error("[acceptBid] failed to update order after successful charge", orderUpdateErr, paymentIntent.id)
  }

  const { error: jobInsertErr } = await serviceSupabase.from("jobs").insert({
    order_id: orderId,
    sc_id: sc.id,
    status: "active",
  })
  if (jobInsertErr) {
    console.error("[acceptBid] failed to create job row after successful charge", jobInsertErr, paymentIntent.id)
  }

  try {
    const transferCents = Math.round(depositCents * (1 - sc.commission_rate / 100))
    const transfer = await stripe.transfers.create({
      amount: transferCents,
      currency: "usd",
      destination: sc.stripe_account_id,
      metadata: { order_id: orderId, sc_id: sc.id, milestone: "job_start" },
    })
    const { error: transferInsertErr } = await serviceSupabase.from("transfers").insert({
      order_id: orderId,
      sc_id: sc.id,
      stripe_transfer_id: transfer.id,
      amount_cents: transferCents,
      milestone: "job_start",
    })
    if (transferInsertErr) {
      console.error("[acceptBid] failed to record transfers row", transferInsertErr, transfer.id)
    }
  } catch (err) {
    // The client's deposit is captured either way — a failed SC payout here
    // needs manual reconciliation, not a client-facing error.
    console.error("[acceptBid] SC transfer failed after successful client charge — needs manual reconciliation", err, orderId)
  }

  revalidatePath(`/order/${orderId}`)
  return null
}

const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"]
const PHOTO_MAX_BYTES = 10 * 1024 * 1024

async function requireJobOwner(jobId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, job: null, error: "Please log in and try again." }

  const { data: sc } = await supabase.from("sc_companies").select("id").eq("user_id", user.id).single()
  if (!sc) return { supabase, job: null, error: "Not authorized." }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, sc_id, order_id, status, install_photos")
    .eq("id", jobId)
    .single()

  if (!job || job.sc_id !== sc.id) return { supabase, job: null, error: "Job not found." }
  return { supabase, job, error: null as null }
}

// SC uploads an on-site installation photo — appended to jobs.install_photos.
export async function uploadInstallPhoto(jobId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, job, error } = await requireJobOwner(jobId)
  if (error || !job) return { error: error ?? "Job not found." }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "No file uploaded." }
  if (!ALLOWED_PHOTO_MIMES.includes(file.type)) return { error: "Photo must be a JPEG, PNG, or WebP image." }
  if (file.size > PHOTO_MAX_BYTES) return { error: "Photo exceeds the 10 MB size limit." }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const path = `install-photos/${jobId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from("public-assets")
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) {
    console.error("[uploadInstallPhoto] upload failed", uploadErr)
    return { error: "Could not upload your photo. Please try again." }
  }

  const { data: { publicUrl } } = supabase.storage.from("public-assets").getPublicUrl(path)

  const { error: updateErr } = await supabase
    .from("jobs")
    .update({ install_photos: [...(job.install_photos ?? []), publicUrl] })
    .eq("id", jobId)
  if (updateErr) {
    console.error("[uploadInstallPhoto] failed to save photo url", updateErr)
    return { error: "Could not save your photo. Please try again." }
  }

  revalidatePath(`/sc/jobs/${jobId}`)
  return null
}

// SC marks the job ready for the client's review — requires at least one
// installation photo. Works for both the first submission (status 'active')
// and a resubmission after the client requested changes (status 'revision').
export async function submitJobForReview(jobId: string, _prevState: ActionState): Promise<ActionState> {
  const { supabase, job, error } = await requireJobOwner(jobId)
  if (error || !job) return { error: error ?? "Job not found." }

  if (job.status !== "active" && job.status !== "revision") {
    return { error: "This job isn't awaiting submission." }
  }
  if (!job.install_photos || job.install_photos.length === 0) {
    return { error: "Please upload at least one installation photo first." }
  }

  // orders has no RLS update policy for the assigned SC (only the client or an
  // admin) — service role for that one write, same pattern as the payment
  // actions above, after ownership was already verified via requireJobOwner.
  const [{ error: jobErr }, { error: orderErr }] = await Promise.all([
    supabase.from("jobs").update({ status: "submitted" }).eq("id", jobId),
    createServiceRoleClient().from("orders").update({ status: "submitted_for_review" }).eq("id", job.order_id),
  ])

  if (jobErr || orderErr) {
    console.error("[submitJobForReview] failed", jobErr, orderErr)
    return { error: "Something went wrong submitting for review. Please try again." }
  }

  revalidatePath(`/sc/jobs/${jobId}`)
  revalidatePath("/sc/dashboard")
  return null
}

const MAX_REVISIONS_DEFAULT = 2

async function requireReviewableOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, order: null, job: null, error: "Please log in and try again." }

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, status, selected_bid_id, revision_count, max_revisions")
    .eq("id", orderId)
    .single()

  if (!order || order.client_id !== user.id) return { supabase, order: null, job: null, error: "Order not found." }
  if (order.status !== "submitted_for_review") {
    return { supabase, order: null, job: null, error: "This order isn't awaiting your review." }
  }

  const { data: job } = await supabase.from("jobs").select("id, sc_id, status").eq("order_id", orderId).single()
  if (!job) return { supabase, order: null, job: null, error: "Job not found." }

  return { supabase, order, job, error: null as null }
}

// Client approves the installation photos and pays the remaining balance in
// one step (mirroring how accepting a quote and paying the deposit are also
// combined) — charges the final amount off-session, transfers the SC's share
// for the job_approved milestone, and closes the job out as completed.
export async function approveJob(orderId: string, _prevState: ActionState): Promise<ActionState> {
  const { supabase, order, job, error } = await requireReviewableOrder(orderId)
  if (error || !order || !job) return { error: error ?? "Order not found." }

  const { data: bid } = await supabase
    .from("bids")
    .select("price_cents")
    .eq("id", order.selected_bid_id)
    .single()
  if (!bid) return { error: "Quote not found." }

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, stripe_account_id, commission_rate")
    .eq("id", job.sc_id)
    .single()
  if (!sc || !sc.stripe_account_id) return { error: "The assigned sign company isn't set up to receive payment. Please contact support." }

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id, payment_method_added")
    .eq("id", order.client_id)
    .single()
  if (!profile?.stripe_customer_id || !profile.payment_method_added) {
    return { error: "No payment method on file. Please add a card first." }
  }

  const methods = await stripe.paymentMethods.list({ customer: profile.stripe_customer_id, type: "card", limit: 1 })
  const paymentMethodId = methods.data[0]?.id
  if (!paymentMethodId) return { error: "No card on file. Please add a payment method first." }

  // Final balance = total minus what the deposit already collected — computed
  // this way (not price * 0.5 again) so the two charges always sum to exactly
  // the quoted price_cents even when it's an odd number of cents.
  const depositCents = Math.round(bid.price_cents * 0.5)
  const finalCents = bid.price_cents - depositCents

  let paymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: finalCents,
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { order_id: orderId, stage: "final" },
    })
  } catch (err) {
    console.error("[approveJob] final charge failed", err)
    const message = err instanceof Error ? err.message : "Your card was declined."
    return { error: `Payment failed: ${message}. Please update your card and try again.` }
  }

  if (paymentIntent.status !== "succeeded") {
    console.error("[approveJob] final charge did not succeed", paymentIntent.status)
    return { error: "Your card requires additional verification. Please contact support to complete payment." }
  }

  // Charge succeeded from here on — failures below need ops reconciliation,
  // never a client-facing "payment failed" (it didn't). Service-role client
  // for the same reason as acceptBid: no client-writable RLS policy exists
  // (or should exist) for payments inserts or job-completion updates.
  const serviceSupabase = createServiceRoleClient()

  const { error: paymentInsertErr } = await serviceSupabase.from("payments").insert({
    order_id: orderId,
    stripe_payment_intent_id: paymentIntent.id,
    amount_cents: finalCents,
    stage: "final",
    status: "succeeded",
  })
  if (paymentInsertErr) console.error("[approveJob] failed to record payments row", paymentInsertErr, paymentIntent.id)

  const now = new Date().toISOString()
  const [{ error: orderErr }, { error: jobErr }] = await Promise.all([
    supabase.from("orders").update({ status: "completed" }).eq("id", orderId),
    serviceSupabase.from("jobs").update({ status: "completed", client_approved_at: now }).eq("id", job.id),
  ])
  if (orderErr || jobErr) console.error("[approveJob] failed to close out order/job", orderErr, jobErr, paymentIntent.id)

  try {
    const transferCents = Math.round(finalCents * (1 - sc.commission_rate / 100))
    const transfer = await stripe.transfers.create({
      amount: transferCents,
      currency: "usd",
      destination: sc.stripe_account_id,
      metadata: { order_id: orderId, sc_id: sc.id, milestone: "job_approved" },
    })
    const { error: transferInsertErr } = await serviceSupabase.from("transfers").insert({
      order_id: orderId,
      sc_id: sc.id,
      stripe_transfer_id: transfer.id,
      amount_cents: transferCents,
      milestone: "job_approved",
    })
    if (transferInsertErr) console.error("[approveJob] failed to record transfers row", transferInsertErr, transfer.id)
  } catch (err) {
    console.error("[approveJob] SC final transfer failed after successful client charge — needs manual reconciliation", err, orderId)
  }

  revalidatePath(`/order/${orderId}`)
  return null
}

// Client requests changes instead of approving — sends the job back to the SC
// with notes, capped at the order's max_revisions.
export async function requestRevision(orderId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, order, job, error } = await requireReviewableOrder(orderId)
  if (error || !order || !job) return { error: error ?? "Order not found." }

  if (order.revision_count >= (order.max_revisions ?? MAX_REVISIONS_DEFAULT)) {
    return { error: "This order has reached its maximum number of revisions. Please contact support." }
  }

  const notes = String(formData.get("notes") ?? "").trim()
  if (!notes) return { error: "Please describe what needs to change." }

  // Service-role for the jobs update: the client isn't the job's SC owner
  // (jobs_update is scoped to sc_id ownership or admin), so this write has
  // no RLS path via the client's own session.
  const serviceSupabase = createServiceRoleClient()
  const [{ error: jobErr }, { error: orderErr }] = await Promise.all([
    serviceSupabase.from("jobs").update({ status: "revision", client_revision_notes: notes }).eq("id", job.id),
    supabase
      .from("orders")
      .update({ status: "revision_requested", revision_count: order.revision_count + 1 })
      .eq("id", orderId),
  ])

  if (jobErr || orderErr) {
    console.error("[requestRevision] failed", jobErr, orderErr)
    return { error: "Something went wrong sending your revision request. Please try again." }
  }

  revalidatePath(`/order/${orderId}`)
  return null
}
