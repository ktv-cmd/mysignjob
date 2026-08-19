import { createClient } from "@/lib/supabase/server"
import { selectWinningBidAction } from "@/app/actions/admin"
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

export default async function AdminQuotesPage() {
  const supabase = await createClient()

  const { data: bids, error: bidsError } = await supabase
    .from("bids")
    // Explicit FK name required: orders<->bids has two relationships
    // (bids.order_id -> orders.id, and orders.selected_bid_id -> bids.id),
    // so PostgREST can't infer which one "orders(...)" should mean.
    .select("*, orders!bids_order_id_fkey(id, status, sign_spec), sc_companies(name)")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT)

  if (bidsError) console.error("[admin/quotes] failed to load bids", bidsError)
  const bidRows = (bids ?? []) as unknown as BidRow[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="text-muted-foreground mt-1">All bids submitted by sign companies.</p>
      </div>

      {bidRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bids yet.</p>
      ) : (
        <div className="border border-border rounded-2xl overflow-x-auto">
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
                            className="text-xs bg-accent text-accent-foreground rounded-2xl px-3 py-1.5 font-medium hover:opacity-90"
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
    </div>
  )
}
