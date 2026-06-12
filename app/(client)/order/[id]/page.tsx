import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import type { Order } from "@/types"

const STATUS_LABELS: Record<string, { label: string; description: string; step: number }> = {
  submitted:             { label: "Submitted",             description: "Your order is in our queue. We're broadcasting it to sign companies in your area.", step: 1 },
  bidding:               { label: "Collecting Bids",       description: "Sign companies are reviewing your project and preparing quotes (up to 24 hrs).", step: 2 },
  quote_ready:           { label: "Quote Ready",           description: "We've selected the best quote for you. Review and accept to move forward.", step: 3 },
  accepted:              { label: "Accepted",              description: "You've accepted the quote. Please pay the 50% deposit to get started.", step: 4 },
  deposit_paid:          { label: "Deposit Paid",          description: "Your sign company has been assigned and work is beginning.", step: 5 },
  in_progress:           { label: "In Progress",           description: "Your sign company is actively working on your project.", step: 6 },
  submitted_for_review:  { label: "Ready for Review",      description: "Your sign company has submitted install photos. Please approve or request revisions.", step: 7 },
  revision_requested:    { label: "Revision Requested",    description: "Your revision request has been sent. The sign company is making updates.", step: 7 },
  approved:              { label: "Approved",              description: "Installation approved! Final payment is due to complete the job.", step: 8 },
  completed:             { label: "Completed",             description: "Your sign project is complete. Thank you for using My Sign Job!", step: 9 },
  cancelled:             { label: "Cancelled",             description: "This order has been cancelled.", step: 0 },
  disputed:              { label: "Disputed",              description: "This order is under review. Our team will contact you shortly.", step: 0 },
  draft:                 { label: "Draft",                 description: "This order is a draft and has not been submitted.", step: 0 },
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
  if (!user) redirect("/login")

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800">
          <p className="font-semibold">Order submitted successfully!</p>
          <p className="text-sm mt-1">We'll notify you by email as quotes come in.</p>
        </div>
      )}

      {/* Status card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Order Status</p>
            <h1 className="text-2xl font-bold mt-1">{info.label}</h1>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-sm text-muted-foreground">{info.description}</p>
        {info.step > 0 && <ProgressBar step={info.step} total={9} />}
      </div>

      {/* Photos */}
      {(o.storefront_photo_url || o.ai_preview_url) && (
        <div className="grid grid-cols-2 gap-4">
          {o.storefront_photo_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Storefront Photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.storefront_photo_url} alt="Storefront" className="rounded-xl border border-border w-full" />
            </div>
          )}
          {o.ai_preview_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">AI Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.ai_preview_url} alt="AI Preview" className="rounded-xl border border-border w-full" />
            </div>
          )}
        </div>
      )}

      {/* Sign spec */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Sign Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Business Name" value={spec.business_name} />
          <Row label="Sign Type" value={SIGN_TYPE_LABELS[spec.sign_type] ?? spec.sign_type} />
          {spec.sign_type === "awning" && spec.awning_frame_style ? (
            <Row label="Frame Style" value={
              spec.awning_frame_style.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
            } />
          ) : (
            <Row label="Primary Color" value={
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-border inline-block" style={{ background: spec.primary_color }} />
                {spec.primary_color}
              </span>
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
            spec.secondary_color && (
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
          {(spec.width_inches || spec.height_inches) && (
            <Row label="Estimated Size" value={`${spec.width_inches ?? "?"}″ W × ${spec.height_inches ?? "?"}″ H`} />
          )}
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    bidding: "bg-yellow-100 text-yellow-800",
    quote_ready: "bg-purple-100 text-purple-800",
    accepted: "bg-indigo-100 text-indigo-800",
    deposit_paid: "bg-cyan-100 text-cyan-800",
    in_progress: "bg-orange-100 text-orange-800",
    submitted_for_review: "bg-pink-100 text-pink-800",
    revision_requested: "bg-amber-100 text-amber-800",
    approved: "bg-teal-100 text-teal-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    disputed: "bg-red-100 text-red-800",
    draft: "bg-muted text-muted-foreground",
  }
  const cls = colors[status] ?? "bg-muted text-muted-foreground"
  const label = STATUS_LABELS[status]?.label ?? status
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100)
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Step {step} of {total}</p>
    </div>
  )
}
