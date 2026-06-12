import Stripe from "stripe"

// Lazily instantiate so the SDK is never constructed at module-eval / build time
// (Netlify's "Collecting page data" stage runs without STRIPE_SECRET_KEY and
// would otherwise throw "Neither apiKey nor config.authenticator provided").
let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  _stripe = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
  })
  return _stripe
}

// Proxy preserves the `stripe.customers.create(...)` call-site ergonomics
// while deferring construction until the first property access at runtime.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe()
    const value = client[prop as keyof Stripe]
    return typeof value === "function" ? value.bind(client) : value
  },
})
