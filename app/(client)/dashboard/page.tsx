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

  // Gate: must sign agreement and add payment method
  if (!profile.agreement_signed_at) redirect("/onboarding/agreement")
  if (!profile.payment_method_added) redirect("/onboarding/payment")

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Your Orders</h1>
          <p className="text-muted-foreground mt-1">Track your sign projects</p>
        </div>
        <Link
          href="/order/new"
          className="bg-accent text-accent-foreground px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          + New Sign
        </Link>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-xl p-16 text-center">
          <div className="text-4xl mb-4">🪧</div>
          <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
          <p className="text-muted-foreground mb-6">
            Upload a photo of your storefront and get a sign quote in minutes.
          </p>
          <Link
            href="/order/new"
            className="bg-accent text-accent-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity inline-block"
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
              className="block border border-border rounded-xl p-6 hover:bg-muted/50 transition-colors"
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "bg-muted text-muted-foreground" },
    submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700" },
    bidding: { label: "Getting Quotes", color: "bg-yellow-100 text-yellow-700" },
    quote_ready: { label: "Quote Ready", color: "bg-purple-100 text-purple-700" },
    accepted: { label: "Accepted", color: "bg-green-100 text-green-700" },
    deposit_paid: { label: "In Progress", color: "bg-green-100 text-green-700" },
    in_progress: { label: "In Progress", color: "bg-green-100 text-green-700" },
    submitted_for_review: { label: "Review Needed", color: "bg-orange-100 text-orange-700" },
    revision_requested: { label: "Revision", color: "bg-orange-100 text-orange-700" },
    approved: { label: "Approved", color: "bg-green-100 text-green-700" },
    completed: { label: "Completed", color: "bg-green-100 text-green-700" },
    cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
    disputed: { label: "Disputed", color: "bg-red-100 text-red-700" },
  }

  const { label, color } = map[status] ?? { label: status, color: "bg-muted text-muted-foreground" }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
