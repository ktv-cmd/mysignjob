"use client"

import { useActionState, useEffect, useState } from "react"
import { submitBid } from "@/app/actions/bid"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface OrderSpec {
  sign_type: string
  business_name: string
  width_inches?: number
  height_inches?: number
  primary_color: string
  secondary_color?: string | null
  material?: string | null
  illumination: string
  custom_notes?: string | null
}

interface OrderData {
  id: string
  status: string
  sign_spec: OrderSpec
  storefront_photo_url: string | null
  ai_preview_url: string | null
  bid_deadline_at: string
  created_at: string
  error?: string
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

// This page receives order data as search params (passed from dashboard link)
// and fetches the full order client-side via a small API
export default function SCQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [state, action, pending] = useActionState(submitBid, null)

  useEffect(() => {
    params.then(p => setOrderId(p.id))
  }, [params])

  useEffect(() => {
    if (!orderId) return
    fetch(`/api/sc/order/${orderId}`)
      .then(r => r.json())
      .then(data => { setOrder(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [orderId])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center text-muted-foreground">
        Loading order details…
      </div>
    )
  }

  if (!order || (order as { error?: string }).error) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <p className="text-muted-foreground mb-4">Order not found or no longer available.</p>
        <Link href="/sc/dashboard" className="text-accent underline text-sm">← Back to dashboard</Link>
      </div>
    )
  }

  const spec = order.sign_spec
  const deadline = new Date(order.bid_deadline_at as string)
  const hoursLeft = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 3600000))
  const closed = hoursLeft === 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/sc/dashboard" className="text-xs text-muted-foreground hover:text-foreground underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {spec.business_name} — Quote Request
        </h1>
        <p className={`text-sm mt-1 font-medium ${closed ? "text-red-500" : "text-accent"}`}>
          {closed ? "Bidding closed" : `${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""} left to submit your bid`}
        </p>
      </div>

      {/* Sign details */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Sign Specification</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Sign Type</dt>
          <dd className="font-medium">{SIGN_TYPE_LABELS[spec.sign_type] ?? spec.sign_type}</dd>

          <dt className="text-muted-foreground">Size</dt>
          <dd className="font-medium">{spec.width_inches ?? "?"}″ W × {spec.height_inches ?? "?"}″ H</dd>

          <dt className="text-muted-foreground">Primary Color</dt>
          <dd className="font-medium flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border border-border" style={{ background: spec.primary_color }} />
            {spec.primary_color}
          </dd>

          {spec.secondary_color && (
            <>
              <dt className="text-muted-foreground">Secondary Color</dt>
              <dd className="font-medium flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-border" style={{ background: spec.secondary_color }} />
                {spec.secondary_color}
              </dd>
            </>
          )}

          {spec.material && (
            <>
              <dt className="text-muted-foreground">Material</dt>
              <dd className="font-medium capitalize">{spec.material}</dd>
            </>
          )}

          <dt className="text-muted-foreground">Illumination</dt>
          <dd className="font-medium">{ILLUMINATION_LABELS[spec.illumination] ?? spec.illumination}</dd>
        </dl>

        {spec.custom_notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Client Notes</p>
            <p className="text-sm whitespace-pre-wrap">{spec.custom_notes}</p>
          </div>
        )}
      </div>

      {/* Photos */}
      {(order.storefront_photo_url || order.ai_preview_url) && (
        <div className="grid grid-cols-2 gap-4">
          {order.storefront_photo_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Storefront</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.storefront_photo_url as string} alt="Storefront" className="rounded-xl border border-border w-full" />
            </div>
          )}
          {order.ai_preview_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">AI Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.ai_preview_url as string} alt="AI Preview" className="rounded-xl border border-border w-full" />
            </div>
          )}
        </div>
      )}

      {/* Bid form */}
      {closed ? (
        <div className="bg-muted rounded-xl p-6 text-center text-muted-foreground text-sm">
          The bidding window for this order has closed.
        </div>
      ) : (
        <form action={action} className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="font-semibold">Submit Your Bid</h2>
          <input type="hidden" name="order_id" value={orderId ?? ""} />

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Your Price <span className="text-muted-foreground font-normal">(total, USD)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                type="number"
                name="price_dollars"
                min="1"
                step="0.01"
                placeholder="0.00"
                required
                className="w-full border border-border rounded-lg px-3 py-2 pl-7 bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Lead Time <span className="text-muted-foreground font-normal">(business days to complete)</span>
            </label>
            <select
              name="timeline_days"
              required
              defaultValue=""
              className="w-full border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="" disabled>Select lead time</option>
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7">1 week</option>
              <option value="10">10 days</option>
              <option value="14">2 weeks</option>
              <option value="21">3 weeks</option>
              <option value="30">30 days</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Any details about your approach, materials, or questions for the client…"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-accent resize-none text-sm"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-accent text-accent-foreground py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit Bid"}
          </button>
        </form>
      )}
    </div>
  )
}
