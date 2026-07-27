import { createClient } from "@/lib/supabase/server"
import { approveSCInsuranceReviewAction, selectWinningBidAction } from "@/app/actions/admin"
import { formatCents } from "@/lib/utils"

const ROW_LIMIT = 200

interface BidRow {
  id: string
  order_id: string
  price_cents: number
  timeline_days: number
  notes: string | null
  status: string
  created_at: string
  orders: { id: string; status: string; sign_spec: { business_name?: string; sign_type?: string } } | null
  sc_companies: { name: string } | null
}

interface SCRow {
  id: string
  name: string
  status: string
  city: string | null
  state: string | null
  commission_rate: number
  agreement_signed_at: string | null
  insurance_verified: boolean
  insurance_reviewed_at: string | null
  stripe_onboarding_complete: boolean
  created_at: string
}

interface PaymentRow {
  id: string
  order_id: string
  amount_cents: number
  stage: string
  status: string
  created_at: string
  orders: { sign_spec: { business_name?: string } } | null
}

interface TransferRow {
  id: string
  order_id: string
  amount_cents: number
  milestone: string
  created_at: string
  sc_companies: { name: string } | null
  orders: { sign_spec: { business_name?: string } } | null
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [{ data: bids, error: bidsError }, { data: scCompanies }, { data: payments }, { data: transfers }] = await Promise.all([
    supabase
      .from("bids")
      // Explicit FK name required: orders<->bids has two relationships
      // (bids.order_id -> orders.id, and orders.selected_bid_id -> bids.id),
      // so PostgREST can't infer which one "orders(...)" should mean.
      .select("*, orders!bids_order_id_fkey(id, status, sign_spec), sc_companies(name)")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("sc_companies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("payments")
      .select("*, orders(sign_spec)")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("transfers")
      .select("*, sc_companies(name), orders(sign_spec)")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
  ])

  if (bidsError) console.error("[admin] failed to load bids", bidsError)
  const bidRows = (bids ?? []) as unknown as BidRow[]
  const scRows = (scCompanies ?? []) as unknown as SCRow[]
  const paymentRows = (payments ?? []) as unknown as PaymentRow[]
  const transferRows = (transfers ?? []) as unknown as TransferRow[]

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">All quotes, sign companies, and transactions in one place.</p>
      </div>

      {/* ── Quotes / Bids ── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Quotes</h2>
        {bidRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bids yet.</p>
        ) : (
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">SC</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Timeline</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Order status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {bidRows.map((bid) => {
                  const orderStatus = bid.orders?.status
                  const canSelect = bid.status === "pending" && (orderStatus === "bidding" || orderStatus === "submitted")
                  return (
                    <tr key={bid.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        {bid.orders?.sign_spec?.business_name ?? bid.order_id.slice(0, 8)}
                        <div className="text-xs text-muted-foreground capitalize">{bid.orders?.sign_spec?.sign_type?.replace("_", " ")}</div>
                      </td>
                      <td className="px-4 py-2">{bid.sc_companies?.name ?? "—"}</td>
                      <td className="px-4 py-2">{formatCents(bid.price_cents)}</td>
                      <td className="px-4 py-2">{bid.timeline_days}d</td>
                      <td className="px-4 py-2 capitalize">{bid.status}</td>
                      <td className="px-4 py-2 capitalize">{orderStatus ?? "—"}</td>
                      <td className="px-4 py-2">
                        {canSelect && (
                          <form action={selectWinningBidAction.bind(null, bid.order_id, bid.id)}>
                            <button
                              type="submit"
                              className="text-xs bg-accent text-accent-foreground rounded-lg px-3 py-1.5 font-medium hover:opacity-90"
                            >
                              Select as winner
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── SC Companies ── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Sign Companies</h2>
        {scRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sign companies yet.</p>
        ) : (
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Agreement</th>
                  <th className="px-4 py-2 font-medium">Insurance</th>
                  <th className="px-4 py-2 font-medium">Stripe</th>
                  <th className="px-4 py-2 font-medium">Commission</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {scRows.map((sc) => {
                  const needsReview = sc.insurance_verified && !sc.insurance_reviewed_at
                  return (
                    <tr key={sc.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{sc.name}</td>
                      <td className="px-4 py-2">{[sc.city, sc.state].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-4 py-2 capitalize">{sc.status}</td>
                      <td className="px-4 py-2">{sc.agreement_signed_at ? "✓" : "—"}</td>
                      <td className="px-4 py-2">
                        {sc.insurance_verified ? (sc.insurance_reviewed_at ? "✓ reviewed" : "⏳ needs review") : "—"}
                      </td>
                      <td className="px-4 py-2">{sc.stripe_onboarding_complete ? "✓" : "—"}</td>
                      <td className="px-4 py-2">{sc.commission_rate}%</td>
                      <td className="px-4 py-2">
                        {needsReview && (
                          <form action={approveSCInsuranceReviewAction.bind(null, sc.id)}>
                            <button
                              type="submit"
                              className="text-xs bg-accent text-accent-foreground rounded-lg px-3 py-1.5 font-medium hover:opacity-90"
                            >
                              Approve review
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Transactions ── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Transactions</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Client Payments</h3>
            {paymentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">Stage</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2">{p.orders?.sign_spec?.business_name ?? p.order_id.slice(0, 8)}</td>
                        <td className="px-3 py-2 capitalize">{p.stage}</td>
                        <td className="px-3 py-2">{formatCents(p.amount_cents)}</td>
                        <td className="px-3 py-2 capitalize">{p.status}</td>
                        <td className="px-3 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">SC Transfers</h3>
            {transferRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transfers yet.</p>
            ) : (
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">SC</th>
                      <th className="px-3 py-2 font-medium">Milestone</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferRows.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-3 py-2">{t.orders?.sign_spec?.business_name ?? t.order_id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{t.sc_companies?.name ?? "—"}</td>
                        <td className="px-3 py-2 capitalize">{t.milestone.replace("_", " ")}</td>
                        <td className="px-3 py-2">{formatCents(t.amount_cents)}</td>
                        <td className="px-3 py-2">{new Date(t.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
