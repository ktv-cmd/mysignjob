"use client"

import { useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { confirmPaymentMethod } from "@/app/actions/onboarding"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function PaymentForm() {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.clientSecret) setClientSecret(d.clientSecret)
        else setError(d.error ?? "Could not start payment setup.")
      })
      .catch(() => setError("Could not start payment setup."))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!clientSecret) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <CardForm />
    </Elements>
  )
}

function CardForm() {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.")
      setSubmitting(false)
      return
    }

    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    })

    if (confirmError) {
      setError(confirmError.message ?? "Could not save your card.")
      setSubmitting(false)
      return
    }

    const result = await confirmPaymentMethod()
    if (result && "error" in result) {
      setError(result.error)
      setSubmitting(false)
    }
    // On success, confirmPaymentMethod redirects to /dashboard.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? "Saving…" : "Save card & continue"}
      </button>
    </form>
  )
}
