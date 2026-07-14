import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Next.js 16 renamed `middleware` to `proxy`. Refreshes the Supabase session
// cookie on every request so Server Components always see a valid auth state,
// and issues a per-request CSP nonce so Next.js can nonce its inline hydration
// scripts. Nonce-based CSP requires setting the header here (not in
// next.config.ts) — see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
// script-src has no 'unsafe-inline': without a nonce, browsers block Next's
// inline hydration scripts and the app becomes fully non-interactive (dead
// buttons, forms, uploads — nothing throws, it just silently doesn't work).
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDev = process.env.NODE_ENV === "development"

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${isDev ? " 'unsafe-eval'" : ""}`,
    // Radix UI and Stripe inject inline styles for positioning — nonce'd
    // style-src would break them, so this stays 'unsafe-inline' deliberately.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.fal.run https://replicate.delivery",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.fal.run https://replicate.delivery",
    "frame-src https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          response.headers.set("Content-Security-Policy", csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the session so the SSR cookie is rotated when needed.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
