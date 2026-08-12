import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { PreviewJobParams } from "@/lib/ai/preview"

// Kicks off an async preview-generation job: uploads the input photo (+ logo) to
// Storage, creates a preview_jobs row, triggers the background worker, and returns
// the job id for the client to poll. Returns fast so serverless timeouts aren't hit.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Rate-limit: each job runs a paid Gemini image-generation call, so an
    // unbounded loop of requests is a cost-DoS, not just a nuisance.
    const RATE_LIMIT_MAX = 5
    const RATE_LIMIT_WINDOW_MIN = 15
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString()
    const { count: recentJobCount } = await supabase
      .from("preview_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart)
    if ((recentJobCount ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: `Too many preview requests. Please wait a few minutes and try again.` },
        { status: 429 }
      )
    }

    const body = await req.json() as { imageDataUrl?: string; logoDataUrl?: string } & PreviewJobParams
    const { imageDataUrl, logoDataUrl, quad } = body

    if (!imageDataUrl) return NextResponse.json({ error: "imageDataUrl required" }, { status: 400 })
    if (!quad || (quad.length !== 4 && quad.length !== 6)) {
      return NextResponse.json({ error: "4- or 6-point quad required" }, { status: 400 })
    }

    // Fix: validate MIME type and cap size before decoding base64 (memory DoS prevention).
    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"]
    const PHOTO_MAX_DECODED = 10 * 1024 * 1024  // 10 MB
    const LOGO_MAX_DECODED  =  5 * 1024 * 1024  //  5 MB

    const photoMime = imageDataUrl.match(/^data:([^;]+);base64,/)?.[1]
    if (!photoMime || !ALLOWED_MIME.includes(photoMime)) {
      return NextResponse.json({ error: "Photo must be a JPEG, PNG, or WebP image." }, { status: 400 })
    }
    // base64 encodes 3 bytes as 4 chars, so decoded size ≈ base64Length * 0.75
    const photoBase64 = imageDataUrl.split(",")[1] ?? ""
    if (photoBase64.length * 0.75 > PHOTO_MAX_DECODED) {
      return NextResponse.json({ error: "Photo exceeds the 10 MB size limit." }, { status: 400 })
    }

    if (logoDataUrl) {
      const logoMime = logoDataUrl.match(/^data:([^;]+);base64,/)?.[1]
      if (!logoMime || !ALLOWED_MIME.includes(logoMime)) {
        return NextResponse.json({ error: "Logo must be a JPEG, PNG, or WebP image." }, { status: 400 })
      }
      const logoBase64 = logoDataUrl.split(",")[1] ?? ""
      if (logoBase64.length * 0.75 > LOGO_MAX_DECODED) {
        return NextResponse.json({ error: "Logo exceeds the 5 MB size limit." }, { status: 400 })
      }
    }

    const jobId = crypto.randomUUID()

    // Upload the input photo to Storage so the worker can fetch it (avoids passing
    // multi-MB base64 through the job row / function payload). Downscale first —
    // phone photos are huge and slow every downstream step; the quad is normalized
    // (0–1) so resizing doesn't affect the mask geometry.
    // @ts-ignore — sharp's types resolve oddly under package.json exports
    const sharp = (await import("sharp")).default as typeof import("sharp")
    const rawPhoto = Buffer.from(photoBase64, "base64")
    const photoBuffer = await sharp(rawPhoto)
      .rotate() // honor EXIF orientation before stripping metadata
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
    const photoPath = `preview-inputs/${user.id}/${jobId}.jpg`
    const { error: photoErr } = await supabase.storage
      .from("documents")
      .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: true })
    if (photoErr) {
      console.error("[preview/start] photo upload failed", photoErr)
      return NextResponse.json({ error: "Could not upload your photo. Please try again." }, { status: 500 })
    }

    // Upload the logo if present. MIME type and size were already validated above.
    let logoPath: string | undefined
    if (logoDataUrl) {
      // Already validated above (ALLOWED_MIME check), so the match is guaranteed here.
      const logoMime = logoDataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? "image/jpeg"
      const ext = logoMime === "image/png" ? "png" : logoMime === "image/webp" ? "webp" : "jpg"
      const candidateLogoPath = `preview-inputs/${user.id}/${jobId}-logo.${ext}`
      const logoBuffer = Buffer.from(logoDataUrl.split(",")[1]!, "base64")
      const { error: logoErr } = await supabase.storage.from("documents").upload(candidateLogoPath, logoBuffer, {
        contentType: logoMime,
        upsert: true,
      })
      if (logoErr) {
        console.error("[preview/start] logo upload failed — preview will proceed without a logo", logoErr)
      } else {
        logoPath = candidateLogoPath
      }
    }

    // Persist only the small generation params + storage paths (no base64).
    const params: PreviewJobParams = {
      quad,
      referenceId: body.referenceId,
      lightingType: body.lightingType,
      illuminated: body.illuminated,
      seeThroughLetters: body.seeThroughLetters,
      businessName: body.businessName,
      brandMode: body.brandMode,
      fontStyle: body.fontStyle,
      letterColor: body.letterColor,
      awningFrame: body.awningFrame,
      fabricName: body.fabricName,
      awningIllumination: body.awningIllumination,
      panelFace: body.panelFace ?? null,
      panelBg: body.panelBg ?? null,
      hasBackground: body.hasBackground,
      bgMaterial: body.bgMaterial,
      acrylic: body.acrylic ?? null,
      logoColorMatch: body.logoColorMatch,
      count: body.count ?? 3,
      customPrompt: body.customPrompt,
      photoPath,
      logoPath,
    }

    const { error: insertErr } = await supabase.from("preview_jobs").insert({
      id: jobId,
      user_id: user.id,
      status: "pending",
      params,
    })
    if (insertErr) {
      console.error("[preview/start] failed to create preview_jobs row", insertErr)
      return NextResponse.json({ error: "Could not start your preview. Please try again." }, { status: 500 })
    }

    // Trigger the worker. On Netlify use a background function (15-min limit); the
    // POST returns 202 quickly so we can await it. Locally, fire-and-forget into a
    // normal route — next dev's long-lived process finishes the work.
    //
    // NETLIFY is only reliable at build time, not at function runtime. Use LOCAL_DEV
    // as an explicit opt-in so the default (background function) fires in production.
    const workerSecret = process.env.PREVIEW_WORKER_SECRET
    if (!workerSecret) {
      // Fail closed: refuse to trigger an unauthenticated worker.
      console.error("[preview/start] PREVIEW_WORKER_SECRET is not set — aborting trigger")
      return NextResponse.json({ error: "Server misconfiguration: worker secret not set." }, { status: 500 })
    }

    const origin = new URL(req.url).origin
    const isLocal = process.env.LOCAL_DEV === "true"
    if (isLocal) {
      // Do NOT await — let it run in the background of the dev server.
      void fetch(`${origin}/api/order/preview/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
        body: JSON.stringify({ jobId }),
      }).catch(err => console.error("[preview/start] local trigger failed", err))
    } else {
      await fetch(`${origin}/.netlify/functions/preview-generate-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
        body: JSON.stringify({ jobId }),
      }).catch(err => console.error("[preview/start] background trigger failed", err))
    }

    return NextResponse.json({ jobId })
  } catch (err) {
    console.error("[preview/start]", err)
    return NextResponse.json({ error: "Failed to start preview job." }, { status: 500 })
  }
}
