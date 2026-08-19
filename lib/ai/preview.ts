// Shared AI sign-preview generation. Used by:
//  - the synchronous /api/order/generate-preview route (legacy / local fast path)
//  - the background job worker runPreviewJob() (Netlify background function + local /run)
//
// Heavy work (Gemini image generation, sharp masking/compositing) lives here so the
// HTTP layer stays thin and the same code runs in every environment.

import { buildSignPrompt, type PromptColor, type BrandMode } from "@/lib/sign-prompt"
import { createServiceRoleClient } from "@/lib/supabase/service"

export const SIGN_SYSTEM_INSTRUCTION = `
# ROLE
You are a Senior Architectural Signage Visualization Architect. You manage two layers of logic:
1. STRUCTURAL LAYER (The 'What'): Defines the Signage Case.
2. PHYSICS LAYER (The 'How'): Defines the geometric construction and material properties.

This is VOLUMETRIC SCENE RECONSTRUCTION (Blender/3ds Max logic), not texture inpainting (Photoshop logic).

IMPORTANT: Create ORIGINAL custom fabrication designs. Do not replicate existing branded signage.

═══════════════════════════════════════════════════════════════════════════
LAYER 2: PHYSICS & CONSTRUCTION RULES (THE 'HOW')
═══════════════════════════════════════════════════════════════════════════

## MASK ERASURE PROTOCOL (Critical):
The golden zone (#FFD740) is a VOLUMETRIC VOID marking construction coordinates. It is TEMPORARY and must be 100% erased.

EXECUTION SEQUENCE:
1. IDENTIFY MASK: Locate all gold/yellow pixels (#FFD740 ±10% tolerance) in Image 1.
2. SURFACE RESTORATION: FIRST completely erase the golden mask and RECONSTRUCT the underlying building surface texture (brick pattern, mortar lines, wood grain, stucco relief, paint color). INPAINT/RESTORE across the entire golden zone as if the mask never existed.
3. GEOMETRIC INSERTION: NOW insert the extruded 3D sign mesh onto the restored surface as a physical structure bolted to the wall.
4. COVERAGE: SIGN DIMENSIONS = ZONE DIMENSIONS (non-negotiable). The sign's width/height must exactly match the golden zone's bounding box; scale up if needed so coverage is 100%.
5. ZERO GOLD POLICY: Final output = 0% gold/yellow pixels — either covered by the sign OR restored to facade texture.
6. CORNER GEOMETRY (non-negotiable): The selection brush may have rounded/soft edges — a painting artifact only. The sign's corners and edges are ALWAYS hard 90-degree right angles. Never round sign geometry.

## PRE-INSTALLED PANEL OVERRIDE (supersedes the sequence above):
If the user prompt states the backer panel is ALREADY PAINTED into Image 1 (a solid-color rectangle): do NOT erase, shrink, rebuild, or resize that rectangle. It IS the sign's backer panel at its final, exact boundaries. Keep the panel's fill color and add realistic material, lighting, visible edge thickness, and contact shadows, then mount the letters on its face. Never draw any gold/yellow outline, border, or frame around the panel — its edges are clean panel edges against the wall. SURFACE RESTORATION applies only OUTSIDE the panel.

## GEOMETRY ENFORCEMENT (Forces 3D Depth):
- Use terms: "Extruded," "Volumetric Mesh," "Z-axis protrusion".
- Exact depth: 3.5 inches (89mm) perpendicular to the wall's surface normal.
- Return planes (sides) must be visible to prove 3D depth. Each element has measurable thickness — NOT flat textures.

## MATERIAL SHADERS (PBR):
- Brushed Aluminum returns: Metallic 0.95, Roughness 0.35, Anisotropy 0.6 (directional grain).
- Acrylic faces (illuminated): IOR 1.49, transmission for light passage, subsurface scattering (2mm) for internal glow.
- Painted metal: client HEX, Metallic 0.0, Roughness 0.4–0.6.

## LIGHTING & EMISSION:
IF 'NO LIGHT': PROHIBITED — glow, bloom, halo, neon, luminescence, LED, backlight. REQUIRED — matte surfaces, hard contact shadows (Ambient Occlusion), sun-lit/daylight only, opaque solid materials, zero emission, external environmental lighting only.
IF ILLUMINATED: the per-request description below names one or more lighting techniques — treat that combination as the complete and exact emission spec for this render, nothing more and nothing less. Render illumination the way a camera actually captures a lit sign at night: bright emissive surfaces with visible soft bloom/halation at their edges, strong contrast against whatever stays dark. Front-lit: subsurface scattering through the acrylic faces makes them glow brightly with visible bloom; the wall directly behind the sign stays completely dark — zero glow, zero wash. Back-lit: a soft halo of light washes onto the wall BEHIND the sign with visible inverse-square falloff (brightest near the sign, fading outward); the letter faces themselves stay fully opaque, matte, and dark — no light escapes the front. Side-mounted accent: a thin, crisp, bright LED rim-light traced along each letter's side return-plane edges only — it never by itself adds front-face glow or a wall wash; combine it with front-lit and/or back-lit glow only when the per-request description names both together. Full/complete surround: front-lit face glow + back-lit wall wash + side-mounted edge accents, ALL THREE rendered at full brightness simultaneously — do not dim any one technique to accommodate the others.

TIME OF DAY: by default, match Image 1's existing ambient lighting exactly (do not add glow effects a daytime photo wouldn't show). ONLY if the per-request instructions include a "TIME OF DAY" line requesting a dusk/night scene, relight the entire environment accordingly — darker sky, dimmer ambient/surrounding light — while keeping the new sign's illumination as the dominant, clearly visible light source.

## COLOR INTEGRITY:
- LOGO PROVIDED (Image 2): use exact HEX/Pantone from the logo — non-negotiable brand identity.
- LOGO + NAME: sample the dominant HEX from the logo and apply it EXACTLY to the name letterforms (direct HEX transfer, no adjustment).
- TEXT WITH CLIENT COLOR: if a hex is specified, use it EXACTLY on faces and returns.
- TEXT WITHOUT COLOR: analyze the facade and pick complementary finishes (brushed aluminum #A9A9A9, stainless #C0C0C0, matte black #1C1C1C, bronze #CD7F32).
- NEVER use the golden guide color (#FFD740) as a sign color.

═══════════════════════════════════════════════════════════════════════════
LAYER 1: STRUCTURAL RULES (THE CASES)
═══════════════════════════════════════════════════════════════════════════

CASE A1 (LOGO ONLY, WITH BACKER PANEL): Construct as a 3D CABINET LIGHTBOX MESH — translucent front face + 4 aluminum return walls + back mounting plate, 3.5" Z-extrusion. Extract EXACT colors from the logo. FULL-BLEED FACE: the logo's background color floods 100% of the face edge-to-edge — no raw white acrylic, no margins.

CASE A2 (LOGO ONLY, NO BACKER PANEL — user prompt says the wall stays visible): Construct as a FLAT-CUT DIMENSIONAL LOGO. Treat the Image 2 artwork as a fixed 2D stencil/die-cut: extrude that EXACT silhouette perpendicular to the wall (1–2" depth). Do NOT re-layout, re-sculpt, re-letter, or redesign the artwork — only add depth. Every shape, curve, and letterform matches Image 2 precisely, as if the artwork were CNC-cut from a sheet. If the user prompt specifies a sign color, apply that color to the cut faces and returns; otherwise keep the logo's original colors. Mount the pieces directly on the wall — the wall surface remains visible between and around them.

CASE B (NAME ONLY): Construct as EXTRUDED 3D CHANNEL LETTERFORMS — each letter a 6-faced primitive (front face + 4 returns + back), 3.5" depth. If a font style is specified, follow that exact typographic direction. If a HEX is specified, use it exactly.

CASE C (LOGO + NAME): UNIFIED BRANDING — logo as Case A cabinet, name as Case B channel letters, both at the same 3.5" Z-depth. Sample dominant HEX from the logo and apply to the name for unified identity. Layout horizontal or vertical based on the golden zone's aspect ratio.

AWNING OVERRIDE (when an awning is requested): render a curved FABRIC awning — NO 3D boxes, NO metal returns. Single soft curved fabric mesh on a powder-coated aluminum frame with wall brackets. Apply logo/text as flat 2D ink print warping with the fabric's curves (no 3D lettering thickness). Natural daylight unless internal backlighting is specified.

## VALIDATION CHECKLIST:
1. SIDE-WALL TEST: at least one letter's return plane visible (proves 3D extrusion).
2. ZERO GOLD: no gold pixels remain.
3. SURFACE CONTINUITY: exposed wall areas show seamless texture restoration.
4. SHADOW AUTHENTICITY: multi-plane contact shadows prove geometric depth.

## OUTPUT
One ray-traced PBR render (16:9) with the sign physically integrated into the building facade.
`.trim()

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

// ─── Input sanitization helpers ───────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

/**
 * Validate a color value before injecting it into SVG markup.
 * Accepts 3-, 4-, 6-, or 8-digit hex codes only (no named colors, no rgb(...),
 * no arbitrary strings).  Falls back to `fallback` when invalid so Sharp/librsvg
 * never receives unsanitized user input.
 */
function sanitizeHexColor(value: string | undefined | null, fallback: string): string {
  if (value && HEX_COLOR_RE.test(value)) return value
  return fallback
}

/** Allowlist of MIME types accepted from caller-supplied logo data URLs. */
const ALLOWED_LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/webp"])

/**
 * Validate a logo MIME type against the allowlist before passing it to the
 * Gemini API.  Falls back to "image/png" for anything unrecognised.
 */
function sanitizeLogoMime(value: string | undefined | null): string {
  if (value && ALLOWED_LOGO_MIMES.has(value)) return value
  return "image/png"
}

// The full set of generation inputs — stored in a preview_jobs row's `params`.
export interface PreviewJobParams {
  quad: { x: number; y: number }[]
  referenceId: string
  lightingType?: "front" | "back" | "both" | "front_back" | "front_side" | "back_side" | "full"
  illuminated?: boolean
  seeThroughLetters?: boolean           // light-box variant: halo-lit letters cut from an opaque panel
  businessName: string
  brandMode: BrandMode
  fontStyle?: "modern-sans" | "classic-serif" | "bold-condensed"
  letterColor?: string
  awningFrame?: string
  fabricName?: string
  awningIllumination?: string
  panelFace?: PromptColor | null
  panelBg?: PromptColor | null
  hasBackground?: boolean
  bgMaterial?: "aluminum" | "acrylic"
  acrylic?: PromptColor | null
  // See SignPromptParams.logoColorMatch — when true, panelFace/panelBg/acrylic
  // above are deliberately null; the fabricator matches the logo directly.
  logoColorMatch?: boolean
  count?: number
  // Free-form client instructions appended to the generated prompt.
  customPrompt?: string
  // Storage paths (background path) — input image + optional logo live in the bucket.
  photoPath?: string
  logoPath?: string
  // Inline data (synchronous path) — original image + optional logo as data URLs.
  imageDataUrl?: string
  logoDataUrl?: string
}

// Dev-only diagnostics: dump pipeline images (annotated input, raw model output,
// final composite) so misalignment/shrink problems can be inspected directly.
// Disabled in production; writes to PREVIEW_DEBUG_DIR or /tmp.
async function debugDump(tag: string, buf: Buffer): Promise<void> {
  const dir = process.env.PREVIEW_DEBUG_DIR
    ?? (process.env.NODE_ENV !== "production" ? "/tmp/my-sign-job-preview-debug" : null)
  if (!dir) return
  try {
    const fs = await import("fs/promises")
    await fs.mkdir(dir, { recursive: true })
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${tag}-${Math.random().toString(36).slice(2, 6)}.jpg`
    await fs.writeFile(`${dir}/${name}`, buf)
  } catch {
    // diagnostics only — never fail a generation over this
  }
}

// Gemini image generation only supports these fixed aspect-ratio buckets — it
// does NOT match the input image's actual ratio. Left unset, it silently picks
// a default (observed ~2.09:1) that differs from typical storefront photos, and
// naively stretching the mismatch back to W×H non-uniformly distorts everything
// (letters bleeding past panel edges, panels not reaching the zone's true edge).
// Request whichever bucket is closest to the real photo so the gap is minimal.
const SUPPORTED_ASPECT_RATIOS: [string, number][] = [
  ["21:9", 21 / 9], ["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3],
  ["1:1", 1], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16],
]
function nearestAspectRatio(w: number, h: number): string {
  const target = w / h
  return SUPPORTED_ASPECT_RATIOS.reduce((best, cur) =>
    Math.abs(cur[1] - target) < Math.abs(best[1] - target) ? cur : best
  )[0]
}

// ─── Style reference images ────────────────────────────────────────────────────
// Real example photos (already in the repo for the order form's picker
// thumbnails) attached as an extra input image alongside the storefront + logo,
// so the model has a visual anchor for "front-lit" vs "back-lit" vs a specific
// awning frame silhouette — text descriptions alone are much fuzzier than a
// real photo. Best-effort: a missing/unreadable file just means no reference
// gets attached (buildSignPrompt only describes a reference image slot when one
// was actually loaded, via styleReferenceKind).
async function loadPublicImage(relPath: string): Promise<{ mime: string; base64: string } | null> {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const ext = relPath.split(".").pop()?.toLowerCase()
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
    const buf = await fs.readFile(path.join(process.cwd(), "public", relPath))
    return { mime, base64: buf.toString("base64") }
  } catch {
    return null
  }
}

const LIGHTING_REFERENCE_DIR = "/examples/letters-lighting-bg"
// Day/night filenames as already used for the lightingStyle picker thumbnails
// in OrderNewClient.tsx — reused here instead of duplicating a fresh asset set.
const LIGHTING_REFERENCE_FILES: Record<string, { day: string; night: string }> = {
  front: { day: "Front_Light_day.jpg", night: "front_light_night.jpg" },
  back: { day: "Back_Light_day.jpg", night: "back_light_night.jpg" },
  both: { day: "Back_Front_Light_day.jpg", night: "front_back_night.jpg" },
  front_back: { day: "Back_Front_Light_day.jpg", night: "front_back_night.jpg" },
  front_side: { day: "Front_Side_ligth_day.jpg", night: "front_side_night.jpg" },
  back_side: { day: "Side_Light_day.jpg", night: "Side_light_night.jpg" },
  full: { day: "Full_light_day.jpg", night: "Full_light_night.jpg" },
}
const AWNING_FRAME_REFERENCE_DIR = "/examples/awning-frames"

// Mirrors the branching in buildBasePrompt's final "channel letters" case — the
// only branch that actually reads lightingType/lightingDescription(). Awning,
// light-box, no-light-outdoor, and logo-only-no-background all describe their
// lighting in fixed, non-technique-specific prose, so a lighting reference
// photo wouldn't correspond to anything the prompt is asking for.
function wantsLightingReference(params: PreviewJobParams): boolean {
  return params.referenceId !== "awning"
    && params.referenceId !== "light-box"
    && params.referenceId !== "no-light-outdoor"
    && !(params.brandMode === "logo-only" && params.hasBackground === false)
}

async function resolveStyleReference(
  params: PreviewJobParams,
  sceneTime: "day" | "night",
): Promise<{ kind: "lighting" | "awning-frame"; mime: string; base64: string } | null> {
  if (params.referenceId === "awning" && params.awningFrame) {
    const img = await loadPublicImage(`${AWNING_FRAME_REFERENCE_DIR}/${params.awningFrame}.jpg`)
    return img ? { kind: "awning-frame" as const, ...img } : null
  }
  if (wantsLightingReference(params) && params.lightingType) {
    const file = LIGHTING_REFERENCE_FILES[params.lightingType]?.[sceneTime]
    if (!file) return null
    const img = await loadPublicImage(`${LIGHTING_REFERENCE_DIR}/${file}`)
    return img ? { kind: "lighting" as const, ...img } : null
  }
  return null
}

// AI-estimated color(s) reported back when colorReportClause() asked for them
// (logoColorMatch cases only — no swatch was ever handed to the prompt, so
// this is the ONLY place the actual hex used ends up as data instead of just
// pixels in the image). Best-effort: read off a photo, not a real swatch
// lookup — callers should present it as needing verification before ordering
// material, not as an authoritative Pantone/hex spec.
export interface ColorReport {
  letters?: string
  panel?: string
}

// Parses the "COLOR_REPORT: LETTERS=#RRGGBB; PANEL=#RRGGBB" line requested by
// colorReportClause(). Tolerant of the model paraphrasing around it (searches
// the whole response text, not just the first line) but strict about the hex
// format itself — a malformed or missing report just yields undefined rather
// than a guessed value.
function parseColorReport(text: string): ColorReport | undefined {
  const match = text.match(/COLOR_REPORT:\s*([^\n]+)/i)
  if (!match) return undefined
  const report: ColorReport = {}
  for (const pair of match[1]!.split(";")) {
    const [key, value] = pair.split("=")
    const hex = value?.match(/#[0-9a-fA-F]{6}/)?.[0]
    if (!hex || !key) continue
    if (/letters?/i.test(key)) report.letters = hex
    else if (/panel/i.test(key)) report.panel = hex
  }
  return Object.keys(report).length > 0 ? report : undefined
}

async function generateOne(params: {
  annotatedBuffer: Buffer
  logoBase64: string | null
  logoMime: string
  prompt: string
  apiKey: string
  sharp: typeof import("sharp")
  originalBuffer: Buffer
  maskBuffer: Buffer
  W: number
  H: number
  // Style reference photo (lighting technique or awning frame shape), loaded
  // from public/examples — always the LAST image part, matching the image
  // number styleReferenceSlotDesc() names in the prompt text.
  styleRefBase64?: string | null
  styleRefMime?: string
  // "night" variants ask Gemini to relight the ENTIRE scene to blue hour
  // (blueHourSceneClause) — mask-blending back onto the original photo would
  // silently discard that relighting everywhere except inside the sign zone,
  // pasting the original daytime background back in. Only "day" variants use
  // the mask blend, to protect the rest of the storefront from AI drift.
  sceneTime: "day" | "night"
}): Promise<{ dataUrl: string; colorReport?: ColorReport }> {
  const { annotatedBuffer, logoBase64, logoMime, prompt, apiKey, sharp, originalBuffer, maskBuffer, W, H, styleRefBase64, styleRefMime, sceneTime } = params

  const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey })

  const parts: Part[] = [
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: annotatedBuffer.toString("base64") } },
  ]
  if (logoBase64) {
    parts.push({ inlineData: { mimeType: logoMime, data: logoBase64 } })
  }
  if (styleRefBase64) {
    parts.push({ inlineData: { mimeType: styleRefMime ?? "image/jpeg", data: styleRefBase64 } })
  }

  const maxRetries = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          systemInstruction: SIGN_SYSTEM_INSTRUCTION,
          imageConfig: { aspectRatio: nearestAspectRatio(W, H) },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ],
        },
      })

      let generatedBase64: string | null = null
      let responseText = ""
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        const p = part as { inlineData?: { data: string; mimeType: string }; text?: string }
        if (p.inlineData?.data && !generatedBase64) generatedBase64 = p.inlineData.data
        if (p.text) responseText += p.text
      }
      const colorReport = parseColorReport(responseText)

      if (!generatedBase64) {
        const reason = (response.candidates?.[0] as { finishReason?: string })?.finishReason
        throw new Error(`Gemini returned no image. Finish reason: ${reason ?? "unknown"}`)
      }

      // Composite generated region back over the original using the mask.
      const genBuffer = Buffer.from(generatedBase64, "base64")
      await debugDump("raw-gen", genBuffer)
      // "cover" (crop-to-fill, centered) instead of "fill" (non-uniform stretch).
      // Even the nearest supported aspect-ratio bucket rarely matches the photo
      // exactly, so a small centered crop is unavoidable — but a crop preserves
      // proportions, whereas a stretch warps every shape and misaligns edges.
      const genRgb = await sharp(genBuffer).resize(W, H, { fit: "cover", position: "centre" }).removeAlpha().raw().toBuffer()

      let out: Buffer
      if (sceneTime === "night") {
        // Blue-hour variants relight the WHOLE frame (blueHourSceneClause) —
        // masking back onto the original would paste the original daytime
        // background back everywhere outside the sign zone. Use the full
        // generated frame as-is.
        out = Buffer.from(genRgb)
      } else {
        const origRgb = await sharp(originalBuffer).resize(W, H).removeAlpha().raw().toBuffer()
        // Erode the zone edge a few px (blur + high threshold) so any leftover
        // gold guide outline the model kept at the mask boundary never survives
        // into the composite — the rim pixels come from the original photo. A
        // final 1px blur feathers the seam.
        const blendMask = await sharp(maskBuffer)
          .resize(W, H, { fit: "fill" })
          .greyscale()
          .blur(2)
          .threshold(250)
          .blur(1)
          .raw()
          .toBuffer()

        const n = W * H
        out = Buffer.alloc(n * 3)
        for (let i = 0; i < n; i++) {
          const m = (blendMask[i] ?? 0) / 255
          const o = i * 3
          out[o]     = Math.round((origRgb[o] ?? 0) * (1 - m) + (genRgb[o] ?? 0) * m)
          out[o + 1] = Math.round((origRgb[o + 1] ?? 0) * (1 - m) + (genRgb[o + 1] ?? 0) * m)
          out[o + 2] = Math.round((origRgb[o + 2] ?? 0) * (1 - m) + (genRgb[o + 2] ?? 0) * m)
        }
      }

      const compositedJpeg = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
        .jpeg({ quality: 92 })
        .toBuffer()
      await debugDump("composite", compositedJpeg)

      return { dataUrl: `data:image/jpeg;base64,${compositedJpeg.toString("base64")}`, colorReport }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const msg = lastError.message.toLowerCase()
      const retryable = msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("timeout")
      if (!retryable || attempt === maxRetries) break
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
    }
  }

  throw lastError ?? new Error("Preview generation failed.")
}

// Core: given the original image buffer + params, return N composited preview
// results (each with its data URL and, when logoColorMatch requested one, the
// AI-reported color it actually used).
export async function generatePreviewDataUrls(
  originalBuffer: Buffer,
  logoDataUrl: string | null | undefined,
  params: PreviewJobParams,
): Promise<{ dataUrl: string; colorReport?: ColorReport }[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  const { quad } = params
  if (!quad || (quad.length !== 4 && quad.length !== 6)) {
    throw new Error("4- or 6-point quad required")
  }

  // @ts-ignore — sharp's types resolve oddly under package.json exports
  const sharp = (await import("sharp")).default as typeof import("sharp")
  const { width: W = 1920, height: H = 1080 } = await sharp(originalBuffer).metadata()

  // Build quad mask
  const points = quad.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ")
  const svgMask = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="black"/>
    <polygon points="${points}" fill="white"/>
  </svg>`
  const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer()

  // Annotate the input image for the model.
  // WITH a backer panel: the model reliably keeps an EXISTING panel's boundaries
  // but shrinks one it has to invent (it sizes it to the logo artwork instead of
  // the zone) — so we paint the panel into the photo ourselves as a solid fill
  // in the panel color. NO gold outline: any gold we paint (or even mention)
  // tends to survive into the output as a yellow line.
  // WITHOUT a panel: classic semi-transparent gold zone marking.
  const isPanelPrepaint =
    params.hasBackground === true && !!params.panelBg?.hex &&
    params.referenceId !== "awning" && params.referenceId !== "light-box"

  let annotatedBuffer: Buffer
  if (isPanelPrepaint) {
    const safePanelColor = sanitizeHexColor(params.panelBg!.hex, "#808080")
    const svgPanel = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${points}" fill="${safePanelColor}"/>
    </svg>`
    annotatedBuffer = await sharp(originalBuffer)
      .composite([{ input: Buffer.from(svgPanel), blend: "over" }])
      .jpeg({ quality: 92 })
      .toBuffer()
    await debugDump("annotated-input", annotatedBuffer)
  } else {
    const maskGrey = await sharp(maskBuffer).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer()
    const overlay = Buffer.alloc(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      if ((maskGrey[i] ?? 0) > 40) {
        overlay[i * 4] = 255
        overlay[i * 4 + 1] = 215
        overlay[i * 4 + 2] = 64
        overlay[i * 4 + 3] = 140
      }
    }
    const overlayPng = await sharp(overlay, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
    annotatedBuffer = await sharp(originalBuffer)
      .composite([{ input: overlayPng, blend: "over" }])
      .jpeg({ quality: 92 })
      .toBuffer()
  }

  // Parse logo if present
  const isCorner = quad.length === 6
  const foldXPct = isCorner ? ((quad[1].x + quad[4].x) / 2) * 100 : undefined
  const hasLogo = !!logoDataUrl
  let logoBase64: string | null = null
  let logoMime = "image/png"
  if (logoDataUrl) {
    const [meta, data] = logoDataUrl.split(",")
    logoBase64 = data ?? null
    const mimeMatch = meta?.match(/data:([^;]+)/)
    logoMime = sanitizeLogoMime(mimeMatch?.[1])
  }

  // Logo color rule:
  //  • light box (cabinet) or LIT letters → the logo keeps its exact original colors.
  //  • NO-light letters or see-through letters → the logo takes the client-chosen
  //    color. We tint the logo file OURSELVES and send the finished artwork as
  //    Image 2, flattened onto a SOLID WHITE canvas (transparency confused the
  //    model into rendering no sign at all). The prompt then asks for exact
  //    reproduction — models copy far more faithfully than they recolor.
  const chosenHex = params.panelFace?.hex ?? params.acrylic?.hex ?? null
  const clientColorsLogo = params.referenceId === "no-light-outdoor" || params.seeThroughLetters === true
  let logoPreColored = false
  if (logoBase64 && chosenHex && clientColorsLogo) {
    try {
      const tinted = await recolorLogoOnWhite(Buffer.from(logoBase64, "base64"), chosenHex, sharp)
      logoBase64 = tinted.toString("base64")
      logoMime = "image/png"
      logoPreColored = true
    } catch (err) {
      console.warn("[preview] Logo recolor failed, sending original artwork:", err)
    }
  }

  const sharedPromptParams = {
    businessName: params.businessName,
    brandMode: params.brandMode,
    hasLogo,
    logoPreColored,
    referenceId: params.referenceId,
    lightingType: params.lightingType,
    illuminated: params.illuminated,
    fontStyle: params.fontStyle,
    letterColor: params.letterColor,
    panelFace: params.panelFace,
    panelBg: params.panelBg,
    hasBackground: params.hasBackground,
    bgMaterial: params.bgMaterial,
    acrylic: params.acrylic,
    logoColorMatch: params.logoColorMatch,
    awningFrame: params.awningFrame,
    fabricName: params.fabricName,
    awningIllumination: params.awningIllumination,
    isCorner,
    foldXPct,
    customPrompt: params.customPrompt,
  }

  const genCount = Math.min(Math.max(1, params.count ?? 3), 3)

  // A daytime input photo can't show whether LED illumination reads at all, so
  // when the sign is actually illuminated, split the variants across day and
  // dusk/night renders — the night ones are what makes the glow visible. Only
  // worth doing with room to spare a variant; a single-image request stays day
  // so it still matches the uploaded photo. buildSignPrompt no-ops the night
  // clause for non-illuminated cases (no-light-outdoor, non-lit awnings), so
  // nightCount naturally has no effect there even if we didn't gate it here.
  const isIlluminatedScene =
    params.referenceId === "awning" ? params.awningIllumination === "internal_led" :
    params.referenceId === "no-light-outdoor" ? false :
    true
  const nightCount = isIlluminatedScene && genCount > 1 ? Math.floor(genCount / 2) : 0
  const sceneTimes = Array.from({ length: genCount }, (_, i): "day" | "night" => i >= genCount - nightCount ? "night" : "day")

  // Resolve each variant's style reference photo BEFORE building its prompt —
  // the prompt only claims a reference image slot (styleReferenceKind) when a
  // matching file actually loaded, so client/server text always matches what
  // was really sent. Day and night variants of a lighting reference use
  // different photos (matching their own scene), so this has to happen per
  // variant, not once for the whole job.
  const variants = await Promise.all(sceneTimes.map(async (sceneTime) => {
    const styleRef = await resolveStyleReference(params, sceneTime)
    const prompt = buildSignPrompt({ ...sharedPromptParams, sceneTime, styleReferenceKind: styleRef?.kind })
    return { prompt, styleRefBase64: styleRef?.base64 ?? null, styleRefMime: styleRef?.mime, sceneTime }
  }))
  const shared = { annotatedBuffer, logoBase64, logoMime, apiKey, sharp, originalBuffer, maskBuffer, W, H }

  // Run all generations concurrently — cuts wall-clock time by ~3× vs sequential.
  // Each call independently retries on 503/timeout so one slow call doesn't block others.
  const settled = await Promise.allSettled(
    variants.map(v => generateOne({ ...shared, ...v })),
  )

  const results = settled.flatMap(r => r.status === "fulfilled" ? [r.value] : [])
  if (results.length === 0) {
    const firstErr = settled.find(r => r.status === "rejected") as PromiseRejectedResult | undefined
    throw firstErr?.reason instanceof Error ? firstErr.reason : new Error("All preview generations failed.")
  }
  return results
}

// Tint the logo artwork to the chosen sign color and flatten it onto a SOLID
// WHITE canvas (no alpha channel in the output — transparent PNGs made the
// model render no sign at all). Near-white pixels count as background and stay
// white; everything else becomes the chosen color, alpha-blended against white
// so anti-aliased edges stay smooth.
async function recolorLogoOnWhite(input: Buffer, hex: string, sharp: typeof import("sharp")): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const n = info.width * info.height
  const out = Buffer.alloc(n * 3)
  for (let i = 0; i < n; i++) {
    const s = i * 4
    const o = i * 3
    const a = (data[s + 3] ?? 0) / 255
    const isBg = a === 0 || ((data[s] ?? 0) > 240 && (data[s + 1] ?? 0) > 240 && (data[s + 2] ?? 0) > 240)
    if (isBg) {
      out[o] = 255; out[o + 1] = 255; out[o + 2] = 255
    } else {
      // Blend the tint against white by the source alpha so soft edges survive.
      out[o]     = Math.round(r * a + 255 * (1 - a))
      out[o + 1] = Math.round(g * a + 255 * (1 - a))
      out[o + 2] = Math.round(b * a + 255 * (1 - a))
    }
  }
  const flattened = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer()

  // Crop the white canvas tight to the artwork and re-add a small margin.
  // A large empty canvas gets rendered by the model as a physical white panel
  // behind the sign; with a tight crop there is barely any canvas to misread.
  try {
    const trimmed = await sharp(flattened).trim({ background: "#ffffff", threshold: 12 }).toBuffer()
    const meta = await sharp(trimmed).metadata()
    const margin = Math.max(8, Math.round(Math.max(meta.width ?? 0, meta.height ?? 0) * 0.04))
    return await sharp(trimmed)
      .extend({ top: margin, bottom: margin, left: margin, right: margin, background: "#ffffff" })
      .png()
      .toBuffer()
  } catch {
    return flattened
  }
}

// ─── Background job worker ────────────────────────────────────────────────────
// Loads a preview_jobs row, generates the previews, uploads them to Storage, and
// writes the result back. Safe to run in any long-lived context (Netlify
// background function or a local next-dev /run invocation).
export async function runPreviewJob(jobId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { data: job, error: loadErr } = await supabase
    .from("preview_jobs")
    .select("id, user_id, params, status")
    .eq("id", jobId)
    .single()

  if (loadErr || !job) {
    console.error("[runPreviewJob] job not found", jobId, loadErr?.message)
    return
  }

  await supabase.from("preview_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", jobId)

  try {
    const params = job.params as PreviewJobParams

    // Load the input image (from storage path, or inline data URL fallback).
    let originalBuffer: Buffer
    if (params.photoPath) {
      const { data, error } = await supabase.storage.from("documents").download(params.photoPath)
      if (error || !data) throw new Error(`Failed to download input photo: ${error?.message ?? "missing"}`)
      originalBuffer = Buffer.from(await data.arrayBuffer())
    } else if (params.imageDataUrl) {
      originalBuffer = Buffer.from(params.imageDataUrl.split(",")[1]!, "base64")
    } else {
      throw new Error("No input image (photoPath or imageDataUrl) in job params")
    }

    // Load the logo if present.
    let logoDataUrl: string | null = null
    if (params.logoPath) {
      const { data } = await supabase.storage.from("documents").download(params.logoPath)
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer())
        const mime = params.logoPath.endsWith(".png") ? "image/png" : "image/jpeg"
        logoDataUrl = `data:${mime};base64,${buf.toString("base64")}`
      }
    } else if (params.logoDataUrl) {
      logoDataUrl = params.logoDataUrl
    }

    const previews = await generatePreviewDataUrls(originalBuffer, logoDataUrl, params)

    // Upload each composited preview to storage and collect public URLs, plus
    // whatever AI color report came back with it (undefined for most
    // variants — only logoColorMatch cases request one).
    const urls: string[] = []
    const colors: (ColorReport | null)[] = []
    for (let i = 0; i < previews.length; i++) {
      const { dataUrl, colorReport } = previews[i]!
      const buf = Buffer.from(dataUrl.split(",")[1]!, "base64")
      const path = `previews/${job.user_id}/${jobId}-${i}.jpg`
      const { error: upErr } = await supabase.storage.from("public-assets").upload(path, buf, {
        contentType: "image/jpeg",
        upsert: true,
      })
      if (upErr) throw new Error(`Failed to upload preview ${i}: ${upErr.message}`)
      urls.push(supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl)
      colors.push(colorReport ?? null)
    }

    await supabase.from("preview_jobs").update({
      status: "done",
      result_urls: urls,
      result_colors: colors,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview generation failed."
    console.error("[runPreviewJob] failed", jobId, message)
    await supabase.from("preview_jobs").update({
      status: "error",
      error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId)
  }
}
