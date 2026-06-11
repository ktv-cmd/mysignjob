"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { SignSpec } from "@/types"

export async function createOrder(params: {
  photoDataUrl: string
  previewDataUrl: string | null
  signSpec: SignSpec
}): Promise<{ error: string } | { orderId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Upload storefront photo to Supabase Storage
  const photoBase64 = params.photoDataUrl.split(",")[1]
  const photoBuffer = Buffer.from(photoBase64, "base64")
  const photoPath = `storefronts/${user.id}/${Date.now()}.jpg`

  const { error: photoUploadErr } = await supabase.storage
    .from("documents")
    .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: false })

  if (photoUploadErr) return { error: photoUploadErr.message }

  const { data: { publicUrl: storefrontUrl } } = supabase.storage
    .from("documents")
    .getPublicUrl(photoPath)

  // Upload AI preview if present
  let previewUrl: string | null = null
  if (params.previewDataUrl) {
    const previewBase64 = params.previewDataUrl.split(",")[1]
    const previewBuffer = Buffer.from(previewBase64, "base64")
    const previewPath = `previews/${user.id}/${Date.now()}.jpg`

    const { error: previewErr } = await supabase.storage
      .from("documents")
      .upload(previewPath, previewBuffer, { contentType: "image/jpeg", upsert: false })

    if (!previewErr) {
      previewUrl = supabase.storage.from("documents").getPublicUrl(previewPath).data.publicUrl
    }
  }

  // Create the order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      client_id: user.id,
      status: "submitted",
      sign_spec: params.signSpec,
      storefront_photo_url: storefrontUrl,
      ai_preview_url: previewUrl,
      bid_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr window
    })
    .select("id")
    .single()

  if (orderErr) return { error: orderErr.message }

  return { orderId: order.id }
}
