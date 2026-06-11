"use client"

import { useActionState } from "react"
import { saveBusinessInfo, type SCOnboardingState } from "@/app/actions/sc-onboarding"
import { Field } from "@/components/auth/AuthUI"

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
]

export default function BusinessInfoPage() {
  const [state, action, pending] = useActionState<SCOnboardingState, FormData>(saveBusinessInfo, null)

  return (
    <div>
      <StepHeader step={2} title="Business Information" subtitle="Tell us about your company." />

      <form action={action} className="space-y-4 mt-6">
        <Field label="Tax ID (EIN)" name="ein" placeholder="12-3456789" required />
        <Field label="Business address" name="address_line1" placeholder="123 Main St" required />
        <Field label="Suite / Unit (optional)" name="address_line2" placeholder="Suite 100" />

        <div className="grid grid-cols-2 gap-4">
          <Field label="City" name="city" required />
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <select
              name="state"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select…</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <Field label="ZIP code" name="zip" required />

        <div>
          <label className="block text-sm font-medium mb-1">
            Service radius <span className="text-muted-foreground font-normal">(miles from your address)</span>
          </label>
          <select
            name="service_radius_miles"
            defaultValue="25"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="10">10 miles — neighborhood only</option>
            <option value="25">25 miles — city &amp; nearby suburbs</option>
            <option value="50">50 miles — metro area</option>
            <option value="100">100 miles — regional</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            You&apos;ll only receive job requests within this distance from your address.
          </p>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  )
}

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  const steps = ["Agreement", "Business Info", "Insurance", "Payout Setup"]
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {steps.map((label, i) => {
          const s = i + 1
          const done = s < step
          const active = s === step
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-accent text-accent-foreground" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {done ? "✓" : s}
              </div>
              <span className={`text-xs ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
              {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          )
        })}
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}
