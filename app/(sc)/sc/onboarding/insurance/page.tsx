"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"

export default function InsurancePage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle")
  const [result, setResult] = useState<InsuranceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleUpload() {
    if (!file) return
    setStatus("uploading")
    setError(null)
    setResult(null)

    const fd = new FormData()
    fd.append("file", file)

    const res = await fetch("/api/sc/verify-insurance", { method: "POST", body: fd })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Upload failed.")
      setStatus("error")
      return
    }

    setResult(data)
    setStatus("done")
  }

  const verified = result?.verified === true
  const hasIssues = result && result.issues.length > 0

  return (
    <div>
      <StepHeader step={3} />

      <div className="mt-6 space-y-6">
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
          {file ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              <button
                onClick={() => { setFile(null); setResult(null); setStatus("idle") }}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-4xl">📄</div>
              <p className="text-sm font-medium">Upload your Certificate of Insurance</p>
              <p className="text-xs text-muted-foreground">PDF or image (JPG/PNG). Max 10MB.</p>
              <button
                onClick={() => inputRef.current?.click()}
                className="text-sm text-accent font-medium hover:underline"
              >
                Choose file
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
          />
        </div>

        {file && status !== "done" && (
          <button
            onClick={handleUpload}
            disabled={status === "uploading"}
            className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {status === "uploading" ? "Verifying with AI…" : "Verify Insurance"}
          </button>
        )}

        {error && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4">
            <p className="text-sm text-red-700 font-medium">Upload failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}

        {result && (
          <div className={`border rounded-xl p-5 space-y-3 ${verified ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{verified ? "✅" : "⚠️"}</span>
              <p className={`font-semibold text-sm ${verified ? "text-green-800" : "text-orange-800"}`}>
                {verified ? "Insurance verified successfully" : "Issues found — please resolve"}
              </p>
            </div>

            {result.extracted.named_insured && (
              <p className="text-xs text-muted-foreground">Named insured: {result.extracted.named_insured}</p>
            )}
            {result.extracted.gl_per_occurrence_cents && (
              <p className="text-xs text-muted-foreground">
                GL per occurrence: {formatCents(result.extracted.gl_per_occurrence_cents)} (required: {formatCents(result.required_gl_cents)})
              </p>
            )}
            {result.extracted.expires_at && (
              <p className="text-xs text-muted-foreground">Expires: {result.extracted.expires_at}</p>
            )}
            <p className="text-xs text-muted-foreground">Jurisdiction: {result.jurisdiction}</p>

            {hasIssues && (
              <ul className="space-y-1">
                {result.issues.map((issue: string, i: number) => (
                  <li key={i} className="text-xs text-orange-700 flex items-start gap-1">
                    <span>•</span><span>{issue}</span>
                  </li>
                ))}
              </ul>
            )}

            {!verified && (
              <button
                onClick={() => { setFile(null); setResult(null); setStatus("idle") }}
                className="text-xs text-accent font-medium hover:underline"
              >
                Upload a different certificate
              </button>
            )}
          </div>
        )}

        {verified && (
          <button
            onClick={() => router.push("/sc/onboarding/stripe")}
            className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Continue to Payout Setup →
          </button>
        )}
      </div>
    </div>
  )
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

interface InsuranceResult {
  verified: boolean
  extracted: {
    named_insured: string | null
    gl_per_occurrence_cents: number | null
    expires_at: string | null
  }
  issues: string[]
  jurisdiction: string
  required_gl_cents: number
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
      <h1 className="text-2xl font-bold">Insurance Certificate</h1>
      <p className="text-muted-foreground mt-1">
        Upload your Certificate of Insurance. Our AI verifies coverage automatically.
      </p>
    </div>
  )
}
