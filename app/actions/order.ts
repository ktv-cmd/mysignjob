"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { SignSpec } from "@/types"
// Pure validators live outside this file because every export from a
// "use server" module is treated as a React Server Function, which must be
// async — these are sync. See lib/sign-spec-validation.ts.
import { validateDataUrl, validateSignSpecDimensions, validateSignSpecQuadRatio } from "@/lib/sign-spec-validation"

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
