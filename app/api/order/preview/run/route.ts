import { NextRequest, NextResponse } from "next/server"
import { runPreviewJob } from "@/lib/ai/preview"

export const maxDuration = 300

// Local/dev worker entrypoint. Triggered fire-and-forget by /preview/start under
// `next dev` (whose long-lived process can finish the work). On Netlify the
// background function is used instead — this route is not invoked there.
export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json() as { jobId?: string }
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })
    await runPreviewJob(jobId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[preview/run]", err)
    return NextResponse.json({ error: "Worker failed." }, { status: 500 })
  }
}
