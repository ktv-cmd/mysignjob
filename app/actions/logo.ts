"use server"

import type { LogoAnalysis } from "@/types"

// Channel letters are cut from flat, single-color acrylic/aluminum faces — one
// color = one fabricated piece. Gradients, photos, and busy multi-color art
// can't be cut, so those logos need a printed/backlit Light Box face instead.
const MAX_COLORS_FOR_LETTERS = 3

export async function analyzeLogoComplexity(logoDataUrl: string): Promise<LogoAnalysis> {
  // @ts-ignore — sharp's types resolve oddly under package.json exports
  const sharp = (await import("sharp")).default
  const base64 = logoDataUrl.split(",")[1]
  const buffer = Buffer.from(base64, "base64")

  const image = sharp(buffer)
  const { channels } = await image.stats()
  const hasTransparency = channels.length === 4 && channels[3].min < 255

  // Quantize to a small palette and count how many colors survive — a cheap,
  // fast stand-in for "how many distinct fabrication colors does this need".
  // The quantize pass only actually runs once the PNG is materialized — piping
  // .raw() straight after .png({colors}) skips quantization and reads the
  // original antialiased pixels, so re-decode the quantized bytes separately.
  const quantizedPng = await image
    .resize(64, 64, { fit: "inside" })
    .png({ colors: 16 })
    .toBuffer()
  const { data, info } = await sharp(quantizedPng)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Only fully-opaque pixels count as a real fabrication color — semi-transparent
  // edge pixels are antialiasing artifacts, not a color the client actually chose.
  const seen = new Set<string>()
  const channelCount = info.channels
  for (let i = 0; i < data.length; i += channelCount) {
    const alpha = channelCount === 4 ? data[i + 3] : 255
    if (alpha < 250) continue
    seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
  }
  const distinctColors = seen.size

  const complexity: LogoAnalysis["complexity"] =
    distinctColors <= MAX_COLORS_FOR_LETTERS ? "simple"
    : distinctColors <= 8 ? "moderate"
    : "complex"

  const lettersFeasible = distinctColors <= MAX_COLORS_FOR_LETTERS

  return {
    distinct_colors: distinctColors,
    has_transparency: hasTransparency,
    complexity,
    letters_feasible: lettersFeasible,
    recommended_fabrication: lettersFeasible ? "channel_letters" : "light_box",
  }
}
