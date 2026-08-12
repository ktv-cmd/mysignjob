import { NextRequest, NextResponse } from "next/server"
import { generatePreviewDataUrls, type PreviewJobParams } from "@/lib/ai/preview"

export const maxDuration = 180

// Synchronous preview generation — local dev only. In production this hits the
// Netlify function timeout and returns a 504; use /api/order/preview/start instead.
export async function POST(req: NextRequest) {
  if (process.env.LOCAL_DEV !== "true") {
    return NextResponse.json(
      { error: "Use /api/order/preview/start for async generation in production." },
      { status: 404 },
    )
  }
  try {
    const body = await req.json() as { imageDataUrl: string; logoDataUrl?: string } & PreviewJobParams
    const { imageDataUrl, logoDataUrl } = body

    if (!imageDataUrl || !body.quad || (body.quad.length !== 4 && body.quad.length !== 6))
      return NextResponse.json({ error: "imageDataUrl and 4- or 6-point quad required" }, { status: 400 })

    if (!process.env.GEMINI_API_KEY)
      return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 })

    const originalBuffer = Buffer.from(imageDataUrl.split(",")[1]!, "base64")
    const previews = await generatePreviewDataUrls(originalBuffer, logoDataUrl, body)

    return NextResponse.json({
      previewDataUrls: previews.map(p => p.dataUrl),
      previewColors: previews.map(p => p.colorReport ?? null),
      provider: "gemini-2.5-flash-image",
    })
  } catch (err) {
    console.error("[generate-preview]", err)
    const message = err instanceof Error ? err.message : "Preview generation failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
