import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import JobActions from "@/components/sc/JobActions"

interface JobRow {
  id: string
  status: string
  install_photos: string[]
  client_revision_notes: string | null
  orders: {
    id: string
    status: string
    sign_spec: { business_name?: string; sign_type?: string }
    storefront_photo_url: string | null
    ai_preview_url: string | null
  } | null
}

export default async function SCJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/sc/jobs/${id}`)}`)

  const { data: sc } = await supabase.from("sc_companies").select("id").eq("user_id", user.id).single()
  if (!sc) redirect("/sc/onboarding")

  const { data } = await supabase
    .from("jobs")
    .select("id, status, install_photos, client_revision_notes, orders(id, status, sign_spec, storefront_photo_url, ai_preview_url)")
    .eq("id", id)
    .eq("sc_id", sc.id)
    .single()

  if (!data) redirect("/sc/dashboard")
  const job = data as unknown as JobRow
  const order = job.orders

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{order?.sign_spec?.business_name ?? "Job"}</h1>
        <p className="text-muted-foreground mt-1 capitalize">
          {order?.sign_spec?.sign_type?.replace(/_/g, " ")} · Status: {job.status}
        </p>
      </div>

      {job.status === "revision" && job.client_revision_notes && (
        <div className="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl p-4">
          <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm">Client requested changes</p>
          <p className="text-sm text-amber-700/90 dark:text-amber-400/90 mt-1 whitespace-pre-wrap">{job.client_revision_notes}</p>
        </div>
      )}

      {job.status === "submitted" && (
        <div className="border border-border rounded-2xl p-4 text-sm" style={{ backgroundColor: "#4C7FB314", color: "var(--color-brand-sky)" }}>
          Waiting for the client to review your installation photos.
        </div>
      )}

      {job.status === "completed" && (
        <div className="bg-success/10 dark:bg-success/15 border border-success/30 rounded-2xl p-4 text-success text-sm">
          Job completed — final payment has been processed.
        </div>
      )}

      {(order?.storefront_photo_url || order?.ai_preview_url) && (
        <div className="grid grid-cols-2 gap-4">
          {order?.storefront_photo_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Storefront Photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.storefront_photo_url} alt="Storefront" className="rounded-2xl border border-border w-full" />
            </div>
          )}
          {order?.ai_preview_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">AI Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.ai_preview_url} alt="AI Preview" className="rounded-2xl border border-border w-full" />
            </div>
          )}
        </div>
      )}

      <div className="bg-card border border-border/70 rounded-2xl shadow-soft p-6 space-y-4">
        <h2 className="font-semibold">Installation Photos</h2>
        {job.install_photos && job.install_photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {job.install_photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`Install photo ${i + 1}`} className="rounded-2xl border border-border w-full aspect-square object-cover" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
        )}

        {(job.status === "active" || job.status === "revision") && (
          <JobActions jobId={job.id} canSubmit />
        )}
      </div>

      <Link href="/sc/dashboard" className="inline-block text-sm text-muted-foreground hover:text-foreground underline">
        ← Back to dashboard
      </Link>
    </div>
  )
}
