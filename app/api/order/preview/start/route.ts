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

    const body = await req.json() as { imageDataUrl?: string; logoDataUrl?: string } & PreviewJobParams
    const { imageDataUrl, logoDataUrl, quad } = body

    if (!imageDataUrl) return NextResponse.json({ error: "imageDataUrl required" }, { status: 400 })
    if (!quad || (quad.length !== 4 && quad.length !== 6)) {
      return NextResponse.json({ error: "4- or 6-point quad required" }, { status: 400 })
    }

    const jobId = crypto.randomUUID()

    // Upload the input photo to Storage so the worker can fetch it (avoids passing
    // multi-MB base64 through the job row / function payload). Downscale first —
    // phone photos are huge and slow every downstream step; the quad is normalized
    // (0–1) so resizing doesn't affect the mask geometry.
    // @ts-ignore — sharp's types resolve oddly under package.json exports
    const sharp = (await import("sharp")).default as typeof import("sharp")
    const rawPhoto = Buffer.from(imageDataUrl.split(",")[1]!, "base64")
    const photoBuffer = await sharp(rawPhoto)
      .rotate() // honor EXIF orientation before stripping metadata
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
    const photoPath = `preview-inputs/${user.id}/${jobId}.jpg`
    const { error: photoErr } = await supabase.storage
      .from("documents")
      .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: true })
    if (photoErr) return NextResponse.json({ error: `Photo upload failed: ${photoErr.message}` }, { status: 500 })

    // Upload the logo if present.
    let logoPath: string | undefined
    if (logoDataUrl) {
      const ext = logoDataUrl.includes("image/png") ? "png" : "jpg"
      logoPath = `preview-inputs/${user.id}/${jobId}-logo.${ext}`
      const logoBuffer = Buffer.from(logoDataUrl.split(",")[1]!, "base64")
      await supabase.storage.from("documents").upload(logoPath, logoBuffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: true,
      })
    }

    // Persist only the small generation params + storage paths (no base64).
    const params: PreviewJobParams = {
      quad,
      referenceId: body.referenceId,
      lightingType: body.lightingType,
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
    if (insertErr) return NextResponse.json({ error: `Could not create job: ${insertErr.message}` }, { status: 500 })

    // Trigger the worker. On Netlify use a background function (15-min limit); the
    // POST returns 202 quickly so we can await it. Locally, fire-and-forget into a
    // normal route — next dev's long-lived process finishes the work.
    //
    // NETLIFY is only reliable at build time, not at function runtime. Use LOCAL_DEV
    // as an explicit opt-in so the default (background function) fires in production.
    const origin = new URL(req.url).origin
    const isLocal = process.env.LOCAL_DEV === "true"
    if (isLocal) {
      // Do NOT await — let it run in the background of the dev server.
      void fetch(`${origin}/api/order/preview/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      }).catch(err => console.error("[preview/start] local trigger failed", err))
    } else {
      await fetch(`${origin}/.netlify/functions/preview-generate-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      }).catch(err => console.error("[preview/start] background trigger failed", err))
    }

    return NextResponse.json({ jobId })
  } catch (err) {
    console.error("[preview/start]", err)
    return NextResponse.json({ error: "Failed to start preview job." }, { status: 500 })
  }
}
