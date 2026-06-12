import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

// Ported from ~/Desktop/webs/signs/src/lib/ai/provider.ts + route.ts
// Adaptation: quad polygon replaces freehand brush for mask generation

const SIGN_SYSTEM_INSTRUCTION = `
# ROLE
You are a Senior Architectural Signage Visualization Architect rendering a photorealistic sign mockup.

## MASK ERASURE PROTOCOL (Critical)
The golden zone (#FFD740) marks where the new sign goes. Execute in order:
1. IDENTIFY all gold/yellow pixels in the image.
2. ERASE the golden mask completely — restore the underlying building surface (brick, stucco, wood, paint) by inpainting the facade texture.
3. INSERT the new sign as a physical 3D structure bolted to the restored wall.

## SIGN GEOMETRY
- Sign dimensions MUST fill the full golden zone bounding box — never smaller.
- Corners are always hard 90-degree right angles — never rounded.
- Show 3.5" (89mm) Z-axis depth on all sign types (return walls visible from camera angle).
- ZERO GOLD POLICY: final output has 0% gold pixels.

## MATERIALS & LIGHTING (PBR)
- Brushed aluminum returns: Metallic 0.95, Roughness 0.35
- Illuminated acrylic faces: IOR 1.49, subsurface scattering 2mm radius
- Non-illuminated: matte painted metal, shadow from ambient occlusion only
- Back-lit halo: inverse-square falloff light wash on wall behind sign
- Contact shadow where sign meets wall

## COLOR
- If a hex color is specified, use it EXACTLY on letter faces — non-negotiable.
- Never use the golden guide color (#FFD740) as a sign color.

## OUTPUT
One photorealistic 16:9 render with the sign physically integrated into the building facade.
`.trim()

type SignType = "flat_cut" | "channel_letters" | "cabinet" | "blade" | "window_vinyl" | "monument" | "pylon" | "awning" | "other"

// Sign types that support AI preview in v1
const PREVIEW_SUPPORTED: SignType[] = ["flat_cut", "channel_letters", "cabinet", "blade", "window_vinyl", "awning"]

function buildSignPrompt(params: {
  businessName: string
  signType: SignType
  primaryColor: string
  illumination: string
  awningFrame?: string
  fabricName?: string
}) {
  const { businessName, signType, primaryColor, illumination, awningFrame, fabricName } = params

  const lightDesc: Record<string, string> = {
    none: "no artificial illumination — natural daylight shadows only",
    internal_led: "front-lit with internal LED illumination (glowing faces)",
    external: "externally flood-lit from above",
    halo: "back-lit halo glow behind the letters",
    neon: "neon tube lighting",
    digital: "digital LED display",
  }

  // Awning-specific prompt with frame shape and Sunbrella fabric detail
  if (signType === "awning") {
    const framePhrase = awningFrame ?? "classic slope shed awning"
    const fabricDesc = fabricName ? `in ${fabricName} Sunbrella® acrylic fabric` : `in a solid commercial-grade awning fabric (color: ${primaryColor})`
    return [
      `Generate a photorealistic architectural photo of the storefront.`,
      `Inside the golden highlighted area, install a professional fabric storefront awning`,
      `with a ${framePhrase} profile, ${fabricDesc}.`,
      `The business name "${businessName}" must be printed in clean white lettering on the front valence of the awning.`,
      `The awning frame is powder-coated metal; the fabric drapes naturally with correct tension and shadow.`,
      `Lighting: ${lightDesc[illumination] ?? "natural daylight"}.`,
      `The awning must be physically mounted to the building fascia — no floating.`,
      `Completely replace the golden highlighted area with this awning,`,
      `restoring the original wall texture in any exposed areas around it.`,
    ].join(" ")
  }

  const signDesc: Record<SignType, string> = {
    flat_cut: "flat-cut dimensional letters",
    channel_letters: "3D channel letter sign",
    cabinet: "illuminated cabinet lightbox sign",
    blade: "blade sign perpendicular to the facade",
    window_vinyl: "vinyl lettering applied directly to the window glass",
    monument: "monument sign",
    pylon: "pylon sign",
    awning: "fabric awning sign",
    other: "dimensional sign",
  }

  return [
    `Generate a photorealistic architectural photo of the storefront.`,
    `Inside the area marked by the golden highlight, place a new professional ${signDesc[signType] ?? "sign"}`,
    `that clearly displays the business name: "${businessName}".`,
    `Letter/face color: ${primaryColor}.`,
    `Lighting: ${lightDesc[illumination] ?? "natural daylight"}.`,
    `The sign must be physically mounted to the wall — do not let it float.`,
    `Completely replace the golden highlighted area with this new signage,`,
    `restoring the original wall texture in any exposed areas around the sign.`,
  ].join(" ")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      imageDataUrl: string
      quad: { x: number; y: number }[]
      signType: SignType
      businessName: string
      primaryColor: string
      illumination: string
      awningFrame?: string
      fabricName?: string
    }

    const { imageDataUrl, quad, signType, businessName, primaryColor, illumination, awningFrame, fabricName } = body

    if (!imageDataUrl || !quad || quad.length !== 4)
      return NextResponse.json({ error: "imageDataUrl and 4-point quad required" }, { status: 400 })

    if (!PREVIEW_SUPPORTED.includes(signType)) {
      return NextResponse.json({
        error: `AI preview is not available for ${signType.replace("_", " ")} signs in v1. Your order will still receive quotes from sign companies.`,
        skipped: true,
      }, { status: 200 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 })

    // @ts-ignore - sharp types incompatible with moduleResolution:bundler
    const sharp = (await import("sharp")).default
    const originalBase64 = imageDataUrl.split(",")[1]
    const originalBuffer = Buffer.from(originalBase64, "base64")
    const { width: W = 1920, height: H = 1080 } = await sharp(originalBuffer).metadata()

    // ── Generate quad mask as SVG polygon → PNG ─────────────────────────────
    const points = quad.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ")
    const svgMask = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="black"/>
      <polygon points="${points}" fill="white"/>
    </svg>`
    const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer()

    // ── Apply gold guide overlay to storefront (same technique as signs project) ──
    const maskGrey = await sharp(maskBuffer).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer()
    const overlay = Buffer.alloc(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      if ((maskGrey[i] ?? 0) > 40) {
        overlay[i * 4] = 255    // R
        overlay[i * 4 + 1] = 215 // G
        overlay[i * 4 + 2] = 64  // B  → #FFD740
        overlay[i * 4 + 3] = 140  // A (semi-transparent)
      }
    }
    const overlayPng = await sharp(overlay, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
    const annotatedBuffer = await sharp(originalBuffer)
      .composite([{ input: overlayPng, blend: "over" }])
      .jpeg({ quality: 92 })
      .toBuffer()

    // ── Call Gemini image generation ─────────────────────────────────────────
    const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = await import("@google/genai")
    const ai = new GoogleGenAI({ apiKey })

    const prompt = buildSignPrompt({ businessName, signType, primaryColor, illumination, awningFrame, fabricName })

    type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
    const parts: Part[] = [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: annotatedBuffer.toString("base64") } },
    ]

    const maxRetries = 3
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

        // Extract generated image
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

        // ── Composite: blend generated region back over original using mask ──
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

        return NextResponse.json({
          previewDataUrl: `data:image/jpeg;base64,${compositedJpeg.toString("base64")}`,
          provider: "gemini-2.5-flash-image",
        })
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const msg = lastError.message.toLowerCase()
        const retryable = msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("timeout")
        if (!retryable || attempt === maxRetries) break
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
      }
    }

    return NextResponse.json({ error: lastError?.message ?? "Preview generation failed." }, { status: 500 })
  } catch (err) {
    console.error("[generate-preview]", err)
    return NextResponse.json({ error: "Preview generation failed." }, { status: 500 })
  }
}
