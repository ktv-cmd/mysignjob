import { createClient } from "@/lib/supabase/server"
import { resolveDisputeAction } from "@/app/actions/admin"

const ROW_LIMIT = 200

interface DisputeRow {
  id: string
  order_id: string
  description: string
  status: string
  admin_resolution: string | null
  created_at: string
  orders: { sign_spec: { business_name?: string } } | null
  users: { email: string } | null
}

interface PreviewJobRow {
  id: string
  user_id: string
  status: string
  error: string | null
  created_at: string
  params: { businessName?: string; referenceId?: string } | null
}

export default async function AdminIssuesPage() {
  const supabase = await createClient()

  const [{ data: disputes, error: disputesError }, { data: failedJobs, error: jobsError }] = await Promise.all([
    supabase
      .from("disputes")
      // Explicit FK name required: disputes has two FKs into users territory
      // in spirit (raised_by is the only actual FK to users, but being explicit
      // keeps this resilient if another one is ever added).
      .select("*, orders(sign_spec), users!disputes_raised_by_fkey(email)")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("preview_jobs")
      .select("id, user_id, status, error, created_at, params")
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
  ])

  if (disputesError) console.error("[admin/issues] failed to load disputes", disputesError)
  if (jobsError) console.error("[admin/issues] failed to load preview_jobs", jobsError)

  const disputeRows = (disputes ?? []) as unknown as DisputeRow[]
  const jobRows = (failedJobs ?? []) as unknown as PreviewJobRow[]

  // preview_jobs.user_id references auth.users, not public.users, so there's
  // no FK for PostgREST to embed through — look up emails separately.
  const jobUserIds = [...new Set(jobRows.map((j) => j.user_id))]
  const { data: jobUsers } = jobUserIds.length
    ? await supabase.from("users").select("id, email").in("id", jobUserIds)
    : { data: [] as { id: string; email: string }[] }
  const jobUserEmail = new Map((jobUsers ?? []).map((u) => [u.id, u.email]))

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Issues</h1>
        <p className="text-muted-foreground mt-1">Disputes raised by users and failed AI sign-preview generations.</p>
      </div>

      {/* ── Disputes ── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Disputes</h2>
        {disputeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No disputes yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Raised by</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {disputeRows.map((d) => {
                  const isOpen = d.status !== "resolved"
                  return (
                    <tr key={d.id} className="border-t border-border align-top">
                      <td className="px-4 py-2">{d.orders?.sign_spec?.business_name ?? d.order_id.slice(0, 8)}</td>
                      <td className="px-4 py-2">{d.users?.email ?? "—"}</td>
                      <td className="px-4 py-2 max-w-xs">{d.description}</td>
                      <td className="px-4 py-2 capitalize">{d.status.replace("_", " ")}</td>
                      <td className="px-4 py-2">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2 min-w-[220px]">
                        {isOpen ? (
                          <form action={resolveDisputeAction.bind(null, d.id)} className="space-y-2">
                            <textarea
                              name="resolution"
                              required
                              rows={2}
                              placeholder="Resolution note…"
                              className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                            <button
                              type="submit"
                              className="text-xs bg-accent text-accent-foreground rounded-2xl px-3 py-1.5 font-medium hover:opacity-90"
                            >
                              Mark resolved
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">{d.admin_resolution}</span>
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

      {/* ── Failed sign previews ── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Failed sign previews</h2>
        {jobRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed preview generations.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Sign</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => (
                  <tr key={j.id} className="border-t border-border align-top">
                    <td className="px-4 py-2">{jobUserEmail.get(j.user_id) ?? j.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      {j.params?.businessName ?? "—"}
                      <div className="text-xs text-muted-foreground capitalize">{j.params?.referenceId?.replace("-", " ") ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2 max-w-md text-destructive">{j.error ?? "—"}</td>
                    <td className="px-4 py-2">{new Date(j.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
