import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 180

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
type BrandMode = "text-only" | "logo-only" | "logo-and-text"

const PREVIEW_SUPPORTED: SignType[] = ["flat_cut", "channel_letters", "cabinet", "blade", "window_vinyl", "monument", "pylon", "awning", "other"]

function buildSignPrompt(params: {
  businessName: string
  signType: SignType
  primaryColor: string
  illumination: string
  brandMode: BrandMode
  hasLogo: boolean
  awningFrame?: string
  fabricName?: string
  isCorner?: boolean
  foldXPct?: number
}) {
  const { businessName, signType, primaryColor, illumination, brandMode, hasLogo, awningFrame, fabricName, isCorner, foldXPct } = params

  const cornerClause = isCorner && foldXPct != null
    ? ` This is a WRAPAROUND CORNER SIGN that bends around the building's vertical corner edge at approximately ${foldXPct.toFixed(0)}% across the golden zone. The sign must follow the building corner: the front face covers the left portion and the side face (angled away) covers the right portion, with the business name readable on both faces. Each face catches light differently due to the angle.`
    : ""

  // What content goes on the sign
  const contentDesc = brandMode === "logo-only"
    ? `the logo from Image 2`
    : brandMode === "logo-and-text"
    ? `the logo from Image 2 alongside the text '${businessName}'`
    : `the text '${businessName}'`

  // Image slot description (appended when a logo is present)
  const imageSlotDesc = hasLogo
    ? brandMode === "logo-only"
      ? `Image 1: storefront — gold/yellow shows where new signage goes. Image 2: supplied logo — use as the sign artwork, preserve its exact colors.`
      : `Image 1: storefront — gold/yellow shows where new signage goes. Image 2: supplied logo — pair with the business name per the text instructions.`
    : ""

  // Color instruction
  const colorDesc = brandMode === "logo-only"
    ? "The colors must match exactly the logo provided in Image 2."
    : brandMode === "logo-and-text" && hasLogo
    ? `Letter/face color: extract the dominant color from the logo in Image 2 and use it for the text. The logo must retain its exact original colors.`
    : `Letter/face color: ${primaryColor}.`

  const lightDesc: Record<string, string> = {
    none: "no artificial illumination — natural daylight shadows only",
    internal_led: "front-lit with internal LED illumination (glowing faces)",
    external: "externally flood-lit from above",
    halo: "back-lit halo glow behind the letters",
    neon: "neon tube lighting",
    digital: "digital LED display",
  }

  const awningLightDesc: Record<string, string> = {
    none: "natural daylight only, no artificial lighting on the awning",
    internal_led: "the awning fabric is internally backlit — LED strips are mounted inside the frame, making the translucent fabric glow warmly from within at night",
  }

  if (signType === "awning") {
    const framePhrase = awningFrame ?? "classic slope shed awning"
    const fabricDesc = fabricName ? `in ${fabricName} Sunbrella® acrylic fabric` : `in a solid commercial-grade awning fabric (color: ${primaryColor})`
    const awningLight = awningLightDesc[illumination] ?? awningLightDesc["none"]

    const awningColorDesc = brandMode === "logo-only" || brandMode === "logo-and-text"
      ? [
          `AWNING COLOR: Analyze the logo in Image 2 and choose an awning fabric color that complements and harmonizes with the logo's color palette. The awning should feel like a natural extension of the brand.`,
          `LOGO COLORS: The logo must retain its exact original colors from Image 2.`,
          brandMode === "logo-and-text" ? `TEXT COLOR: The business name text should be white or cream — a clean, neutral color that contrasts well with the awning and complements the logo.` : "",
        ].filter(Boolean).join(" ")
      : [
          `AWNING COLOR: The awning fabric must be ${primaryColor}.`,
          `TEXT COLOR: The business name text must be white or cream — a clean, neutral color that stands out clearly against the colored awning fabric.`,
        ].join(" ")

    return [
      `Generate a photorealistic architectural photo of the storefront.`,
      `Inside the golden highlighted area, install a professional fabric storefront awning`,
      `with a ${framePhrase} profile, ${fabricDesc}.`,
      `The sign displays ${contentDesc}.`,
      awningColorDesc,
      `Lighting: ${awningLight}.`,
      `The awning must be physically mounted to the building fascia — no floating.`,
      `Completely replace the golden highlighted area with this awning,`,
      `restoring the original wall texture in any exposed areas around it.`,
      cornerClause,
      imageSlotDesc,
    ].filter(Boolean).join(" ")
  }

  const signDesc: Record<SignType, string> = {
    flat_cut: "flat-cut dimensional letters mounted to the facade",
    channel_letters: "3D illuminated channel letter sign",
    cabinet: "illuminated lightbox cabinet sign",
    blade: "blade sign mounted perpendicular to the facade",
    window_vinyl: "vinyl graphic lettering applied to the window glass",
    monument: "ground-mounted monument sign in front of the building",
    pylon: "tall freestanding pylon pole sign visible from the street",
    awning: "fabric awning sign",
    other: "custom dimensional sign",
  }

  return [
    `Generate a photorealistic architectural photo of the storefront.`,
    `Inside the area marked by the golden highlight, place a new professional ${signDesc[signType] ?? "sign"}`,
    `that clearly displays ${contentDesc}.`,
    colorDesc,
    `Lighting: ${lightDesc[illumination] ?? "natural daylight"}.`,
    `The sign must be physically mounted to the wall — do not let it float.`,
    `Completely replace the golden highlighted area with this new signage,`,
    `restoring the original wall texture in any exposed areas around the sign.`,
    cornerClause,
    imageSlotDesc,
  ].filter(Boolean).join(" ")
}

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
      signType: SignType
      businessName: string
      primaryColor: string
      illumination: string
      brandMode?: BrandMode
      logoDataUrl?: string
      awningFrame?: string
      fabricName?: string
      count?: number
    }

    const {
      imageDataUrl, quad, signType, businessName, primaryColor, illumination,
      brandMode = "text-only", logoDataUrl, awningFrame, fabricName,
      count = 3,
    } = body

    if (!imageDataUrl || !quad || (quad.length !== 4 && quad.length !== 6))
      return NextResponse.json({ error: "imageDataUrl and 4- or 6-point quad required" }, { status: 400 })

    if (!PREVIEW_SUPPORTED.includes(signType)) {
      return NextResponse.json({
        error: `AI preview is not available for ${signType.replace("_", " ")} signs in v1.`,
        skipped: true,
      }, { status: 200 })
    }

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
      businessName, signType, primaryColor, illumination, brandMode, hasLogo,
      awningFrame, fabricName, isCorner, foldXPct,
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
