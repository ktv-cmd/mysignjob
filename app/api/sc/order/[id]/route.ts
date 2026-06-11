import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify caller is an active SC
  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, status")
    .eq("user_id", user.id)
    .single()

  if (!sc || sc.status !== "active")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, sign_spec, storefront_photo_url, ai_preview_url, bid_deadline_at, created_at")
    .eq("id", id)
    .in("status", ["submitted", "bidding"])
    .single()

  if (error || !order)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(order)
}
