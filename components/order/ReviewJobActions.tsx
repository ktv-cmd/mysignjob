"use client"

import { useActionState, useState } from "react"
import { approveJob, requestRevision } from "@/app/actions/job"
import { formatCents } from "@/lib/utils"

export default function ReviewJobActions({ orderId, finalAmountCents }: { orderId: string; finalAmountCents: number }) {
  const [mode, setMode] = useState<"choose" | "revision">("choose")
  const [approveState, approveAction, approvePending] = useActionState(approveJob.bind(null, orderId), null)
  const [revisionState, revisionAction, revisionPending] = useActionState(requestRevision.bind(null, orderId), null)

  return (
    <div className="space-y-3">
      {mode === "choose" ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setMode("revision")}
            className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50"
          >
            Request Changes
          </button>
          <form action={approveAction} className="flex-1">
            <button
              type="submit"
              disabled={approvePending}
              className="w-full bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {approvePending ? "Processing payment…" : `Approve & Pay Final Balance (${formatCents(finalAmountCents)})`}
            </button>
          </form>
        </div>
      ) : (
        <form action={revisionAction} className="space-y-3">
          <textarea
            name="notes"
            required
            rows={3}
            placeholder="What needs to change?"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={revisionPending}
              className="flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {revisionPending ? "Sending…" : "Send Revision Request"}
            </button>
          </div>
        </form>
      )}
      {approveState?.error && <p className="text-sm text-red-600">{approveState.error}</p>}
      {revisionState?.error && <p className="text-sm text-red-600">{revisionState.error}</p>}
    </div>
  )
}
