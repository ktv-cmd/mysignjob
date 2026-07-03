"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { SignSpec } from "@/types"

export async function createOrder(params: {
  photoDataUrl: string
  previewDataUrl: string | null
  logoDataUrl?: string | null
  signSpec: SignSpec
}): Promise<{ error: string } | { orderId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/order/new")

  // Upload storefront photo to Supabase Storage
  const photoBase64 = params.photoDataUrl.split(",")[1]
  const photoBuffer = Buffer.from(photoBase64, "base64")
  const photoPath = `storefronts/${user.id}/${Date.now()}.jpg`

  const { error: photoUploadErr } = await supabase.storage
    .from("public-assets")
    .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: false })

  if (photoUploadErr) return { error: photoUploadErr.message }

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

  if (orderErr) return { error: orderErr.message }

  return { orderId: order.id }
}
