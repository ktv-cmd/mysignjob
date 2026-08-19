import { createClient } from "@/lib/supabase/server"

const ROW_LIMIT = 200

interface OrderRow {
  id: string
  status: string
  sign_spec: { business_name?: string; sign_type?: string }
  created_at: string
  users: { email: string } | null
  sc_companies: { name: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  disputed: "text-destructive",
  cancelled: "text-muted-foreground",
  completed: "text-emerald-600",
}

export default async function AdminOrdersPage() {
  const supabase = await createClient()

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, sign_spec, created_at, users!orders_client_id_fkey(email), sc_companies(name)")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT)

  if (error) console.error("[admin/orders] failed to load orders", error)
  const orderRows = (orders ?? []) as unknown as OrderRow[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-muted-foreground mt-1">Every order placed on the platform, most recent first.</p>
      </div>

      {orderRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assigned SC</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    {order.sign_spec?.business_name ?? order.id.slice(0, 8)}
                    <div className="text-xs text-muted-foreground capitalize">{order.sign_spec?.sign_type?.replace("_", " ") ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2">{order.users?.email ?? "—"}</td>
                  <td className={`px-4 py-2 capitalize ${STATUS_STYLES[order.status] ?? ""}`}>{order.status.replace("_", " ")}</td>
                  <td className="px-4 py-2">{order.sc_companies?.name ?? "—"}</td>
                  <td className="px-4 py-2">{new Date(order.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
