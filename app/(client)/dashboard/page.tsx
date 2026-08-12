import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function ClientDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Your Orders</h1>
          <p className="text-muted-foreground mt-1">Track your sign projects</p>
        </div>
        <Link
          href="/order/new"
          className="rounded-full text-white px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          + New Sign
        </Link>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-2xl p-16 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 mx-auto mb-4"
            style={{ color: "var(--color-brand-indigo)" }}
            aria-hidden
          >
            <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
            <path d="M4 8l8 4 8-4M12 12v8" />
          </svg>
          <h2 className="text-xl mb-2">No orders yet</h2>
          <p className="text-muted-foreground mb-6">
            Upload a photo of your storefront and get a sign quote in minutes.
          </p>
          <Link
            href="/order/new"
            className="rounded-full text-white px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity inline-block"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            Get Your Sign
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/order/${order.id}`}
              className="block border border-border rounded-2xl p-6 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">
                    {order.sign_spec?.sign_type?.replace("_", " ") ?? "Sign"} —{" "}
                    {order.sign_spec?.business_name ?? "Untitled"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={order.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Dot-badge dye lot: brand hues carry the meaning (sky = queued, amber =
// needs attention, indigo = in motion, success/destructive = resolved), tint
// derived at render time so it reads correctly in both themes without a
// separate dark: palette per status.
const STATUS_DYE: Record<string, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#6b7280" },
  submitted: { label: "Submitted", hex: "#4C7FB3" },
  bidding: { label: "Getting Quotes", hex: "#d97706" },
  quote_ready: { label: "Quote Ready", hex: "#d97706" },
  accepted: { label: "Accepted", hex: "#55508C" },
  deposit_paid: { label: "In Progress", hex: "#55508C" },
  in_progress: { label: "In Progress", hex: "#55508C" },
  submitted_for_review: { label: "Review Needed", hex: "#d97706" },
  revision_requested: { label: "Revision", hex: "#d97706" },
  approved: { label: "Approved", hex: "#15803d" },
  completed: { label: "Completed", hex: "#15803d" },
  cancelled: { label: "Cancelled", hex: "#dc2626" },
  disputed: { label: "Disputed", hex: "#dc2626" },
}

function StatusBadge({ status }: { status: string }) {
  const { label, hex } = STATUS_DYE[status] ?? { label: status, hex: "#6b7280" }

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
