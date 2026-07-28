"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { SignSpec } from "@/types"
import { isPlausibleDimension, validateQuadMatchesRatio, MAX_REFERENCE_INCHES } from "@/lib/sign-geometry"

// Corner signs store width_inches as the sum of front + side — tolerance for
// float rounding in the client's own addition, not a real proportion check
// (that's validateSignSpecQuadRatio's job).
const CORNER_WIDTH_SUM_TOLERANCE_INCHES = 0.5

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB decoded
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

function validateDataUrl(dataUrl: string, label: string): string | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/)
  if (!match) return `${label}: invalid data URL format.`
  const mimeType = match[1].toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return `${label}: unsupported image type "${mimeType}". Only JPEG, PNG, and WebP are allowed.`
  const base64 = dataUrl.split(",")[1]
  const decodedSize = Math.floor((base64.length * 3) / 4)
  if (decodedSize > MAX_IMAGE_BYTES) return `${label}: image exceeds the 10 MB limit.`
  return null
}

// First-ever server-side check on sign_spec's numeric fields — the client
// already enforces this, but nothing stopped a crafted request from bypassing
// it and storing a bogus size that quoting/fabrication would then run with.
function validateSignSpecDimensions(spec: SignSpec): string | null {
  if (!isPlausibleDimension(spec.width_inches)) return "Sign width is missing or out of range."
  if (!isPlausibleDimension(spec.height_inches)) return "Sign height is missing or out of range."
  // reference_inches never reaches the AI pipeline or pricing directly (it's
  // only used client-side to derive width/height, which are checked above),
  // but it's stored verbatim in sign_spec — validate it too so nothing
  // unbounded lands in the database.
  if (spec.reference_inches != null && !isPlausibleDimension(spec.reference_inches, MAX_REFERENCE_INCHES)) {
    return "Reference length is missing or out of range."
  }
  if (spec.is_corner) {
    if (spec.front_width_inches == null || !isPlausibleDimension(spec.front_width_inches)) return "Front width is missing or out of range."
    if (spec.side_width_inches == null || !isPlausibleDimension(spec.side_width_inches)) return "Side width is missing or out of range."
    const sum = spec.front_width_inches + spec.side_width_inches
    if (Math.abs(sum - spec.width_inches) > CORNER_WIDTH_SUM_TOLERANCE_INCHES) {
      return "Sign width doesn't match the front and side widths combined."
    }
  }
  return null
}

// Ties the numeric width/height (used for quoting) to the drawn quad (the
// only thing the AI preview pipeline actually renders into) so a client
// can't submit a quad that's been stretched or skewed away from the sign's
// real proportions. image_aspect_ratio is required whenever a quad is
// present — the legitimate client flow always sets it (OrderNewClient.tsx
// populates it from the photo's own naturalWidth/naturalHeight, captured
// before the quad step is ever reachable), so treating it as optional here
// would just be a bypass for a crafted request to skip this check entirely.
function validateSignSpecQuadRatio(spec: SignSpec): string | null {
  const hasQuad = Array.isArray(spec.selection_quad) && (spec.selection_quad.length === 4 || spec.selection_quad.length === 6)
  if (!hasQuad) return null
  if (spec.image_aspect_ratio == null || !(spec.image_aspect_ratio > 0)) {
    return "Missing photo proportions needed to validate the sign area. Please go back and re-confirm your photo."
  }
  const ok = validateQuadMatchesRatio(
    spec.selection_quad,
    spec.image_aspect_ratio,
    spec.width_inches,
    spec.height_inches,
    !!spec.is_corner,
    spec.front_width_inches,
    spec.side_width_inches
  )
  return ok ? null : "The marked sign area doesn't match your sign's proportions. Please go back and adjust the box on your photo."
}

export async function createOrder(params: {
  photoDataUrl: string
  previewDataUrl: string | null
  logoDataUrl?: string | null
  signSpec: SignSpec
}): Promise<{ error: string } | { orderId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/order/new")

  // Validate data URLs before processing
  const photoErr = validateDataUrl(params.photoDataUrl, "Photo")
  if (photoErr) return { error: photoErr }

  const dimensionErr = validateSignSpecDimensions(params.signSpec)
  if (dimensionErr) return { error: dimensionErr }

  const ratioErr = validateSignSpecQuadRatio(params.signSpec)
  if (ratioErr) return { error: ratioErr }

  if (params.logoDataUrl) {
    const logoErr = validateDataUrl(params.logoDataUrl, "Logo")
    if (logoErr) return { error: logoErr }
  }

  // Validate previewDataUrl — accept only an https URL on the Supabase storage
  // domain, a relative path, or a data URL (legacy sync path). Reject any other
  // external https URL to prevent storing arbitrary third-party URLs.
  if (params.previewDataUrl) {
    const preview = params.previewDataUrl
    if (preview.startsWith("http")) {
      const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
      let previewHost: string
      try {
        previewHost = new URL(preview).hostname
      } catch {
        return { error: "Preview URL is not a valid URL." }
      }
      if (!preview.startsWith("https://") || previewHost !== supabaseHost) {
        return { error: "Preview URL must be hosted on the Supabase storage domain." }
      }
    } else if (!preview.startsWith("/") && !preview.startsWith("data:")) {
      return { error: "Preview URL is not a valid path or data URL." }
    } else if (preview.startsWith("data:")) {
      const previewErr = validateDataUrl(preview, "Preview")
      if (previewErr) return { error: previewErr }
    }
  }

  // Upload storefront photo to Supabase Storage
  const photoBase64 = params.photoDataUrl.split(",")[1]
  const photoBuffer = Buffer.from(photoBase64, "base64")
  const photoPath = `storefronts/${user.id}/${Date.now()}.jpg`

  const { error: photoUploadErr } = await supabase.storage
    .from("public-assets")
    .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: false })

  if (photoUploadErr) {
    console.error("[createOrder] storefront photo upload failed", photoUploadErr)
    return { error: "Could not upload your storefront photo. Please try again." }
  }

  const { data: { publicUrl: storefrontUrl } } = supabase.storage
    .from("public-assets")
    .getPublicUrl(photoPath)

  // Upload logo if present
  let logoUrl: string | null = null
  if (params.logoDataUrl) {
    const logoBase64 = params.logoDataUrl.split(",")[1]
    const logoBuffer = Buffer.from(logoBase64, "base64")
    const ext = params.logoDataUrl.includes("image/png") ? "png" : "jpg"
    const logoPath = `logos/${user.id}/${Date.now()}.${ext}`
    const { error: logoErr } = await supabase.storage
      .from("public-assets")
      .upload(logoPath, logoBuffer, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: false })
    if (!logoErr) {
      logoUrl = supabase.storage.from("public-assets").getPublicUrl(logoPath).data.publicUrl
    } else {
      console.error("[createOrder] logo upload failed — order will proceed without a logo", logoErr)
    }
  }

  // Capture the AI preview if present. The async job flow already uploaded the
  // preview to Storage and hands us a hosted URL — use it as-is. A data URL
  // (legacy synchronous path) is uploaded here.
  let previewUrl: string | null = null
  if (params.previewDataUrl && params.previewDataUrl.startsWith("http")) {
    previewUrl = params.previewDataUrl
  } else if (params.previewDataUrl) {
    const previewBase64 = params.previewDataUrl.split(",")[1]
    const previewBuffer = Buffer.from(previewBase64, "base64")
    const previewPath = `previews/${user.id}/${Date.now()}.jpg`

    const { error: previewErr } = await supabase.storage
      .from("public-assets")
      .upload(previewPath, previewBuffer, { contentType: "image/jpeg", upsert: false })

    if (!previewErr) {
      previewUrl = supabase.storage.from("public-assets").getPublicUrl(previewPath).data.publicUrl
    } else {
      console.error("[createOrder] preview upload failed — order will proceed without a preview", previewErr)
    }
  }

  // Create the order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      client_id: user.id,
      status: "submitted",
      sign_spec: { ...params.signSpec, logo_url: logoUrl },
      storefront_photo_url: storefrontUrl,
      ai_preview_url: previewUrl,
      bid_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr window
    })
    .select("id")
    .single()

  if (orderErr) {
    console.error("[createOrder] failed to insert order", orderErr)
    return { error: "Something went wrong submitting your order. Please try again." }
  }

  return { orderId: order.id }
}
