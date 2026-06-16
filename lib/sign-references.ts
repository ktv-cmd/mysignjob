// ─── Sign Reference Styles ────────────────────────────────────────────────────
// Ported from webs/signs — the 6 storefront sign styles a client picks from.
// Each style carries its own lighting / material / depth / mounting properties,
// which drive the AI prompt + map onto the marketplace SignSpec.

import type { SignType, SignMaterial, IlluminationType } from "@/types"

export type LightingType = "front" | "back" | "both"
export type MaterialFeel = "brushed-metal" | "acrylic" | "neon" | "dimensional" | "flat"
export type DepthStyle = "flat" | "shallow" | "deep"
export type MountingStyle = "flush" | "stand-off" | "raceway"

export interface ReferenceStyle {
  id: string
  name: string
  description: string
  imageUrl: string
  lightingType: LightingType
  materialFeel: MaterialFeel
  depthStyle: DepthStyle
  mountingStyle: MountingStyle
  hasBackingPlate: boolean
  compatibleLightModes: LightingType[]
}

export const REFERENCE_STYLES: ReferenceStyle[] = [
  {
    id: "front-lid",
    name: "Front Lit Sign",
    description: "Illuminated letters lit from the front — bright, clean, visible day and night",
    imageUrl: "/references/front-lid.jpg",
    lightingType: "front",
    materialFeel: "acrylic",
    depthStyle: "shallow",
    mountingStyle: "stand-off",
    hasBackingPlate: false,
    compatibleLightModes: ["front"],
  },
  {
    id: "back-front-lid",
    name: "Back & Front Lit",
    description: "Letters lit front and back — halo glow behind with bright face illumination",
    imageUrl: "/references/back-front-lid.jpg",
    lightingType: "both",
    materialFeel: "acrylic",
    depthStyle: "shallow",
    mountingStyle: "stand-off",
    hasBackingPlate: false,
    compatibleLightModes: ["front", "back", "both"],
  },
  {
    id: "back-lit",
    name: "Back Lit Sign",
    description: "Halo backlit letters — LED glow on the wall behind, premium night presence",
    imageUrl: "/references/back-lit.jpg",
    lightingType: "back",
    materialFeel: "acrylic",
    depthStyle: "shallow",
    mountingStyle: "stand-off",
    hasBackingPlate: false,
    compatibleLightModes: ["back"],
  },
  {
    id: "light-box",
    name: "Light Box",
    description: "Backlit cabinet sign — classic, even illumination across the entire face",
    imageUrl: "/references/light-box.jpg",
    lightingType: "back",
    materialFeel: "acrylic",
    depthStyle: "flat",
    mountingStyle: "flush",
    hasBackingPlate: true,
    compatibleLightModes: ["back", "both"],
  },
  {
    id: "no-light-outdoor",
    name: "No Light – 3D Outdoor",
    description: "Bold 3D dimensional letters — no illumination, high-end professional look",
    imageUrl: "/references/no-light-outdoor.jpg",
    lightingType: "front",
    materialFeel: "brushed-metal",
    depthStyle: "deep",
    mountingStyle: "stand-off",
    hasBackingPlate: false,
    compatibleLightModes: ["front"],
  },
  {
    id: "awning",
    name: "Awning Sign",
    description: "Custom printed or lit fabric awning — street presence, weather protection, branding",
    imageUrl: "/references/awning.jpg",
    lightingType: "front",
    materialFeel: "flat",
    depthStyle: "flat",
    mountingStyle: "flush",
    hasBackingPlate: false,
    compatibleLightModes: ["front"],
  },
]

export const DEFAULT_REFERENCE = REFERENCE_STYLES[0] // Front Lit

// ─── Font styles (for name-only / logo+name) ─────────────────────────────────

export type FontStyle = "modern-sans" | "classic-serif" | "bold-condensed"

export const FONT_OPTIONS: { id: FontStyle; name: string }[] = [
  { id: "modern-sans", name: "Modern Sans" },
  { id: "classic-serif", name: "Classic Serif" },
  { id: "bold-condensed", name: "Bold Condensed" },
]

// Long, prompt-ready descriptions (matches webs/signs variation-planner)
export function getFontDescription(fontStyle?: FontStyle): string {
  const map: Record<FontStyle, string> = {
    "modern-sans": "Modern sans-serif typeface (geometric, clean lines, contemporary feel). Similar to Futura, Avant Garde, or Gotham.",
    "classic-serif": "Classic serif typeface (traditional, elegant, timeless). Similar to Trajan, Times Roman, or Garamond. Well-proportioned with refined serifs.",
    "bold-condensed": "Bold condensed sans-serif (industrial, impactful, space-efficient). Similar to Impact, Univers Condensed, or Trade Gothic Bold. Tight letter spacing, strong presence.",
  }
  return fontStyle ? map[fontStyle] : "Professional signage typeface appropriate for the selected style"
}

// Short inline phrase used inside the channel-letter sentence
export function getFontPhrase(fontStyle?: FontStyle): string {
  const map: Record<FontStyle, string> = {
    "modern-sans": " with a modern, clean sans-serif font",
    "classic-serif": " with an elegant, classic serif font",
    "bold-condensed": " with a bold, condensed industrial font",
  }
  return fontStyle ? map[fontStyle] : " with a professional, modern font"
}

// ─── Reference → marketplace SignSpec mapping ────────────────────────────────
// The order/bidding system still records a sign_type / material / illumination,
// so each reference style maps onto those enum values.

export interface SpecMapping {
  signType: SignType
  material: SignMaterial
  illumination: IlluminationType
  /** which color picker to show: dura-bond ACP, dura-cast acrylic, or awning fabric */
  colorSystem: "durabond" | "acrylic" | "awning"
}

export const REFERENCE_SPEC_MAP: Record<string, SpecMapping> = {
  "front-lid":        { signType: "channel_letters", material: "acrylic",  illumination: "internal_led", colorSystem: "acrylic"  },
  "back-front-lid":   { signType: "channel_letters", material: "acrylic",  illumination: "halo",         colorSystem: "acrylic"  },
  "back-lit":         { signType: "channel_letters", material: "acrylic",  illumination: "halo",         colorSystem: "acrylic"  },
  "light-box":        { signType: "cabinet",         material: "acrylic",  illumination: "internal_led", colorSystem: "acrylic"  },
  "no-light-outdoor": { signType: "flat_cut",        material: "aluminum", illumination: "none",         colorSystem: "durabond" },
  "awning":           { signType: "awning",          material: "vinyl",    illumination: "none",         colorSystem: "awning"   },
}

export function getSpecMapping(referenceId: string): SpecMapping {
  return REFERENCE_SPEC_MAP[referenceId] ?? REFERENCE_SPEC_MAP["front-lid"]
}
