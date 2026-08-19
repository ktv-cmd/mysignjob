import { createClient } from "@/lib/supabase/server"
import { formatCents } from "@/lib/utils"

const ROW_LIMIT = 200

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

export default async function AdminTransactionsPage() {
  const supabase = await createClient()

  const [{ data: payments }, { data: transfers }] = await Promise.all([
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

  const paymentRows = (payments ?? []) as unknown as PaymentRow[]
  const transferRows = (transfers ?? []) as unknown as TransferRow[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-muted-foreground mt-1">Client payments and sign-company transfers.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Client Payments</h3>
          {paymentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="border border-border rounded-2xl overflow-x-auto">
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
            <div className="border border-border rounded-2xl overflow-x-auto">
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
    </div>
  )
}
