import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import type { Order } from "@/types"
import { formatCents } from "@/lib/utils"
import AcceptQuoteButton from "@/components/order/AcceptQuoteButton"
import ReviewJobActions from "@/components/order/ReviewJobActions"

const STATUS_LABELS: Record<string, { label: string; description: string; step: number }> = {
  submitted:             { label: "Submitted",             description: "Your order is in the queue. We're sending it to sign companies in your area.", step: 1 },
  bidding:               { label: "Collecting quotes",     description: "Sign companies are reviewing your project and preparing quotes — this takes up to 24 hours.", step: 2 },
  quote_ready:           { label: "Quote ready",           description: "A quote is ready for you. Review it and accept to move forward.", step: 3 },
  accepted:              { label: "Accepted",              description: "You've accepted the quote. Pay the 50% deposit to get started.", step: 4 },
  deposit_paid:          { label: "Deposit paid",          description: "Your sign company has been assigned and work is starting.", step: 5 },
  in_progress:           { label: "In progress",           description: "Your sign company is working on your project.", step: 6 },
  submitted_for_review:  { label: "Ready for review",      description: "Your sign company has submitted installation photos. Please approve them or request changes.", step: 7 },
  revision_requested:    { label: "Revision requested",    description: "Your revision request has been sent. The sign company is making the changes.", step: 7 },
  approved:              { label: "Approved",              description: "Installation approved. Final payment is due to close out the job.", step: 8 },
  completed:             { label: "Completed",             description: "Your sign is done. Thanks for using Mysignjobs.com.", step: 9 },
  cancelled:             { label: "Cancelled",             description: "This order has been cancelled.", step: 0 },
  disputed:              { label: "Disputed",              description: "This order is under review. Our team will be in touch shortly.", step: 0 },
  draft:                 { label: "Draft",                 description: "This order is a draft and hasn't been submitted yet.", step: 0 },
}

const SIGN_TYPE_LABELS: Record<string, string> = {
  flat_cut: "Flat-Cut Dimensional Letters",
  channel_letters: "3D Channel Letters",
  cabinet: "Illuminated Cabinet Lightbox",
  blade: "Blade Sign",
  window_vinyl: "Window Vinyl",
  monument: "Monument Sign",
  pylon: "Pylon Sign",
  awning: "Awning Sign",
  other: "Other",
}

const ILLUMINATION_LABELS: Record<string, string> = {
  none: "No illumination",
  internal_led: "Internal LED (front-lit)",
  external: "External flood-lit",
  halo: "Halo backlit",
  neon: "Neon",
  digital: "Digital LED",
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}) {
  const { id } = await params
  const { submitted } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/order/${id}`)}`)

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("client_id", user.id)
    .single()

  if (error || !order) redirect("/dashboard")

  const o = order as Order
  const info = STATUS_LABELS[o.status] ?? { label: o.status, description: "", step: 0 }
  const spec = o.sign_spec

  type SelectedBidInfo = { price_cents: number; timeline_days: number; sc_companies: { name: string } | null }
  let selectedBid: SelectedBidInfo | null = null
  if (o.status === "quote_ready" && o.selected_bid_id) {
    const { data } = await supabase
      .from("bids")
      .select("price_cents, timeline_days, sc_companies(name)")
      .eq("id", o.selected_bid_id)
      .single()
    selectedBid = data as SelectedBidInfo | null
  }

  type JobReviewInfo = { install_photos: string[]; client_revision_notes: string | null }
  let jobReview: JobReviewInfo | null = null
  let finalAmountCents = 0
  if (o.status === "submitted_for_review" || o.status === "revision_requested") {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("install_photos, client_revision_notes")
      .eq("order_id", o.id)
      .single()
    jobReview = jobData as JobReviewInfo | null

    if (o.status === "submitted_for_review" && o.selected_bid_id) {
      const { data: bidData } = await supabase
        .from("bids")
        .select("price_cents")
        .eq("id", o.selected_bid_id)
        .single()
      if (bidData) finalAmountCents = bidData.price_cents - Math.round(bidData.price_cents * 0.5)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {submitted && (
        <div className="bg-success/10 dark:bg-success/15 border border-success/30 rounded-2xl p-4 text-success">
          <p className="font-semibold">Order submitted.</p>
          <p className="text-sm mt-1">We'll email you as quotes come in.</p>
        </div>
      )}

      {/* Status card */}
      <div className="relative bg-card border border-border/70 rounded-2xl shadow-soft p-6 pt-7 space-y-3 overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: "var(--gradient-brand)" }} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Order Status</p>
            <h1 className="text-2xl font-semibold mt-1">{info.label}</h1>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-sm text-muted-foreground">{info.description}</p>
        {info.step > 0 && <ProgressBar step={info.step} total={9} />}
      </div>

      {/* Quote ready — review and pay deposit */}
      {selectedBid && (
        <div className="bg-card border border-accent/40 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Your Quote</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Sign Company</dt>
            <dd className="font-medium">{selectedBid.sc_companies?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Total Price</dt>
            <dd className="font-medium">{formatCents(selectedBid.price_cents)}</dd>
            <dt className="text-muted-foreground">Timeline</dt>
            <dd className="font-medium">{selectedBid.timeline_days} days</dd>
            <dt className="text-muted-foreground">Deposit Due Now (50%)</dt>
            <dd className="font-medium">{formatCents(Math.round(selectedBid.price_cents * 0.5))}</dd>
          </dl>
          <AcceptQuoteButton orderId={o.id} />
        </div>
      )}

      {/* Installation photos — review & approve or request changes */}
      {jobReview && (
        <div className="bg-card border border-border/70 rounded-2xl shadow-soft p-6 space-y-4">
          <h2 className="font-semibold">Installation Photos</h2>
          {jobReview.install_photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {jobReview.install_photos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={`Install photo ${i + 1}`} className="rounded-2xl border border-border w-full aspect-square object-cover" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
          )}

          {o.status === "submitted_for_review" && (
            <ReviewJobActions orderId={o.id} finalAmountCents={finalAmountCents} />
          )}
          {o.status === "revision_requested" && jobReview.client_revision_notes && (
            <div className="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl p-4">
              <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm">Your revision request</p>
              <p className="text-sm text-amber-700/90 dark:text-amber-400/90 mt-1 whitespace-pre-wrap">{jobReview.client_revision_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Photos */}
      {(o.storefront_photo_url || o.ai_preview_url) && (
        <div className="grid grid-cols-2 gap-4">
          {o.storefront_photo_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Storefront Photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.storefront_photo_url} alt="Storefront" className="rounded-2xl border border-border w-full" />
            </div>
          )}
          {o.ai_preview_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">AI Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.ai_preview_url} alt="AI Preview" className="rounded-2xl border border-border w-full" />
            </div>
          )}
        </div>
      )}

      {/* Sign spec */}
      <div className="bg-card border border-border/70 rounded-2xl shadow-soft p-6 space-y-4">
        <h2 className="font-semibold">Sign Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Business Name" value={spec.business_name} />
          <Row label="Sign Type" value={SIGN_TYPE_LABELS[spec.sign_type] ?? spec.sign_type} />
          {spec.sign_type === "awning" && spec.awning_frame_style ? (
            <Row label="Frame Style" value={
              spec.awning_frame_style.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
            } />
          ) : (
            <Row label="Color" value={
              spec.logo_color_match ? (
                <span className="flex items-center gap-2 flex-wrap">
                  <span>Matched to your logo — the sign company color-matches it exactly</span>
                  {spec.logo_color_match_hex?.letters && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-3.5 h-3.5 rounded-full border border-border inline-block" style={{ background: spec.logo_color_match_hex.letters }} />
                      {spec.logo_color_match_hex.letters}
                      {spec.logo_color_match_hex.panel && ` / ${spec.logo_color_match_hex.panel} panel`}
                      <span className="italic">(AI-estimated)</span>
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border border-border inline-block" style={{ background: spec.primary_color }} />
                  {spec.primary_color}
                </span>
              )
            } />
          )}
          {spec.sign_type === "awning" && spec.awning_fabric ? (
            <Row label="Sunbrella® Fabric" value={
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-border inline-block flex-shrink-0" style={{ background: spec.awning_fabric.hex }} />
                {spec.awning_fabric.name}
                <span className="text-xs text-muted-foreground">#{spec.awning_fabric.code}</span>
              </span>
            } />
          ) : (
            !spec.logo_color_match && spec.secondary_color && (
              <Row label="Secondary Color" value={
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border border-border inline-block" style={{ background: spec.secondary_color }} />
                  {spec.secondary_color}
                </span>
              } />
            )
          )}
          {spec.sign_type !== "awning" && spec.material && <Row label="Material" value={spec.material} />}
          <Row label="Illumination" value={ILLUMINATION_LABELS[spec.illumination] ?? spec.illumination} />
        </dl>
        {spec.custom_notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Additional Notes</p>
            <p className="text-sm whitespace-pre-wrap">{spec.custom_notes}</p>
          </div>
        )}
      </div>

      {/* Order meta */}
      <div className="text-xs text-muted-foreground flex justify-between">
        <span>Order ID: {o.id}</span>
        <span>Submitted {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>

      <Link
        href="/dashboard"
        className="inline-block text-sm text-muted-foreground hover:text-foreground underline"
      >
        ← Back to dashboard
      </Link>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </>
  )
}

// Same dot-badge dye lot as the dashboard's StatusBadge: brand hues carry
// meaning, tinted from a single hex so it reads correctly in both themes.
const STATUS_DYE: Record<string, string> = {
  submitted: "#4C7FB3",
  bidding: "#d97706",
  quote_ready: "#d97706",
  accepted: "#55508C",
  deposit_paid: "#55508C",
  in_progress: "#55508C",
  submitted_for_review: "#d97706",
  revision_requested: "#d97706",
  approved: "#15803d",
  completed: "#15803d",
  cancelled: "#dc2626",
  disputed: "#dc2626",
  draft: "#6b7280",
}

function StatusBadge({ status }: { status: string }) {
  const hex = STATUS_DYE[status] ?? "#6b7280"
  const label = STATUS_LABELS[status]?.label ?? status
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1 text-xs font-semibold"
      style={{ borderColor: `${hex}40`, backgroundColor: `${hex}14`, color: hex }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
      {label}
    </span>
  )
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100)
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-muted rounded-2xl overflow-hidden">
        <div className="h-full rounded-2xl transition-all" style={{ width: `${pct}%`, backgroundImage: "var(--gradient-brand)" }} />
      </div>
      <p className="text-xs text-muted-foreground">Step {step} of {total}</p>
    </div>
  )
}
