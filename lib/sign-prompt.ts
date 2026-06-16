// Shared sign-preview prompt builder — used by BOTH the client (to display the
// prompt before generating) and the API route (to actually call Gemini), so the
// two never drift apart.

export type BrandMode = "text-only" | "logo-only" | "logo-and-text"

export interface PromptColor { name: string; code: string; hex: string; finish?: "translucent" | "opaque" | "transparent" | "matte" }

export interface SignPromptParams {
  businessName: string
  signType: string
  brandMode: BrandMode
  hasLogo: boolean
  // material / colors
  material?: string
  primaryColor?: string                 // fallback for vinyl/steel/wood/other
  panelFace?: PromptColor | null        // Dura-Bond ACP letter face (aluminum)
  panelBg?: PromptColor | null          // Dura-Bond ACP backer panel (aluminum)
  acrylic?: PromptColor | null          // acrylic face color (acrylic)
  // lighting (non-awning channel letters)
  lightType?: string                    // none | front | halo | front_halo | neon
  returnGlow?: string                   // back_only | subtle_side | half_side | full_side
  // awning
  awningFrame?: string
  fabricName?: string
  illumination?: string                 // awning illumination
  // corner
  isCorner?: boolean
  foldXPct?: number
}

const SIGN_DESC: Record<string, string> = {
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

const RETURN_GLOW_DESC: Record<string, string> = {
  back_only:   "the glow stays on the back wall only (classic halo) with opaque letter returns",
  subtle_side: "the glow wraps subtly onto the letter returns (sides)",
  half_side:   "the glow illuminates roughly half the depth of the letter returns",
  full_side:   "the entire letter return is illuminated for a full wraparound glow",
}

function lightingClause(lightType?: string, returnGlow?: string): string {
  switch (lightType) {
    case "none":  return "no artificial illumination — natural daylight shadows only"
    case "front": return "front-lit — the letter faces glow evenly with internal LED illumination"
    case "halo":  return `halo back-lit — LEDs behind the letters cast a glow onto the wall; ${RETURN_GLOW_DESC[returnGlow ?? "back_only"]}`
    case "front_halo": return `both front-lit glowing faces AND a back-lit halo glow on the wall behind; ${RETURN_GLOW_DESC[returnGlow ?? "back_only"]}`
    case "neon":  return "exposed neon tube lighting outlining the letters"
    default:      return "front-lit with internal LED illumination"
  }
}

function colorClause(p: SignPromptParams): string {
  if (p.brandMode === "logo-only") {
    return "The colors must match exactly the logo provided in Image 2."
  }
  if (p.brandMode === "logo-and-text" && p.hasLogo) {
    return "Letter/face color: extract the dominant color from the logo in Image 2 and use it for the text. The logo must retain its exact original colors."
  }
  // Material-driven
  if (p.material === "aluminum" && p.panelFace) {
    const face = `The letter faces are Dura-Bond aluminum composite in ${p.panelFace.name} (approx ${p.panelFace.hex}).`
    const bg = p.panelBg
      ? ` The backer/background panel behind the letters is Dura-Bond aluminum composite in ${p.panelBg.name} (approx ${p.panelBg.hex}).`
      : ""
    return face + bg
  }
  if (p.material === "acrylic" && p.acrylic) {
    const finish = p.acrylic.finish ?? "translucent"
    const finishDesc =
      finish === "translucent"  ? "translucent Dura-Cast® acrylic glowing with internal LED illumination" :
      finish === "opaque"       ? "opaque Dura-Cast® acrylic (solid, no light transmission)" :
      finish === "transparent"  ? "transparent tinted Dura-Cast® acrylic (see-through)" :
                                  "matte-finish Dura-Cast® acrylic with a diffused non-gloss surface"
    return `The letter faces are ${finishDesc} in ${p.acrylic.name} (approx ${p.acrylic.hex}).`
  }
  return `Letter/face color: ${p.primaryColor ?? "brushed aluminum"}.`
}

export function buildSignPrompt(p: SignPromptParams): string {
  const cornerClause = p.isCorner && p.foldXPct != null
    ? ` This is a WRAPAROUND CORNER SIGN that bends around the building's vertical corner edge at approximately ${p.foldXPct.toFixed(0)}% across the golden zone. The sign must follow the building corner: the front face covers the left portion and the side face (angled away) covers the right portion, with the business name readable on both faces. Each face catches light differently due to the angle.`
    : ""

  const contentDesc = p.brandMode === "logo-only"
    ? `the logo from Image 2`
    : p.brandMode === "logo-and-text"
    ? `the logo from Image 2 alongside the text '${p.businessName}'`
    : `the text '${p.businessName}'`

  const imageSlotDesc = p.hasLogo
    ? p.brandMode === "logo-only"
      ? `Image 1: storefront — gold/yellow shows where new signage goes. Image 2: supplied logo — use as the sign artwork, preserve its exact colors.`
      : `Image 1: storefront — gold/yellow shows where new signage goes. Image 2: supplied logo — pair with the business name per the text instructions.`
    : ""

  // ── Awning branch ──
  if (p.signType === "awning") {
    const awningLightDesc: Record<string, string> = {
      none: "natural daylight only, no artificial lighting on the awning",
      internal_led: "the awning fabric is internally backlit — LED strips are mounted inside the frame, making the translucent fabric glow warmly from within at night",
    }
    const framePhrase = p.awningFrame ?? "classic slope shed awning"
    const fabricDesc = p.fabricName
      ? `in ${p.fabricName} Sunbrella® acrylic fabric`
      : `in a solid commercial-grade awning fabric (color: ${p.primaryColor})`
    const awningLight = awningLightDesc[p.illumination ?? "none"] ?? awningLightDesc["none"]

    const awningColorDesc = p.brandMode === "logo-only" || p.brandMode === "logo-and-text"
      ? [
          `AWNING COLOR: Analyze the logo in Image 2 and choose an awning fabric color that complements and harmonizes with the logo's color palette. The awning should feel like a natural extension of the brand.`,
          `LOGO COLORS: The logo must retain its exact original colors from Image 2.`,
          p.brandMode === "logo-and-text" ? `TEXT COLOR: The business name text should be white or cream — a clean, neutral color that contrasts well with the awning and complements the logo.` : "",
        ].filter(Boolean).join(" ")
      : [
          `AWNING COLOR: The awning fabric must be ${p.primaryColor}.`,
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

  // ── Non-awning (channel letters / flat cut / etc.) ──
  return [
    `Generate a photorealistic architectural photo of the storefront.`,
    `Inside the area marked by the golden highlight, place a new professional ${SIGN_DESC[p.signType] ?? "sign"}`,
    `that clearly displays ${contentDesc}.`,
    colorClause(p),
    `Lighting: ${lightingClause(p.lightType, p.returnGlow)}.`,
    `The sign must be physically mounted to the wall — do not let it float.`,
    `Completely replace the golden highlighted area with this new signage,`,
    `restoring the original wall texture in any exposed areas around the sign.`,
    cornerClause,
    imageSlotDesc,
  ].filter(Boolean).join(" ")
}
