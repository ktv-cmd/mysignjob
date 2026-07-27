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

// ─── Nearest-swatch matching ─────────────────────────────────────────────────
// Given a hex (e.g. a logo's dominant color), pick the closest swatch from a
// palette by simple RGB distance. Used to auto-select sign colors from a logo.
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0]
}

// Squared RGB distance between two hex colors (0 = identical, 195075 = black↔white).
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
}

export function nearestColor<T extends { hex: string }>(hex: string, list: T[]): T {
  const [r, g, b] = hexToRgb(hex)
  let best = list[0]!, bestD = Infinity
  for (const c of list) {
    const [cr, cg, cb] = hexToRgb(c.hex)
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (d < bestD) { bestD = d; best = c }
  }
  return best
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

// ─── Dura-Cast® Acrylic Sign Face Colors ─────────────────────────────────────
// Real Dura-Cast colors sourced from sfsupplies.com catalog
// finish: 'translucent' = glows with LED; 'opaque' = solid, front-lit/no-lit only
//         'transparent' = see-through tinted; 'matte' = diffused non-gloss
// Hex values approximate daylight appearance of the sheet
// common: shown in collapsed default grid

export type AcrylicFinish = "translucent" | "opaque" | "transparent" | "matte"

export interface AcrylicColor {
  name: string
  code: string
  hex: string
  finish: AcrylicFinish
  common?: boolean
}

export const ACRYLIC_COLORS: AcrylicColor[] = [
  // ── Translucent (light glows through — for front-lit faces) ────────────────
  { name: "White",          code: "7328", hex: "#F2F2F0", finish: "translucent", common: true },
  { name: "Red",            code: "2283", hex: "#D41A1A", finish: "translucent", common: true },
  { name: "Blue",           code: "2114", hex: "#1E50B4", finish: "translucent", common: true },
  { name: "Green",          code: "2108", hex: "#228B22", finish: "translucent", common: true },
  { name: "Yellow",         code: "2037", hex: "#F5C400", finish: "translucent", common: true },
  { name: "Orange",         code: "2119", hex: "#E86020", finish: "translucent", common: true },
  { name: "Deep Red",       code: "2793", hex: "#8B0000", finish: "translucent" },
  { name: "Ivory",          code: "2146", hex: "#F4ECD4", finish: "translucent" },
  { name: "Warm White",     code: "7508", hex: "#FAFAF8", finish: "translucent" },

  // ── Opaque (solid, no light through — non-lit faces, halo faces, backers) ──
  { name: "White",          code: "2447", hex: "#F8F8F8", finish: "opaque",      common: true },
  { name: "Black",          code: "2025", hex: "#1A1A1A", finish: "opaque",      common: true },
  { name: "Gray",           code: "2074", hex: "#8A8A8A", finish: "opaque",      common: true },
  { name: "Red",            code: "2157", hex: "#C01818", finish: "opaque"      },
  { name: "Blue",           code: "2050", hex: "#1C4FA0", finish: "opaque"      },
  { name: "Green",          code: "2030", hex: "#1F7A33", finish: "opaque"      },
  { name: "Yellow",         code: "2016", hex: "#F2C200", finish: "opaque"      },
  { name: "Ivory",          code: "2130", hex: "#EFE6CC", finish: "opaque"      },
  { name: "Dark Bronze",    code: "2412", hex: "#4A3520", finish: "opaque"      },

  // ── Transparent (tinted, glass-like see-through) ───────────────────────────
  { name: "Clear",          code: "CLEAR",hex: "#E8F4F8", finish: "transparent", common: true },
  { name: "Smoke Gray",     code: "2064", hex: "#5A5E63", finish: "transparent", common: true },
  { name: "Bronze",         code: "2370", hex: "#6B4226", finish: "transparent" },
  { name: "Glass Green",    code: "3030", hex: "#4A8060", finish: "transparent" },
  { name: "Amber",          code: "2422", hex: "#C8861E", finish: "transparent" },
  { name: "Sapphire Blue",  code: "2424", hex: "#1E5AA8", finish: "transparent" },
  { name: "Ruby Red",       code: "2423", hex: "#B01828", finish: "transparent" },

  // ── Matte (diffused, non-glossy surface — any solid color) ─────────────────
  { name: "Clear Matte",    code: "P-95", hex: "#D8E8EC", finish: "matte",       common: true },
  { name: "White Matte",    code: "M-100",hex: "#F0F0EE", finish: "matte",       common: true },
  { name: "Black Matte",    code: "M-200",hex: "#222222", finish: "matte",       common: true },
  { name: "Light Gray Matte", code: "M-310", hex: "#B0B0B0", finish: "matte"    },
  { name: "Dark Gray Matte",  code: "M-320", hex: "#4D4D4D", finish: "matte"    },
  { name: "Ivory Matte",    code: "M-140",hex: "#EDE4CE", finish: "matte"       },
]

export const DEFAULT_ACRYLIC_COLOR = ACRYLIC_COLORS.find(c => c.code === "7328")! // White translucent
