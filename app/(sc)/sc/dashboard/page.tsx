import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { formatCents } from "@/lib/utils"

export default async function SCDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!sc) redirect("/sc/onboarding")
  if (!sc.agreement_signed_at) redirect("/sc/onboarding")
  if (!sc.insurance_verified) redirect("/sc/onboarding/insurance")
  if (!sc.stripe_onboarding_complete) redirect("/sc/onboarding/stripe")
  if (sc.status !== "active") {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-xl font-bold mb-2">Verification in Progress</h1>
        <p className="text-muted-foreground mb-4">
          All your information has been submitted. Stripe is finalizing your identity verification —
          this usually takes a few minutes. Refresh the page to check your status.
        </p>
        <a
          href="/sc/dashboard"
          className="text-sm text-accent font-medium hover:underline"
        >
          Refresh status
        </a>
      </div>
    )
  }

  // Open quote requests (bidding status, within 24hr window, SC hasn't bid yet)
  const { data: openOrders } = await supabase
    .from("orders")
    .select("*, bids!left(id, sc_id)")
    .eq("status", "bidding")
    .gt("bid_deadline_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  // Active jobs for this SC
  const { data: activeJobs } = await supabase
    .from("jobs")
    .select("*, orders(sign_spec, storefront_photo_url)")
    .eq("sc_id", sc.id)
    .neq("status", "completed")
    .order("created_at", { ascending: false })

  // Recent transfers
  const { data: recentTransfers } = await supabase
    .from("transfers")
    .select("*")
    .eq("sc_id", sc.id)
    .order("created_at", { ascending: false })
    .limit(5)

  const openForMe = openOrders?.filter(
    (o) => !o.bids?.some((b: { sc_id: string }) => b.sc_id === sc.id)
  ) ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{sc.name}</h1>
        <p className="text-muted-foreground">SC Portal</p>
      </div>

      {/* Open Quote Requests */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          Open Quote Requests{" "}
          {openForMe.length > 0 && (
            <span className="ml-2 bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full">
              {openForMe.length}
            </span>
          )}
        </h2>

        {openForMe.length === 0 ? (
          <div className="border border-border rounded-xl p-8 text-center text-muted-foreground">
            No open quote requests right now. Check back soon.
          </div>
        ) : (
          <div className="space-y-3">
            {openForMe.map((order) => {
              const deadline = new Date(order.bid_deadline_at)
              const hoursLeft = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 3600000))
              return (
                <Link
                  key={order.id}
                  href={`/sc/quotes/${order.id}`}
                  className="block border border-border rounded-xl p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {order.sign_spec?.sign_type?.replace("_", " ")} —{" "}
                        {order.sign_spec?.business_name}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {order.sign_spec?.width_inches}"W × {order.sign_spec?.height_inches}"H
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-accent">
                        {hoursLeft}h left to bid
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Submit your price</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Active Jobs */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
        {!activeJobs || activeJobs.length === 0 ? (
          <div className="border border-border rounded-xl p-8 text-center text-muted-foreground">
            No active jobs.
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <Link
                key={job.id}
                href={`/sc/jobs/${job.id}`}
                className="block border border-border rounded-xl p-5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {(job.orders as { sign_spec?: { business_name?: string } })?.sign_spec?.business_name ?? "Job"}
                  </p>
                  <span className="text-xs px-2 py-1 bg-muted rounded-full capitalize">
                    {job.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Payouts */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Recent Payouts</h2>
        {!recentTransfers || recentTransfers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payouts yet.</p>
        ) : (
          <div className="space-y-2">
            {recentTransfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium capitalize">{t.milestone.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-semibold text-green-600">{formatCents(t.amount_cents)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
