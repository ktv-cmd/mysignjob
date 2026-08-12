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
  // `createRequire(...)("@napi-rs/canvas")`. That literal reference is dead
  // weight in the server bundle — it's never reached at runtime — so it's
  // excluded on general principle, though it wasn't the actual cause of the
  // Netlify function-size failure (see below).
  //
  // The real cause: lib/ai/preview.ts reads style-reference photos at
  // request time via `fs.readFile(path.join(process.cwd(), "public", relPath))`
  // with a *computed* relPath. Next's output-file tracer can't statically
  // resolve which file that is, so — conservatively — it swept the ENTIRE
  // public/ directory (~150MB of order-form example photos and the hero
  // video) into the server function trace, blowing well past Netlify's
  // 250MB Lambda limit. Only two subfolders are actually read at runtime
  // (see LIGHTING_REFERENCE_DIR / AWNING_FRAME_REFERENCE_DIR in
  // lib/ai/preview.ts); everything else under public/ is served as static
  // assets and never touched by server code, so exclude the whole
  // directory from the trace and include back only what's really needed.
  outputFileTracingExcludes: {
    "/order/new": ["./node_modules/@napi-rs/**/*"],
    "/**": ["./public/**/*"],
  },
  outputFileTracingIncludes: {
    "/**": [
      "./public/examples/letters-lighting-bg/**/*",
      "./public/examples/awning-frames/**/*",
    ],
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
