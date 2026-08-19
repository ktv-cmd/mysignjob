import { createClient } from "@/lib/supabase/server"
import { approveSCInsuranceReviewAction } from "@/app/actions/admin"

const ROW_LIMIT = 200

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

export default async function AdminCompaniesPage() {
  const supabase = await createClient()

  const { data: scCompanies } = await supabase
    .from("sc_companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT)

  const scRows = (scCompanies ?? []) as unknown as SCRow[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign Companies</h1>
        <p className="text-muted-foreground mt-1">Every sign company on the platform.</p>
      </div>

      {scRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sign companies yet.</p>
      ) : (
        <div className="border border-border rounded-2xl overflow-x-auto">
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
                      {sc.insurance_verified ? (sc.insurance_reviewed_at ? "✓ reviewed" : "⋯ needs review") : "—"}
                    </td>
                    <td className="px-4 py-2">{sc.stripe_onboarding_complete ? "✓" : "—"}</td>
                    <td className="px-4 py-2">{sc.commission_rate}%</td>
                    <td className="px-4 py-2">
                      {needsReview && (
                        <form action={approveSCInsuranceReviewAction.bind(null, sc.id)}>
                          <button
                            type="submit"
                            className="text-xs bg-accent text-accent-foreground rounded-2xl px-3 py-1.5 font-medium hover:opacity-90"
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
    </div>
  )
}
