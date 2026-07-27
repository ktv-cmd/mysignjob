"use client"

import { useActionState } from "react"
import { acceptBid } from "@/app/actions/job"

export default function AcceptQuoteButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(acceptBid.bind(null, orderId), null)

  return (
    <div className="space-y-2">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? "Processing payment…" : "Accept & Pay Deposit"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  )
}
