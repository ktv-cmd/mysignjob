import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/server"
import { createServiceRoleClient } from "@/lib/supabase/service"
import type Stripe from "stripe"

// Server-verified source of truth for Stripe state changes. Until now the app
// only trusted client-triggered polls (confirmPaymentMethod, checkAndActivateSC)
// re-querying Stripe directly — those still work, but a webhook means state
// updates even if the user closes the tab mid-flow, and isn't spoofable by a
// forged client call the way an unverified "just tell us it succeeded" endpoint
// would be. Signature verification is what makes this trustworthy: never trust
// event bodies from this endpoint without it.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set — rejecting")
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 })
  }
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed", err)
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  switch (event.type) {
    case "setup_intent.succeeded": {
      const setupIntent = event.data.object as Stripe.SetupIntent
      const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id
      if (customerId) {
        await supabase.from("users").update({ payment_method_added: true }).eq("stripe_customer_id", customerId)
      }
      break
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account
      await supabase
        .from("sc_companies")
        .update({ stripe_onboarding_complete: account.payouts_enabled ?? false })
        .eq("stripe_account_id", account.id)
      break
    }

    default:
      // Unhandled event types are expected — Stripe sends far more than we act on.
      break
  }

  return NextResponse.json({ received: true })
}
