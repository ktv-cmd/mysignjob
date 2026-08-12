"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { startStripeConnect, checkAndActivateSC } from "@/app/actions/sc-onboarding"

export default function StripeOnboardingPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<{
    status: string
    missing: string[]
  } | null>(null)

  const isReturn = searchParams.get("complete") === "1"
  const isRefresh = searchParams.get("refresh") === "1"

  useEffect(() => {
    if (isReturn || isRefresh) {
      checkAndActivateSC().then((result) => {
        setVerificationStatus(result)
        if (result.status === "active") {
          setTimeout(() => router.push("/sc/dashboard"), 2000)
        }
      })
    }
  }, [isReturn, isRefresh, router])

  async function handleConnect() {
    setLoading(true)
    setError(null)
    const result = await startStripeConnect()
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else if (result.url) {
      window.location.href = result.url
    }
  }

  if (isReturn && verificationStatus) {
    if (verificationStatus.status === "active") {
      return (
        <div className="text-center py-12 space-y-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-11 w-11 mx-auto"
            style={{ color: "var(--color-success)" }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.5 2.5L16 9" />
          </svg>
          <h1 className="text-2xl font-semibold">You&apos;re approved!</h1>
          <p className="text-muted-foreground">
            All checks passed. Taking you to your dashboard…
          </p>
        </div>
      )
    }

    if (verificationStatus.missing.length > 0) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Almost there</h1>
          <p className="text-muted-foreground">A few things still need attention:</p>
          <ul className="space-y-2">
            {verificationStatus.missing.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span className="capitalize">{item === "stripe" ? "Payout account not fully verified by Stripe yet" : item}</span>
              </li>
            ))}
          </ul>
          {verificationStatus.missing.includes("stripe") && (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="rounded-full text-white px-6 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {loading ? "Redirecting…" : "Continue Stripe verification"}
            </button>
          )}
        </div>
      )
    }
  }

  return (
    <div>
      <StepHeader step={4} />
      <div className="mt-6 space-y-6">
        <div className="border border-border rounded-2xl p-6 space-y-3">
          <h2 className="font-semibold">Secure payout setup via Stripe</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Mysignjobs.com uses Stripe Connect to send your earnings directly to your bank account.
            This also verifies your business identity (name, address, EIN) automatically — no
            manual review needed.
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>✓ Business name &amp; Tax ID verified by Stripe</li>
            <li>✓ Direct bank deposit for every job</li>
            <li>✓ Real-time payout tracking</li>
          </ul>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="rounded-full w-full text-white py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          {loading ? "Redirecting to Stripe…" : "Set up payouts with Stripe →"}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          Powered by Stripe. Mysignjobs.com never stores your banking details.
        </p>
      </div>
    </div>
  )
}

function StepHeader({ step }: { step: number }) {
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
      <h1 className="text-2xl font-semibold">Payout Setup</h1>
      <p className="text-muted-foreground mt-1">Connect your bank account to receive payments.</p>
    </div>
  )
}
