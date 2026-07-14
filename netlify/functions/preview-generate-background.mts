// Netlify Background Function — production worker for async AI preview generation.
// The `-background` filename suffix makes Netlify return 202 immediately and run
// this for up to 15 minutes, well past the synchronous function timeout that was
// causing 504s. Triggered by /api/order/preview/start.
//
// Note: requires sharp's native libs in the bundle — see [functions."preview-generate-background"]
// included_files in netlify.toml.
import { runPreviewJob } from "../../lib/ai/preview"

export default async (req: Request): Promise<Response> => {
  // Verify shared secret so external callers cannot trigger arbitrary job runs.
  const workerSecret = process.env.PREVIEW_WORKER_SECRET
  if (!workerSecret || req.headers.get("x-worker-secret") !== workerSecret) {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const { jobId } = (await req.json()) as { jobId?: string }
    if (!jobId) return new Response("jobId required", { status: 400 })
    await runPreviewJob(jobId)
    return new Response("ok")
  } catch (err) {
    console.error("[preview-generate-background]", err)
    // runPreviewJob already records errors on the job row; just acknowledge.
    return new Response("error", { status: 500 })
  }
}
