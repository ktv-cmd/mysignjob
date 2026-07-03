// Shared sign-preview prompt builder — used by BOTH the client (to display the
// prompt before generating) and the API route (to actually call Gemini), so the
// two never drift apart.
//
// Structure ported from webs/signs (reference-style driven, 3 brand cases),
// extended to keep my-sign-job's Dura-Bond ACP / Dura-Cast acrylic color systems.

import { getFontDescription, getFontPhrase, type FontStyle } from "@/lib/sign-references"

export type BrandMode = "text-only" | "logo-only" | "logo-and-text"

export interface PromptColor { name: string; code: string; hex: string; finish?: "translucent" | "opaque" | "transparent" | "matte" }

export interface SignPromptParams {
  businessName: string
  brandMode: BrandMode
  hasLogo: boolean
  // ── reference style (primary signage selector, from webs/signs) ──
  referenceId: string                   // front-lid | back-front-lid | back-lit | light-box | no-light-outdoor | awning
  lightingType?: "front" | "back" | "both"
  // ── typography (name-only / logo+name) ──
  fontStyle?: FontStyle
  letterColor?: string                  // hex chosen by client OR extracted from logo
  // ── material colors (kept from my-sign-job) ──
  panelFace?: PromptColor | null        // Dura-Bond ACP letter face (aluminum)
  panelBg?: PromptColor | null          // backer panel color (when hasBackground)
  acrylic?: PromptColor | null          // Dura-Cast acrylic face (acrylic)
  // ── backer panel (channel-letter styles) ──
  hasBackground?: boolean               // true = letters on a finished backer panel; false = mounted directly on the wall
  bgMaterial?: "aluminum" | "acrylic"   // backer panel material (when hasBackground)
  // ── awning ──
  awningFrame?: string
  fabricName?: string
  awningIllumination?: string           // none | internal_led
  // ── corner ──
  isCorner?: boolean
  foldXPct?: number
  // ── free-form client instructions appended to the generated prompt ──
  customPrompt?: string
}

// ─── Lighting description (channel letters) ───────────────────────────────────
function lightingDescription(lightingType?: string): string {
  const map: Record<string, string> = {
    front: "front-lit illumination — glowing letter faces with internal LED, edge-glow from acrylic refraction",
    back: "back-lit halo illumination — LED glow washing onto the wall behind the letters (inverse-square falloff), opaque faces",
    both: "both front-lit glowing faces AND a back-lit halo glow on the wall behind",
  }
  return map[lightingType ?? "front"] ?? "professional illumination"
}

// ─── Color clause — brand mode + material color systems ───────────────────────
function colorClause(p: SignPromptParams): string {
  // Logo present — material was auto-selected to best match the logo's dominant color.
  // Use ONE material only; never mix acrylic and aluminum on the same sign.
  if (p.hasLogo) {
    if (p.brandMode === "logo-only") {
      if (p.acrylic) {
        const finish = p.acrylic.finish ?? "translucent"
        const finishDesc =
          finish === "translucent" ? "translucent Dura-Cast® acrylic (faces glow with internal LED)" :
          finish === "opaque"      ? "opaque Dura-Cast® acrylic (solid face, no light pass-through)" :
          finish === "transparent" ? "transparent tinted Dura-Cast® acrylic (see-through face)" :
                                     "matte Dura-Cast® acrylic (diffused non-gloss face)"
        return `LOGO COLORS: reproduce the logo from Image 2 with exact fidelity — non-negotiable brand identity. Letter/face material: ${finishDesc} in ${p.acrylic.name} (${p.acrylic.hex}) — the closest acrylic match to the logo's dominant color. Do NOT use aluminum on any element.`
      }
      // No acrylic match — use aluminum only
      const alum = p.panelFace ? ` in ${p.panelFace.name} (${p.panelFace.hex})` : " brushed aluminum"
      return `LOGO COLORS: reproduce the logo from Image 2 with exact fidelity — non-negotiable brand identity. Letter/face material: Dura-Bond aluminum composite${alum} — no matching acrylic color available. Do NOT use acrylic on any element.`
    }
    // logo-and-text
    if (p.acrylic) {
      const finish = p.acrylic.finish ?? "translucent"
      const finishDesc =
        finish === "translucent" ? "translucent Dura-Cast® acrylic (faces glow)" :
        finish === "opaque"      ? "opaque Dura-Cast® acrylic (solid face)" :
        finish === "transparent" ? "transparent tinted Dura-Cast® acrylic" :
                                   "matte Dura-Cast® acrylic"
      return `LOGO: retain its exact original colors from Image 2. NAME LETTERS: use ${finishDesc} in ${p.acrylic.name} (${p.acrylic.hex}) — sampled from the logo's dominant color for unified brand identity. Do NOT use aluminum on any element.`
    }
    const alum = p.panelFace ? ` in ${p.panelFace.name} (${p.panelFace.hex})` : " brushed aluminum"
    return `LOGO: retain its exact original colors from Image 2. NAME LETTERS: Dura-Bond aluminum composite channel letters${alum} — color sampled from the logo's dominant tone. Do NOT use acrylic on any element.`
  }

  // No logo — name-only (Case B): use the chosen material color
  if (p.acrylic) {
    const finish = p.acrylic.finish ?? "translucent"
    const finishDesc =
      finish === "translucent"  ? "translucent Dura-Cast® acrylic glowing with internal LED illumination" :
      finish === "opaque"       ? "opaque Dura-Cast® acrylic (solid, no light transmission)" :
      finish === "transparent"  ? "transparent tinted Dura-Cast® acrylic (see-through)" :
                                  "matte-finish Dura-Cast® acrylic with a diffused non-gloss surface"
    return `The letter faces are ${finishDesc} in ${p.acrylic.name} (approx ${p.acrylic.hex}).`
  }
  if (p.panelFace) {
    return `The letter faces are Dura-Bond aluminum composite in ${p.panelFace.name} (approx ${p.panelFace.hex}).`
  }
  if (p.letterColor) {
    return `The letters should be ${p.letterColor}.`
  }
  return "The letters should complement the building's color palette — brushed aluminum, matte black, or bronze."
}

// ─── Backer-panel clause (channel-letter styles only) ─────────────────────────
// With a panel the letters sit on a clean finished backdrop; without one they are
// stud-mounted straight onto the existing wall.
function backgroundClause(p: SignPromptParams): string {
  if (p.hasBackground === false) {
    return "MOUNTING: The channel letters are mounted INDIVIDUALLY and DIRECTLY onto the existing building wall (flush stud-mount) — there is NO backer panel or raceway box behind them; the original wall surface stays fully visible between and around each letter."
  }
  if (p.hasBackground && p.panelBg) {
    let panelDesc: string
    if (p.bgMaterial === "acrylic") {
      const f = p.panelBg.finish ?? "opaque"
      panelDesc =
        f === "translucent" ? `flush translucent acrylic backer panel (~3/16" thick) that glows evenly with internal LED illumination` :
        f === "transparent" ? `flush tinted transparent acrylic backer panel (~3/16" thick), glass-like and see-through` :
        f === "matte"       ? `flush matte-finish acrylic backer panel (~3/16" thick) with a diffused, non-glossy surface` :
                              `flush acrylic backer panel (~3/16" thick) with a smooth solid opaque face`
    } else {
      panelDesc = `flush aluminum-composite backer panel (~1" thick) with crisp 90° edges`
    }
    return `BACKER PANEL: The letters are mounted on a rectangular ${panelDesc} finished in ${p.panelBg.name} (approx ${p.panelBg.hex}) that fills the entire sign zone, giving the letters a clean finished backdrop instead of the bare wall. The panel sits flat against the wall and the letters stand proud of its face.`
  }
  return ""
}

// ─── Awning color rules (ported from webs/signs getAwningColorDescription) ─────
function awningColorClause(p: SignPromptParams): string {
  if (p.brandMode === "text-only") {
    const awningColor = p.fabricName ? `${p.fabricName}` : (p.letterColor || "a rich, professional color that complements the building")
    return [
      `AWNING COLOR: The awning fabric must be ${awningColor}.`,
      `TEXT COLOR: The business name text must be white or cream — a clean, neutral color that stands out clearly against the colored awning fabric.`,
      `The contrast between the colored awning and white text should be sharp and highly legible.`,
    ].join(" ")
  }
  if (p.brandMode === "logo-only") {
    return [
      `AWNING COLOR: Analyze the logo in Image 2 and choose an awning fabric color that complements and harmonizes with the logo's color palette.`,
      `The awning should feel like a natural extension of the brand.`,
      `LOGO COLORS: The logo must retain its exact original colors from Image 2.`,
    ].join(" ")
  }
  return [
    `AWNING COLOR: ${p.fabricName ? `The awning fabric is ${p.fabricName}, chosen to harmonize with the logo.` : "Analyze the logo in Image 2 and choose an awning fabric color that complements the logo's palette."}`,
    `LOGO COLORS: The logo must retain its exact original colors from Image 2.`,
    `TEXT COLOR: The business name text should be white or cream — clean and neutral, contrasting well with the awning and complementing the logo.`,
  ].join(" ")
}

// Extra emphasis when a logo is supplied. The generative model tends to re-draw
// the logo instead of preserving it, so we hammer on exact reproduction.
function logoFidelityClause(p: SignPromptParams): string {
  if (!p.hasLogo) return ""
  return "LOGO FIDELITY (critical): reproduce the supplied logo from Image 2 EXACTLY as provided — identical shapes, proportions, letterforms, spacing, and colors. Do NOT redraw, restyle, simplify, re-letter, translate, add, remove, or reinterpret any part of the logo. Treat it as a fixed brand asset placed onto the sign, unchanged."
}

export function buildSignPrompt(p: SignPromptParams): string {
  const base = buildBasePrompt(p)
  const custom = p.customPrompt?.trim()
    ? `ADDITIONAL CLIENT INSTRUCTIONS (high priority, override defaults where they conflict): ${p.customPrompt.trim()}`
    : ""
  return [base, logoFidelityClause(p), custom].filter(Boolean).join(" ")
}

function buildBasePrompt(p: SignPromptParams): string {
  const cornerClause = p.isCorner && p.foldXPct != null
    ? ` This is a WRAPAROUND CORNER SIGN that bends around the building's vertical corner edge at approximately ${p.foldXPct.toFixed(0)}% across the golden zone. The front face covers the left portion and the side face (angled away) covers the right portion, with the business name readable on both faces.`
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

  // ── Awning ──
  if (p.referenceId === "awning") {
    const framePhrase = p.awningFrame ?? "classic slope shed awning"
    const lit = p.awningIllumination === "internal_led"
      ? "The awning fabric is internally backlit — LED strips inside the frame make the translucent fabric glow warmly from within at night."
      : "Use natural daylight only — no artificial glow or internal illumination."
    return [
      `Generate a photorealistic architectural photo of the storefront.`,
      `Inside the golden highlighted area, install a professional fabric storefront awning with a ${framePhrase} profile that clearly displays ${contentDesc}.`,
      `The awning must be heavyweight canvas fabric with natural draping and visible texture; graphics appear screen-printed or vinyl-applied onto the fabric, following its curves.`,
      awningColorClause(p),
      lit,
      `The awning must be anchored to the building with a visible metal frame — do not let it float.`,
      `Completely replace the golden highlighted area with this awning, restoring the original wall texture around it.`,
      cornerClause,
      imageSlotDesc,
    ].filter(Boolean).join(" ")
  }

  // ── Light box / cabinet ──
  if (p.referenceId === "light-box") {
    return [
      `Generate a photorealistic architectural photo of the storefront.`,
      `Inside the golden highlighted area, place a new high-end illuminated light box cabinet sign that clearly displays ${contentDesc}.`,
      `The sign is a sleek aluminum cabinet with a translucent acrylic face panel and visible depth (3.5" / 89mm), crisp edges, and internal LED illumination creating an even, soft glow.`,
      colorClause(p),
      `The cabinet must be physically mounted to the wall with visible brackets — do not let it float, and cast realistic contact shadows.`,
      `Completely replace the golden highlighted area with this new signage, restoring the wall texture around it.`,
      cornerClause,
      imageSlotDesc,
    ].filter(Boolean).join(" ")
  }

  // ── Channel letters (front / back / both / no-light) ──
  const noLight = p.referenceId === "no-light-outdoor"
  const fontPhrase = (p.brandMode !== "logo-only") ? getFontPhrase(p.fontStyle) : ""
  const fontDirective = (p.brandMode !== "logo-only" && p.fontStyle)
    ? ` Typography: ${getFontDescription(p.fontStyle)}`
    : ""
  const lightSentence = noLight
    ? `The sign has NO artificial illumination — matte/brushed finishes, hard sun-lit contact shadows, and bold 3.5" (89mm) geometric depth for impact.`
    : `The sign must have ${lightingDescription(p.lightingType)}.`

  return [
    `Generate a photorealistic architectural photo of the storefront.`,
    `Inside the golden highlighted area, place new high-end dimensional 3D channel letters${fontPhrase} that clearly read ${contentDesc}.`,
    colorClause(p),
    backgroundClause(p),
    lightSentence,
    fontDirective,
    `Ensure the signage is physically mounted to the wall with visible hardware — do not let it float; letter return planes (sides) must be visible to prove 3D depth.`,
    `Completely replace the golden highlighted area with this new signage, restoring the wall texture around it.`,
    cornerClause,
    imageSlotDesc,
  ].filter(Boolean).join(" ")
}
