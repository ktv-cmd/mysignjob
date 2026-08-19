import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { formatCents } from "@/lib/utils"

const OPEN_ORDER_STATUSES_EXCLUDED = ["completed", "cancelled"]
const OPEN_DISPUTE_STATUSES = ["open", "under_review"]
const GMV_ROW_LIMIT = 1000

export default async function AdminOverviewPage() {
  const supabase = await createClient()
  const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: openOrders },
    { count: activeCompanies },
    { count: pendingReviews },
    { count: openDisputes },
    { count: failedPreviews },
    { data: succeededPayments },
  ] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).not("status", "in", `(${OPEN_ORDER_STATUSES_EXCLUDED.join(",")})`),
    supabase.from("sc_companies").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("sc_companies").select("id", { count: "exact", head: true }).eq("insurance_verified", true).is("insurance_reviewed_at", null),
    supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", OPEN_DISPUTE_STATUSES),
    supabase.from("preview_jobs").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", sevenDaysAgo),
    supabase.from("payments").select("amount_cents").eq("status", "succeeded").limit(GMV_ROW_LIMIT),
  ])

  const gmvCents = (succeededPayments ?? []).reduce((sum, p) => sum + p.amount_cents, 0)

  const tiles = [
    { label: "Open orders", value: openOrders ?? 0, href: "/admin/orders" },
    { label: "Active sign companies", value: activeCompanies ?? 0, href: "/admin/companies" },
    { label: "SC reviews pending", value: pendingReviews ?? 0, href: "/admin/companies" },
    { label: "Open disputes", value: openDisputes ?? 0, href: "/admin/issues" },
    { label: "Failed previews (7d)", value: failedPreviews ?? 0, href: "/admin/issues" },
    { label: "Payment volume", value: formatCents(gmvCents), href: "/admin/transactions" },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground mt-1">Where things stand across the platform right now.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="border border-border rounded-2xl p-5 hover:border-accent transition-colors"
          >
            <div className="text-2xl font-semibold">{tile.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{tile.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
