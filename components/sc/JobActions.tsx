"use client"

import { useActionState } from "react"
import { uploadInstallPhoto, submitJobForReview } from "@/app/actions/job"

export default function JobActions({ jobId, canSubmit }: { jobId: string; canSubmit: boolean }) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadInstallPhoto.bind(null, jobId), null)
  const [submitState, submitAction, submitPending] = useActionState(submitJobForReview.bind(null, jobId), null)

  return (
    <div className="space-y-4">
      <form action={uploadAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="text-sm max-w-full"
        />
        <button
          type="submit"
          disabled={uploadPending}
          className="text-xs bg-muted rounded-2xl px-3 py-1.5 font-medium hover:bg-muted/70 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {uploadPending ? "Uploading…" : "Upload photo"}
        </button>
      </form>
      {uploadState?.error && <p className="text-sm text-red-600">{uploadState.error}</p>}

      {canSubmit && (
        <form action={submitAction}>
          <button
            type="submit"
            disabled={submitPending}
            className="w-full bg-accent text-accent-foreground rounded-2xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitPending ? "Submitting…" : "Submit for Client Review"}
          </button>
        </form>
      )}
      {submitState?.error && <p className="text-sm text-red-600">{submitState.error}</p>}
    </div>
  )
}
