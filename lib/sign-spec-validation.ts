// Pure SignSpec/data-URL validators used by app/actions/order.ts.
//
// Not colocated in order.ts because that file is a "use server" module —
// every export from a "use server" file is treated as a React Server
// Function, and Server Functions must be async (they're callable from the
// client over a network request). These are synchronous pure functions, so
// they live here and get imported into order.ts instead of exported from it.

import type { SignSpec } from "@/types"
import { isPlausibleDimension, validateQuadMatchesRatio, MAX_REFERENCE_INCHES } from "@/lib/sign-geometry"

// Corner signs store width_inches as the sum of front + side — tolerance for
// float rounding in the client's own addition, not a real proportion check
// (that's validateSignSpecQuadRatio's job).
const CORNER_WIDTH_SUM_TOLERANCE_INCHES = 0.5

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB decoded
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

export function validateDataUrl(dataUrl: string, label: string): string | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/)
  if (!match) return `${label}: invalid data URL format.`
  const mimeType = match[1].toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return `${label}: unsupported image type "${mimeType}". Only JPEG, PNG, and WebP are allowed.`
  const base64 = dataUrl.split(",")[1]
  const decodedSize = Math.floor((base64.length * 3) / 4)
  if (decodedSize > MAX_IMAGE_BYTES) return `${label}: image exceeds the 10 MB limit.`
  return null
}

// First-ever server-side check on sign_spec's numeric fields — the client
// already enforces this, but nothing stopped a crafted request from bypassing
// it and storing a bogus size that quoting/fabrication would then run with.
export function validateSignSpecDimensions(spec: SignSpec): string | null {
  if (!isPlausibleDimension(spec.width_inches)) return "Sign width is missing or out of range."
  if (!isPlausibleDimension(spec.height_inches)) return "Sign height is missing or out of range."
  // reference_inches never reaches the AI pipeline or pricing directly (it's
  // only used client-side to derive width/height, which are checked above),
  // but it's stored verbatim in sign_spec — validate it too so nothing
  // unbounded lands in the database.
  if (spec.reference_inches != null && !isPlausibleDimension(spec.reference_inches, MAX_REFERENCE_INCHES)) {
    return "Reference length is missing or out of range."
  }
  if (spec.is_corner) {
    if (spec.front_width_inches == null || !isPlausibleDimension(spec.front_width_inches)) return "Front width is missing or out of range."
    if (spec.side_width_inches == null || !isPlausibleDimension(spec.side_width_inches)) return "Side width is missing or out of range."
    const sum = spec.front_width_inches + spec.side_width_inches
    if (Math.abs(sum - spec.width_inches) > CORNER_WIDTH_SUM_TOLERANCE_INCHES) {
      return "Sign width doesn't match the front and side widths combined."
    }
  }
  return null
}

// Ties the numeric width/height (used for quoting) to the drawn quad (the
// only thing the AI preview pipeline actually renders into) so a client
// can't submit a quad that's been stretched or skewed away from the sign's
// real proportions. image_aspect_ratio is required whenever a quad is
// present — the legitimate client flow always sets it (OrderNewClient.tsx
// populates it from the photo's own naturalWidth/naturalHeight, captured
// before the quad step is ever reachable), so treating it as optional here
// would just be a bypass for a crafted request to skip this check entirely.
export function validateSignSpecQuadRatio(spec: SignSpec): string | null {
  const hasQuad = Array.isArray(spec.selection_quad) && (spec.selection_quad.length === 4 || spec.selection_quad.length === 6)
  if (!hasQuad) return null
  if (spec.image_aspect_ratio == null || !(spec.image_aspect_ratio > 0)) {
    return "Missing photo proportions needed to validate the sign area. Please go back and re-confirm your photo."
  }
  const ok = validateQuadMatchesRatio(
    spec.selection_quad,
    spec.image_aspect_ratio,
    spec.width_inches,
    spec.height_inches,
    !!spec.is_corner,
    spec.front_width_inches,
    spec.side_width_inches
  )
  return ok ? null : "The marked sign area doesn't match your sign's proportions. Please go back and adjust the box on your photo."
}
