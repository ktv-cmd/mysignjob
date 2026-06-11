"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function submitBid(_prev: { error?: string } | null, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, status")
    .eq("user_id", user.id)
    .single()

  if (!sc || sc.status !== "active") return { error: "Your account is not active." }

  const orderId = formData.get("order_id") as string
  const priceDollars = parseFloat(formData.get("price_dollars") as string)
  const timelineDays = parseInt(formData.get("timeline_days") as string)
  const notes = (formData.get("notes") as string).trim()

  if (!orderId || isNaN(priceDollars) || priceDollars <= 0)
    return { error: "Please enter a valid price." }
  if (isNaN(timelineDays) || timelineDays < 1)
    return { error: "Please enter a valid timeline." }

  const priceCents = Math.round(priceDollars * 100)

  // Verify order is still open for bidding
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, bid_deadline_at")
    .eq("id", orderId)
    .single()

  if (!order) return { error: "Order not found." }
  if (order.status !== "bidding" && order.status !== "submitted")
    return { error: "This order is no longer accepting bids." }
  if (order.bid_deadline_at && new Date(order.bid_deadline_at) < new Date())
    return { error: "The bidding window for this order has closed." }

  const { error } = await supabase.from("bids").upsert(
    {
      order_id: orderId,
      sc_id: sc.id,
      price_cents: priceCents,
      timeline_days: timelineDays,
      notes: notes || null,
      status: "pending",
    },
    { onConflict: "order_id,sc_id" }
  )

  if (error) return { error: error.message }

  // Flip order to 'bidding' if still 'submitted'
  await supabase
    .from("orders")
    .update({ status: "bidding" })
    .eq("id", orderId)
    .eq("status", "submitted")

  redirect("/sc/dashboard?bid=submitted")
}
