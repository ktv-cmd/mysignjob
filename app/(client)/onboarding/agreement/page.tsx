import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { signClientAgreement } from "@/app/actions/onboarding"

export default async function AgreementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("agreement_signed_at, payment_method_added")
    .eq("id", user.id)
    .single()

  if (profile?.agreement_signed_at) {
    redirect(profile.payment_method_added ? "/dashboard" : "/onboarding/payment")
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Step 1 of 2</p>
        <h1 className="text-2xl font-bold mt-1">Service Agreement</h1>
        <p className="text-muted-foreground mt-1">
          Please review and accept before placing your first order.
        </p>
      </div>

      <div className="border border-border rounded-xl p-6 max-h-80 overflow-y-auto text-sm leading-relaxed space-y-4 bg-muted/20">
        <p className="font-semibold">My Sign Job — Customer Service Agreement</p>
        <p>
          This is a placeholder agreement. By accepting, you agree that My Sign Job acts as a broker
          connecting you with vetted, independent sign companies. Quotes are provided by these
          companies; My Sign Job facilitates payment via escrow.
        </p>
        <p>
          <strong>Payments.</strong> A 50% deposit is collected once a sign company is assigned and
          becomes non-refundable when work begins. The remaining 50% is collected upon your approval
          of the completed work.
        </p>
        <p>
          <strong>AI previews and size estimates</strong> are approximations for visualization only.
          The assigned sign company will verify final measurements on-site.
        </p>
        <p>
          <strong>Cancellation &amp; disputes.</strong> Cancellation terms and a structured dispute
          process apply as described in your dashboard. Final agreement text will replace this
          placeholder before launch.
        </p>
      </div>

      <form action={signClientAgreement} className="mt-6">
        <label className="flex items-start gap-2 text-sm mb-4">
          <input type="checkbox" required className="mt-1" />
          <span>I have read and agree to the Service Agreement above.</span>
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
