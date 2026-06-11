import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { signSCAgreement } from "@/app/actions/sc-onboarding"

export default async function SCOnboardingAgreementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("agreement_signed_at, insurance_verified, stripe_onboarding_complete, status")
    .eq("user_id", user.id)
    .single()

  if (!sc) redirect("/login")

  // Already signed — skip to next incomplete step
  if (sc.agreement_signed_at) {
    if (!sc.insurance_verified) redirect("/sc/onboarding/insurance")
    if (!sc.stripe_onboarding_complete) redirect("/sc/onboarding/stripe")
    redirect("/sc/dashboard")
  }

  return (
    <div>
      <OnboardingSteps current={1} />
      <div className="mt-6 mb-4">
        <h1 className="text-2xl font-bold">Partner Agreement</h1>
        <p className="text-muted-foreground mt-1">
          Review and accept before setting up your profile.
        </p>
      </div>

      <div className="border border-border rounded-xl p-6 max-h-72 overflow-y-auto text-sm leading-relaxed space-y-4 bg-muted/20">
        <p className="font-semibold">My Sign Job — Sign Company Partner Agreement</p>
        <p>
          By accepting this agreement, your company ("Sign Company") agrees to be bound by the
          terms of the My Sign Job platform. This is a placeholder; final legal text will replace
          this before launch.
        </p>
        <p>
          <strong>Scope.</strong> Sign Company agrees to receive sign fabrication and installation
          jobs through the platform, submit competitive bids, and complete accepted jobs to the
          client's specifications.
        </p>
        <p>
          <strong>Payments.</strong> Sign Company will receive payment via Stripe Connect transfer.
          Payout schedule: 25% at job kickoff, 62.5% on client final approval. My Sign Job retains
          a 12.5% platform commission from each job.
        </p>
        <p>
          <strong>Verification.</strong> Sign Company must maintain valid general liability
          insurance meeting jurisdictional requirements and keep their Stripe Connect account in
          good standing. Failure to maintain verification results in suspension.
        </p>
        <p>
          <strong>Conduct.</strong> Sign Company agrees not to solicit clients off-platform for
          jobs introduced via My Sign Job. Disputes are resolved via the platform dispute process.
        </p>
      </div>

      <form action={signSCAgreement} className="mt-6 space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required className="mt-1" />
          <span>I have read and accept the Partner Agreement on behalf of my company.</span>
        </label>
        <button
          type="submit"
          className="bg-accent text-accent-foreground rounded-lg px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Accept &amp; Continue
        </button>
      </form>
    </div>
  )
}

function OnboardingSteps({ current }: { current: number }) {
  const steps = ["Agreement", "Business Info", "Insurance", "Payout Setup"]
  return (
    <div className="flex items-center gap-2 mb-2">
      {steps.map((label, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-accent text-accent-foreground" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
              {done ? "✓" : step}
            </div>
            <span className={`text-xs ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

export { OnboardingSteps }
