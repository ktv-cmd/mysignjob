import { NextRequest, NextResponse } from "next/server"
import { buildSignPrompt, type PromptColor } from "@/lib/sign-prompt"

export const maxDuration = 180

const SIGN_SYSTEM_INSTRUCTION = `
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
IF ILLUMINATED: Ray-traced PBR — Front-lit: subsurface scattering through acrylic faces + edge glow. Back-lit: ray-traced light wash on wall BEHIND sign with inverse-square falloff, NO face glow. Combined: both effects.

## COLOR INTEGRITY:
- LOGO PROVIDED (Image 2): use exact HEX/Pantone from the logo — non-negotiable brand identity.
- LOGO + NAME: sample the dominant HEX from the logo and apply it EXACTLY to the name letterforms (direct HEX transfer, no adjustment).
- TEXT WITH CLIENT COLOR: if a hex is specified, use it EXACTLY on faces and returns.
- TEXT WITHOUT COLOR: analyze the facade and pick complementary finishes (brushed aluminum #A9A9A9, stainless #C0C0C0, matte black #1C1C1C, bronze #CD7F32).
- NEVER use the golden guide color (#FFD740) as a sign color.

═══════════════════════════════════════════════════════════════════════════
LAYER 1: STRUCTURAL RULES (THE CASES)
═══════════════════════════════════════════════════════════════════════════

CASE A (LOGO ONLY): Construct as a 3D CABINET LIGHTBOX MESH — translucent front face + 4 aluminum return walls + back mounting plate, 3.5" Z-extrusion. Extract EXACT colors from the logo. FULL-BLEED FACE: the logo's background color floods 100% of the face edge-to-edge — no raw white acrylic, no margins.

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

type BrandMode = "text-only" | "logo-only" | "logo-and-text"

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

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
}): Promise<string> {
  const { annotatedBuffer, logoBase64, logoMime, prompt, apiKey, sharp, originalBuffer, maskBuffer, W, H } = params

  const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey })

  const parts: Part[] = [
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: annotatedBuffer.toString("base64") } },
  ]
  if (logoBase64) {
    parts.push({ inlineData: { mimeType: logoMime, data: logoBase64 } })
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
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ],
        },
      })

      let generatedBase64: string | null = null
      let generatedMime = "image/png"
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        const p = part as { inlineData?: { data: string; mimeType: string } }
        if (p.inlineData?.data) {
          generatedBase64 = p.inlineData.data
          generatedMime = p.inlineData.mimeType ?? "image/png"
          break
        }
      }

      if (!generatedBase64) {
        const reason = (response.candidates?.[0] as { finishReason?: string })?.finishReason
        throw new Error(`Gemini returned no image. Finish reason: ${reason ?? "unknown"}`)
      }

      // Composite generated region back over original using mask
      const genBuffer = Buffer.from(generatedBase64, "base64")
      const origRgb = await sharp(originalBuffer).resize(W, H).removeAlpha().raw().toBuffer()
      const genRgb = await sharp(genBuffer).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer()
      const blendMask = await sharp(maskBuffer).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer()

      const n = W * H
      const out = Buffer.alloc(n * 3)
      for (let i = 0; i < n; i++) {
        const m = (blendMask[i] ?? 0) / 255
        const o = i * 3
        out[o]     = Math.round((origRgb[o] ?? 0) * (1 - m) + (genRgb[o] ?? 0) * m)
        out[o + 1] = Math.round((origRgb[o + 1] ?? 0) * (1 - m) + (genRgb[o + 1] ?? 0) * m)
        out[o + 2] = Math.round((origRgb[o + 2] ?? 0) * (1 - m) + (genRgb[o + 2] ?? 0) * m)
      }

      const compositedJpeg = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
        .jpeg({ quality: 92 })
        .toBuffer()

      void generatedMime
      return `data:image/jpeg;base64,${compositedJpeg.toString("base64")}`
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      imageDataUrl: string
      quad: { x: number; y: number }[]
      referenceId: string
      lightingType?: "front" | "back" | "both"
      businessName: string
      brandMode?: BrandMode
      logoDataUrl?: string
      fontStyle?: "modern-sans" | "classic-serif" | "bold-condensed"
      letterColor?: string
      awningFrame?: string
      fabricName?: string
      awningIllumination?: string
      panelFace?: PromptColor | null
      panelBg?: PromptColor | null
      acrylic?: PromptColor | null
      count?: number
    }

    const {
      imageDataUrl, quad, referenceId = "front-lid", lightingType, businessName,
      brandMode = "text-only", logoDataUrl, fontStyle, letterColor,
      awningFrame, fabricName, awningIllumination,
      panelFace, panelBg, acrylic,
      count = 3,
    } = body

    if (!imageDataUrl || !quad || (quad.length !== 4 && quad.length !== 6))
      return NextResponse.json({ error: "imageDataUrl and 4- or 6-point quad required" }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 })

    // @ts-ignore
    const sharp = (await import("sharp")).default
    const originalBase64 = imageDataUrl.split(",")[1]
    const originalBuffer = Buffer.from(originalBase64, "base64")
    const { width: W = 1920, height: H = 1080 } = await sharp(originalBuffer).metadata()

    // Build quad mask
    const points = quad.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ")
    const svgMask = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="black"/>
      <polygon points="${points}" fill="white"/>
    </svg>`
    const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer()

    // Apply gold guide overlay
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
    const annotatedBuffer = await sharp(originalBuffer)
      .composite([{ input: overlayPng, blend: "over" }])
      .jpeg({ quality: 92 })
      .toBuffer()

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
      if (mimeMatch?.[1]) logoMime = mimeMatch[1]
    }

    const prompt = buildSignPrompt({
      businessName, brandMode, hasLogo,
      referenceId, lightingType, fontStyle, letterColor,
      panelFace, panelBg, acrylic,
      awningFrame, fabricName, awningIllumination,
      isCorner, foldXPct,
    })

    const genCount = Math.min(Math.max(1, count), 3)
    const sharedParams = { annotatedBuffer, logoBase64, logoMime, prompt, apiKey, sharp, originalBuffer, maskBuffer, W, H }

    // Run sequentially — gemini-2.5-flash-image is a preview model with tight RPM limits
    const results: PromiseSettledResult<string>[] = []
    for (let i = 0; i < genCount; i++) {
      try {
        const url = await generateOne(sharedParams)
        results.push({ status: "fulfilled", value: url })
      } catch (err) {
        results.push({ status: "rejected", reason: err })
      }
    }

    const previewDataUrls = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map(r => r.value)

    if (previewDataUrls.length === 0) {
      const firstErr = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined
      return NextResponse.json({ error: firstErr?.reason?.message ?? "All preview generations failed." }, { status: 500 })
    }

    return NextResponse.json({ previewDataUrls, provider: "gemini-2.5-flash-image" })
  } catch (err) {
    console.error("[generate-preview]", err)
    return NextResponse.json({ error: "Preview generation failed." }, { status: 500 })
  }
}
