import type { NextConfig } from "next"

// Content-Security-Policy is set in proxy.ts, not here — it needs a fresh
// per-request nonce so Next.js can nonce its inline hydration scripts. A
// static CSP here (without a nonce) blocks those scripts and leaves the
// entire app non-interactive with no console errors visible to users.
const nextConfig: NextConfig = {
  // TODO (tech debt): ignoreBuildErrors suppresses TypeScript errors at build time.
  // This should be removed once all type errors are resolved.
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // camera=(self) allows the guided live-camera "video ruler"
            // capture (components/order/VideoRulerCapture.tsx) to call
            // getUserMedia — camera=() blocks it at the browser level
            // regardless of what the user grants in the permission prompt.
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // pdfjs-dist (browser-only, dynamically imported from OrderNewClient for
  // PDF-logo extraction) still contains a Node.js canvas fallback that does
  // `createRequire(...)("@napi-rs/canvas")`. That literal reference gets
  // swept into the /order/new server function's file trace even though it's
  // never reached at runtime, dragging in ~20MB+ of native canvas binaries
  // and pushing the Netlify function past its 250MB limit. It's dead weight
  // here — exclude it.
  outputFileTracingExcludes: {
    "/order/new": ["./node_modules/@napi-rs/**/*"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.fal.run" },
      { protocol: "https", hostname: "replicate.delivery" },
    ],
  },
}

export default nextConfig
