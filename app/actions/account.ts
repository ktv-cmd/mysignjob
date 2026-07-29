"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const MAX_NAME_LENGTH = 120
// Loose on purpose — accepts digits, spaces, parens, dashes, dots, and a
// leading "+" for international numbers, without pinning to one country's
// format. Real validation (deliverability) happens when it's actually used.
const PHONE_REGEX = /^[0-9()+\-.\s]{7,20}$/

export type UpdateProfileState = { error: string; success?: false } | { success: true; error?: undefined } | null

export async function updateProfile(_prev: UpdateProfileState, formData: FormData): Promise<UpdateProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()

  if (!fullName) return { error: "Name is required." }
  if (fullName.length > MAX_NAME_LENGTH) return { error: "Name is too long." }
  if (phone && !PHONE_REGEX.test(phone)) return { error: "Enter a valid phone number." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const { error } = await supabase
    .from("users")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id)

  if (error) {
    console.error("[updateProfile] failed to update users row", error)
    return { error: "Something went wrong saving your details. Please try again." }
  }

  revalidatePath("/account")
  return { success: true }
}
