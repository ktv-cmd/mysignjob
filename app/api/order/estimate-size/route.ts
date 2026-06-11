import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 25

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, quad } = await req.json() as {
      imageDataUrl: string
      quad: { x: number; y: number }[]
    }

    if (!imageDataUrl || !quad || quad.length !== 4)
      return NextResponse.json({ error: "imageDataUrl and 4-point quad required" }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 })

    const base64 = imageDataUrl.split(",")[1]
    if (!base64) return NextResponse.json({ error: "Invalid image data URL" }, { status: 400 })

    // Convert quad to bounding box description for Gemini
    const xs = quad.map(p => p.x)
    const ys = quad.map(p => p.y)
    const cx = xs.reduce((a, b) => a + b, 0) / 4
    const cy = ys.reduce((a, b) => a + b, 0) / 4
    const wFrac = (Math.max(...xs) - Math.min(...xs))
    const hFrac = (Math.max(...ys) - Math.min(...ys))

    const regionDesc =
      `The sign area is the region centered at approximately (${(cx * 100).toFixed(0)}%, ${(cy * 100).toFixed(0)}%) ` +
      `of the image, spanning about ${(wFrac * 100).toFixed(0)}% of the image width ` +
      `and ${(hFrac * 100).toFixed(0)}% of the image height. ` +
      `The four corners of the sign area are at: ` +
      quad.map((p, i) => `${["top-left","top-right","bottom-right","bottom-left"][i]} (${(p.x*100).toFixed(0)}%, ${(p.y*100).toFixed(0)}%)`).join(", ") + "."

    const { GoogleGenAI } = await import("@google/genai")
    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
          {
            text: `You are estimating the real-world dimensions of a storefront sign area from a photo.

${regionDesc}

Work through these steps:
1. Look for scale references in the image. Priority order:
   - Entrance door: standard US commercial door is 36" wide × 80" tall
   - Brick courses: standard US brick is 7.625" wide × 2.625" tall (with mortar ~3.125" per course)
   - CMU blocks: standard US concrete block is 16" wide × 8" tall
   - Windows: typical commercial window 36–48" wide
   - Person (if visible): ~66" tall
   - Car (if visible): ~75" wide
2. Use the best available reference to calculate pixels-per-inch.
3. Measure the sign area corners described above in pixels.
4. Convert to real-world inches using the scale.
5. Cross-check: storefront signs are typically 5–25 feet wide, 1–4 feet tall.

Return ONLY a raw JSON object:
{
  "widthInches": <number>,
  "heightInches": <number>,
  "confidence": <"high"|"medium"|"low">,
  "referencesUsed": ["door", "brick", etc],
  "angleWarning": <true if the photo appears taken at an angle greater than 15 degrees from straight-on>,
  "reasoning": "<one sentence>"
}`,
          },
        ],
      }],
      config: { responseMimeType: "application/json", temperature: 0 },
    })

    const raw = JSON.parse(response.text ?? "{}")

    const widthInches = Math.round(raw.widthInches ?? 0)
    const heightInches = Math.round(raw.heightInches ?? 0)

    if (widthInches <= 0 || heightInches <= 0)
      return NextResponse.json({ error: "Could not estimate dimensions from this photo." }, { status: 422 })

    return NextResponse.json({
      widthInches,
      heightInches,
      confidence: raw.confidence ?? "low",
      referencesUsed: raw.referencesUsed ?? [],
      angleWarning: Boolean(raw.angleWarning),
      reasoning: raw.reasoning ?? "",
    })
  } catch (err) {
    console.error("[estimate-size]", err)
    return NextResponse.json({ error: "Estimation failed." }, { status: 500 })
  }
}
