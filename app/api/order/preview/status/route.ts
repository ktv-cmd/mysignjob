import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { ColorReport } from "@/lib/ai/preview"

// Polling endpoint — returns the current status of a preview job and, when done,
// the public URLs of the generated previews. RLS ensures users only see their own.
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: job, error } = await supabase
    .from("preview_jobs")
    .select("status, result_urls, result_colors, error, user_id")
    .eq("id", jobId)
    .single()

  if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  // IDOR guard: only the owning user may read this job.
  if (job.user_id !== user.id) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  return NextResponse.json({
    status: job.status,
    previewUrls: (job.result_urls as string[] | null) ?? [],
    // AI-reported color(s), parallel to previewUrls — only set for
    // logoColorMatch variants; null for everything else.
    previewColors: (job.result_colors as (ColorReport | null)[] | null) ?? [],
    // job.error holds the raw exception text (provider API errors, storage
    // upload failures, etc.) — kept in the DB for the admin Issues page, but
    // never sent to the client: it can be a raw third-party API error payload,
    // which isn't meaningful to a customer and shouldn't be exposed to them.
    error: job.status === "error" ? "We couldn't generate your preview right now. Please try again." : null,
  })
}
