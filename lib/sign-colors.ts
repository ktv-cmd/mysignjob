// ─── Dura-Bond Aluminum Composite Panel (ACP) Colors ────────────────────────
// Codes are DB-series (aluminyumburada / Dura-Bond official range)
// Hex values are visual approximations for swatch display — not print-accurate
// finish: 'solid' | 'metallic' | 'mirror' | 'wood' — drives swatch render style
// common: shown in collapsed 12-color default grid

export interface PanelColor {
  name: string
  code: string   // e.g. "DB-03"
  hex: string
  finish?: "solid" | "metallic" | "mirror" | "wood"
  common?: boolean
}

export const DURABOND_COLORS: PanelColor[] = [
  // Whites / Greys
  { name: "Signal White",    code: "DB-03", hex: "#F5F5F3", common: true  },
  { name: "Pure White",      code: "DB-20", hex: "#FAFAFA"                },
  { name: "Beige Grey",      code: "DB-06", hex: "#C8C3B8"                },
  { name: "Light Grey",      code: "DB-35", hex: "#B8B8B8", common: true  },
  { name: "Platinum Grey",   code: "DB-21", hex: "#A0A0A0"                },
  { name: "Smoke Grey",      code: "DB-43", hex: "#8A8A8A"                },
  { name: "Dark Grey",       code: "DB-12", hex: "#5A5A5A"                },
  { name: "Graphite Grey",   code: "DB-13", hex: "#404040", common: true  },
  { name: "Anthracite Grey", code: "DB-14", hex: "#2D2D2D"                },
  { name: "Black",           code: "DB-30", hex: "#1A1A1A", common: true  },
  // Metallics
  { name: "Metallic Silver", code: "DB-10", hex: "#C0C0C0", finish: "metallic", common: true },
  { name: "Bronze",          code: "DB-81", hex: "#8C6A2E", finish: "metallic"               },
  { name: "Copper",          code: "DB-83", hex: "#B87333", finish: "metallic"               },
  { name: "Metallic Gold",   code: "DB-85", hex: "#C9A84C", finish: "metallic", common: true },
  { name: "Antique Bamboo",  code: "DB-86", hex: "#C4A96A", finish: "metallic"               },
  // Mirrors
  { name: "Silvery Smoked",  code: "DB-62", hex: "#9E9E9E", finish: "mirror"                 },
  // Warm / Earth
  { name: "Cream",           code: "DB-40", hex: "#F0E6C8"                },
  { name: "Ivory Beige",     code: "DB-42", hex: "#E8D8B0"                },
  { name: "Light Brown",     code: "DB-67", hex: "#C4A882"                },
  { name: "Soil Brown",      code: "DB-68", hex: "#8B6A48"                },
  // Reds / Orange
  { name: "Traffic Red",     code: "DB-61", hex: "#CC2020", common: true  },
  { name: "Ruby Red",        code: "DB-60", hex: "#9B1C1C"                },
  { name: "Orange",          code: "DB-65", hex: "#E06020"                },
  // Yellows
  { name: "Yellow",          code: "DB-45", hex: "#F5C400"                },
  // Blues
  { name: "Ultra Marine Blue", code: "DB-50", hex: "#1A3A8C", common: true },
  { name: "Blue",            code: "DB-55", hex: "#2255B0"                },
  { name: "Azul Blue",       code: "DB-57", hex: "#1E78C8"                },
  // Greens
  { name: "Green",           code: "DB-70", hex: "#2A7A2A"                },
  { name: "Texmat Green",    code: "DB-63", hex: "#3D6B3D"                },
  { name: "Green Grey",      code: "DB-64", hex: "#6A8070"                },
  { name: "Moss Green",      code: "DB-72", hex: "#4E6A3A"                },
  { name: "Turquoise",       code: "DB-71", hex: "#2AB0A0"                },
  // Patinas / Rusty
  { name: "Rusty Patine",    code: "DB-88", hex: "#B05A30", finish: "metallic" },
  { name: "Green Patine",    code: "DB-89", hex: "#5A8A70", finish: "metallic" },
  // Granites
  { name: "Brown Granite",   code: "DB-74", hex: "#7A6050", finish: "metallic" },
  { name: "Granite Grey",    code: "DB-75", hex: "#6A6A6A", finish: "metallic" },
  // Woods
  { name: "Line Wood",       code: "DB-90", hex: "#C8A878", finish: "wood" },
  { name: "Fine Wood",       code: "DB-91", hex: "#B89060", finish: "wood" },
  { name: "Teak",            code: "DB-93", hex: "#9A7248", finish: "wood" },
  { name: "Keifer Line Wood",code: "DB-94", hex: "#D4B880", finish: "wood" },
  { name: "Nussbaum",        code: "DB-95", hex: "#8A6038", finish: "wood" },
  { name: "Dark Ebony",      code: "DB-98", hex: "#2A1A10", finish: "wood" },
  { name: "Light Ebony",     code: "DB-99", hex: "#5A3820", finish: "wood" },
]

export const DEFAULT_PANEL_FACE_COLOR = DURABOND_COLORS.find(c => c.code === "DB-30")! // Black
export const DEFAULT_PANEL_BG_COLOR   = DURABOND_COLORS.find(c => c.code === "DB-03")! // Signal White

// ─── Acrylic Sign Face Colors ─────────────────────────────────────────────────
// Standard cast-acrylic colors used in channel letter faces.
// translucent: glows with internal LED; opaque: for front-lit / non-lit faces only
// Hex values approximate the daylight appearance of the acrylic sheet

export interface AcrylicColor {
  name: string
  code: string   // industry face code (Plexiglas/Cyro numbering common in sign trade)
  hex: string
  translucent?: boolean
  common?: boolean
}

export const ACRYLIC_COLORS: AcrylicColor[] = [
  // Whites / Neutrals
  { name: "White",           code: "2447", hex: "#F8F8F8", translucent: true,  common: true  },
  { name: "Satin White",     code: "7328", hex: "#F0F0EE", translucent: true                 },
  { name: "Ivory",           code: "1579", hex: "#F4ECD4"                                    },
  // Reds
  { name: "Bright Red",      code: "2283", hex: "#D41A1A", translucent: true,  common: true  },
  { name: "Dark Red",        code: "2793", hex: "#8B0000", translucent: true                 },
  { name: "Pink",            code: "9093", hex: "#E87070", translucent: true                 },
  // Oranges / Yellows
  { name: "Orange",          code: "2037", hex: "#E86020", translucent: true,  common: true  },
  { name: "Amber",           code: "2422", hex: "#D4900A", translucent: true                 },
  { name: "Yellow",          code: "2208", hex: "#F5D000", translucent: true,  common: true  },
  // Greens
  { name: "Green",           code: "2092", hex: "#228B22", translucent: true,  common: true  },
  { name: "Light Green",     code: "2108", hex: "#3CB371", translucent: true                 },
  // Blues
  { name: "Blue",            code: "2050", hex: "#1E50B4", translucent: true,  common: true  },
  { name: "Light Blue",      code: "2069", hex: "#4090D0", translucent: true                 },
  { name: "Royal Blue",      code: "2390", hex: "#1A2A80", translucent: true                 },
  // Black
  { name: "Black",           code: "2025", hex: "#1A1A1A",                     common: true  },
  // Specialty
  { name: "Neon Green",      code: "9092", hex: "#39FF14", translucent: true                 },
  { name: "Neon Pink",       code: "9094", hex: "#FF6EC7", translucent: true                 },
]

export const DEFAULT_ACRYLIC_COLOR = ACRYLIC_COLORS.find(c => c.code === "2447")! // White

// ─── Channel Letter Lighting ──────────────────────────────────────────────────

export type LightType = "none" | "front" | "halo" | "front_halo" | "neon"
export type ReturnGlow = "back_only" | "subtle_side" | "half_side" | "full_side"

export interface ChannelLighting {
  type: LightType
  return_glow?: ReturnGlow  // only for halo / front_halo
}

export const LIGHT_TYPES: { value: LightType; label: string; desc: string }[] = [
  { value: "none",       label: "No Light",     desc: "Day use only — no illumination" },
  { value: "front",      label: "Front Lit",    desc: "Light emits through the acrylic face" },
  { value: "halo",       label: "Halo / Back",  desc: "Glow behind the letters onto the wall" },
  { value: "front_halo", label: "Front + Halo", desc: "Face glows and halo behind — maximum impact" },
  { value: "neon",       label: "Neon",         desc: "Neon tube or LED neon strip" },
]

export const RETURN_GLOW_OPTS: { value: ReturnGlow; label: string; desc: string }[] = [
  { value: "back_only",    label: "Back Only",    desc: "Glow only on the back wall — classic halo" },
  { value: "subtle_side",  label: "Subtle Side",  desc: "Slight glow wraps partway onto the return" },
  { value: "half_side",    label: "Half Side",    desc: "Glow covers half the return depth" },
  { value: "full_side",    label: "Full Side",    desc: "Return fully illuminated — maximum glow" },
]
