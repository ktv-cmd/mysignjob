"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient as createBrowserClient } from "@/lib/supabase/client"
import { saveGuestProfile } from "@/app/actions/auth"
import PhotoUpload from "@/components/order/PhotoUpload"
import QuadSelector, { type QuadPoint } from "@/components/order/QuadSelector"
import { createOrder } from "@/app/actions/order"
import { analyzeLogoComplexity } from "@/app/actions/logo"
import { formatDimensions } from "@/lib/utils"
import type { IlluminationType, SignMaterial, SignSpec, AwningFrameStyle, SunbrellaFabric, LogoAnalysis } from "@/types"
import {
  DURABOND_COLORS, ACRYLIC_COLORS,
  DEFAULT_PANEL_FACE_COLOR, DEFAULT_PANEL_BG_COLOR, DEFAULT_ACRYLIC_COLOR,
  nearestColor, colorDistance,
  type PanelColor, type AcrylicColor,
} from "@/lib/sign-colors"
import {
  REFERENCE_STYLES, DEFAULT_REFERENCE, FONT_OPTIONS, getSpecMapping,
  type FontStyle,
} from "@/lib/sign-references"
import PictureChoice from "@/components/order/PictureChoice"
import { buildSignPrompt, type SignPromptParams } from "@/lib/sign-prompt"

type Step = "photo" | "quad" | "customize" | "preview" | "review"

const STEPS: Step[] = ["photo", "quad", "customize", "preview", "review"]
const STEP_LABELS: Record<Step, string> = {
  photo: "Photo",
  quad: "Mark Sign Area",
  customize: "Sign Details",
  preview: "AI Preview",
  review: "Submit",
}

interface SizeResult {
  widthInches: number
  heightInches: number
  frontWidthInches?: number
  sideWidthInches?: number
  isCorner?: boolean
  confidence: "high" | "medium" | "low"
  referencesUsed: string[]
  angleWarning: boolean
  reasoning: string
}

const AWNING_LIGHTING: { value: IlluminationType; label: string; desc: string }[] = [
  { value: "none",         label: "No Lighting",             desc: "Daytime only, no illumination" },
  { value: "internal_led", label: "Backlit (interior light)", desc: "Fabric glows from inside the frame at night" },
]

// Dura-Cast acrylic finish — client choice; filters the swatches below.
const ACRYLIC_FINISHES: { value: "translucent" | "opaque" | "transparent" | "matte"; badge: string; label: string; desc: string }[] = [
  { value: "translucent", badge: "T", label: "Translucent", desc: "Glows evenly with internal LED — best for lit signs" },
  { value: "opaque",      badge: "O", label: "Opaque",      desc: "Solid color, no light passes through" },
  { value: "transparent", badge: "◇", label: "Transparent", desc: "Tinted see-through, glass-like" },
  { value: "matte",       badge: "M", label: "Matte",       desc: "Diffused, non-glossy soft finish" },
]

// Material choice for all non-awning signs — friendly durability + cost guidance.
const SIGN_MATERIALS: {
  value: "acrylic" | "aluminum"
  label: string
  cost: string          // short cost tag
  costTone: string      // tailwind classes for the cost pill
  desc: string
}[] = [
  {
    value: "acrylic",
    label: "Acrylic",
    cost: "$ · More affordable",
    costTone: "bg-green-100 text-green-700",
    desc: "Lightweight cast acrylic. Best value and ideal for illuminated signs — the faces glow beautifully. Holds up well outdoors for years; colors can fade slightly faster than metal over a long lifespan.",
  },
  {
    value: "aluminum",
    label: "Aluminum",
    cost: "$$ · Premium",
    costTone: "bg-amber-100 text-amber-700",
    desc: "Aluminum composite panel (Dura-Bond). The most durable, fully weatherproof and rust-free with a high-end finish. Costs more than acrylic but lasts the longest with minimal upkeep.",
  },
]

// ── Awning frame styles (industry standard — most common is "standard" shed slope)
const AWNING_FRAMES: { value: AwningFrameStyle; label: string; desc: string; aiPhrase: string }[] = [
  { value: "standard_valence", label: "Standard w/ Valence", desc: "Sloped + front valence drop",     aiPhrase: "traditional slope awning with a front valence drop" },
  { value: "standard",         label: "Standard",            desc: "Classic slope — most common",      aiPhrase: "classic slope shed awning" },
  { value: "arch",             label: "Arch",                desc: "Curved top, flat base",            aiPhrase: "arched curved-top awning" },
  { value: "bullnose",         label: "Bullnose",            desc: "Rounded convex front edge",        aiPhrase: "bullnose convex-front rounded awning" },
  { value: "dome",             label: "Dome",                desc: "Full semicircle dome",             aiPhrase: "full dome semicircular awning" },
  { value: "circular",         label: "Circular",            desc: "Gentle half-barrel curve",         aiPhrase: "circular barrel-curved awning" },
  { value: "gable",            label: "Gable",               desc: "Peaked ridge roof shape",          aiPhrase: "gable peaked-ridge awning" },
  { value: "half_round",       label: "Half Round",          desc: "Arched with swept sides",          aiPhrase: "half-round arch awning with swept sides" },
  { value: "quarter_round",    label: "Quarter Round",       desc: "Quarter-circle from wall",         aiPhrase: "quarter-round curved awning projecting from wall" },
  { value: "concave",          label: "Concave",             desc: "Inward curved, dramatic flair",    aiPhrase: "concave inward-curved awning" },
  { value: "waterfall",        label: "Waterfall",           desc: "Sweeping cascade curve",           aiPhrase: "waterfall cascading curved awning" },
  { value: "box",              label: "Box",                 desc: "Flat top, boxy profile",           aiPhrase: "flat-top box awning with straight returns" },
]

// ── Sunbrella Awning/Marine Grade solid fabric palette (10-yr warranty, weatherproof)
// Codes are official Sunbrella SKU prefixes; hex values are visual approximations for swatches.
// common: true = shown in the default collapsed view (12 most popular storefront choices)
const SUNBRELLA_COLORS: SunbrellaFabric[] = [
  // Neutrals
  { name: "Natural",        code: "4604", hex: "#F2EFE4", common: true  },
  { name: "White",          code: "4634", hex: "#FAFAFA", common: true  },
  { name: "Linen",          code: "6037", hex: "#EDE4D0"                },
  { name: "Parchment",      code: "6083", hex: "#E5DCC3"                },
  { name: "Beige",          code: "4620", hex: "#D9CDB3", common: true  },
  { name: "Sand",           code: "4642", hex: "#C9B99A"                },
  { name: "Antique Beige",  code: "5402", hex: "#C4B08A"                },
  // Browns
  { name: "Toast",          code: "4628", hex: "#8B6B56", common: true  },
  { name: "Bark",           code: "5461", hex: "#7A5C46"                },
  { name: "Teak",           code: "5489", hex: "#6B4F37"                },
  { name: "Cocoa",          code: "6076", hex: "#5C4232"                },
  { name: "Walnut Brown",   code: "4618", hex: "#5C4B3B"                },
  { name: "Char Brown",     code: "7786", hex: "#3D2E26"                },
  // Reds / Pinks
  { name: "Henna",          code: "5433", hex: "#8B3A2A"                },
  { name: "Terracotta",     code: "4622", hex: "#A84E34", common: true  },
  { name: "Brick",          code: "5409", hex: "#9C3628"                },
  { name: "Jockey Red",     code: "4023", hex: "#C0201E"                },
  { name: "Burgundy",       code: "4631", hex: "#5C1A2B", common: true  },
  { name: "Black Cherry",   code: "6040", hex: "#4A1C28"                },
  // Oranges / Yellows
  { name: "Paprika",        code: "4626", hex: "#B54520"                },
  { name: "Orange",         code: "6009", hex: "#D2622A"                },
  { name: "Sunflower",      code: "4602", hex: "#E0A92B"                },
  { name: "Canary",         code: "5454", hex: "#F2CC3A"                },
  // Greens
  { name: "Meadow",         code: "5432", hex: "#4E7A4A"                },
  { name: "Erin Green",     code: "6000", hex: "#2E6B3E", common: true  },
  { name: "Basil",          code: "4688", hex: "#3E5641"                },
  { name: "Palm",           code: "5446", hex: "#2D5038"                },
  { name: "Forest Green",   code: "4637", hex: "#1F3D2B", common: true  },
  { name: "Hunter Green",   code: "4053", hex: "#1A3320"                },
  // Blues
  { name: "Sky Blue",       code: "6024", hex: "#5B8FB9"                },
  { name: "Cobalt",         code: "5439", hex: "#3B6EA5"                },
  { name: "Pacific Blue",   code: "4601", hex: "#1C3F6E", common: true  },
  { name: "Royal Blue",     code: "4617", hex: "#2E4A7A"                },
  { name: "Sapphire Blue",  code: "6041", hex: "#1B4F8A"                },
  { name: "Marine Blue",    code: "4021", hex: "#1A3A5C"                },
  { name: "Navy",           code: "6026", hex: "#1E2A44", common: true  },
  // Greys / Black
  { name: "Silver",         code: "4651", hex: "#B8BCC0", common: true  },
  { name: "Cadet Grey",     code: "6030", hex: "#8A9499"                },
  { name: "Slate",          code: "4684", hex: "#4D5358"                },
  { name: "Charcoal",       code: "4648", hex: "#383E42"                },
  { name: "Black",          code: "4608", hex: "#1C1C1C", common: true  },
]

const DEFAULT_AWNING_FABRIC = SUNBRELLA_COLORS.find(c => c.code === "4601")! // Pacific Blue

// ── Dura-Bond / panel color picker (reusable for face + bg) ─────────────────
function PanelColorPicker({
  label, subtitle, selected, onSelect, visible, showAll, onToggleAll, total,
}: {
  label: string
  subtitle: string
  selected: PanelColor
  onSelect: (c: PanelColor) => void
  visible: PanelColor[]
  showAll: boolean
  onToggleAll: () => void
  total: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <p className="text-xs text-muted-foreground mb-3">
        {subtitle}. Selected: <span className="font-medium">{selected.name}</span>
        <span className="text-muted-foreground"> · {selected.code}</span>
        {selected.finish && selected.finish !== "solid" && (
          <span className="ml-1 capitalize text-accent">· {selected.finish}</span>
        )}
      </p>
      <div className="grid grid-cols-6 gap-2">
        {visible.map(c => {
          const isSelected = c.code === selected.code
          const bgStyle: React.CSSProperties = c.finish === "metallic" || c.finish === "mirror"
            ? { background: `linear-gradient(135deg, ${c.hex}ee, ${c.hex}88, ${c.hex}dd)` }
            : c.finish === "wood"
            ? { background: `repeating-linear-gradient(90deg, ${c.hex} 0px, ${c.hex}cc 3px, ${c.hex}99 6px)` }
            : { background: c.hex }
          return (
            <button key={c.code} type="button" title={`${c.name} (${c.code})`}
              onClick={() => onSelect(c)}
              className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                ${isSelected ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}>
              <div className="w-full h-full" style={bgStyle} />
              <div className="absolute inset-0 flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <span className="text-[9px] text-white font-medium leading-tight px-0.5 text-center">{c.name}</span>
              </div>
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-sm drop-shadow">✓</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={onToggleAll}
        className="mt-3 text-xs text-accent font-medium hover:underline">
        {showAll ? `Show fewer ▴` : `Show all ${total} colors ▾`}
      </button>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-5 h-5 rounded border border-border flex-shrink-0" style={{ background: selected.hex }} />
        <span className="text-sm font-medium">{selected.name}</span>
        <span className="text-xs text-muted-foreground">{selected.code}</span>
      </div>
    </div>
  )
}

export default function NewOrderPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("photo")
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [quad, setQuad] = useState<QuadPoint[] | null>(null)
  const [sizeResult, setSizeResult] = useState<SizeResult | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [previewOptions, setPreviewOptions] = useState<string[]>([])
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState<number>(0)
  const [previewSkipped, setPreviewSkipped] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const previewDataUrl = previewOptions[selectedPreviewIdx] ?? null
  const [submitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Guest capture modal (shown instead of login when the user has no session)
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  const logoColorCacheRef = useRef<{ url: string; color: string } | null>(null)

  // Sign spec fields
  // ── Primary signage selector: reference style (webs/signs structure) ──
  const [referenceId, setReferenceId] = useState<string>(DEFAULT_REFERENCE.id)
  const [signMaterial, setSignMaterial] = useState<"acrylic" | "aluminum">("acrylic") // cheaper default
  const [fontStyle, setFontStyle] = useState<FontStyle>("modern-sans")
  const [businessName, setBusinessName] = useState("")
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  // Client-confirmed: does the uploaded logo already render the business name?
  // If so, we show logo-only (never duplicate the name on the sign).
  const [logoIncludesName, setLogoIncludesName] = useState(false)
  const [logoAnalysis, setLogoAnalysis] = useState<LogoAnalysis | null>(null)
  const [logoAnalyzing, setLogoAnalyzing] = useState(false)
  const [primaryColor, setPrimaryColor] = useState("#1C1C1C") // letter color
  const [secondaryColor, setSecondaryColor] = useState("")
  const [notes, setNotes] = useState("")
  // Free-form instructions appended to the AI preview prompt (advanced).
  const [customPrompt, setCustomPrompt] = useState("")
  // Job requirements (asked on the review step, before the job goes out for quotes)
  const [needsInstallation, setNeedsInstallation] = useState<boolean | null>(null)
  const [coiRequired, setCoiRequired] = useState<"yes" | "no" | "unsure" | null>(null)
  const [coiAmount, setCoiAmount] = useState<number | null>(null)
  // Awning-specific
  const [awningFrame, setAwningFrame] = useState<AwningFrameStyle>("waterfall")
  const [awningFabric, setAwningFabric] = useState<SunbrellaFabric>(DEFAULT_AWNING_FABRIC)
  const [awningIllumination, setAwningIllumination] = useState<IlluminationType>("none")
  // New tree structure
  const [signCategory, setSignCategory] = useState<"letters" | "light_box" | "awning" | null>(null)
  const [isLit, setIsLit] = useState<boolean | null>(null)
  const [lightingStyle, setLightingStyle] = useState<"front" | "back" | "back_side" | "front_back" | "front_side" | "full">("front")
  const [lightBoxType, setLightBoxType] = useState<"cabinet" | "seethrough_letters">("cabinet")
  const [isPerpendicular, setIsPerpendicular] = useState(false)
  const [lightBoxShape, setLightBoxShape] = useState<string>("rectangle")
  const [lightWarmth, setLightWarmth] = useState<number>(50)
  const [lightColorful, setLightColorful] = useState<boolean>(false)
  const [showAllColors, setShowAllColors] = useState(false)
  // Corner / wraparound sign
  const [isCorner, setIsCorner] = useState(false)
  // Dura-Bond ACP colors (aluminum / no-light style)
  const [panelFaceColor, setPanelFaceColor] = useState<PanelColor>(DEFAULT_PANEL_FACE_COLOR)
  const [panelBgColor, setPanelBgColor] = useState<PanelColor>(DEFAULT_PANEL_BG_COLOR)
  const [showAllPanelFace, setShowAllPanelFace] = useState(false)
  const [showAllPanelBg, setShowAllPanelBg] = useState(false)
  // Backer panel behind the letters (channel-letter styles). Default ON — most
  // storefront walls aren't an attractive backdrop on their own.
  const [hasBackground, setHasBackground] = useState(true)
  // Backer panel material — aluminum (Dura-Bond ACP) or acrylic. Each has its own palette.
  const [bgMaterial, setBgMaterial] = useState<"aluminum" | "acrylic">("aluminum")
  // Acrylic backer: finish (default opaque — a solid panel) + color filtered to it.
  const [bgAcrylicFinish, setBgAcrylicFinish] = useState<"translucent" | "opaque" | "transparent" | "matte">("opaque")
  const [bgAcrylicColor, setBgAcrylicColor] = useState<AcrylicColor>(
    ACRYLIC_COLORS.find(c => c.finish === "opaque" && c.code === "2447") ?? ACRYLIC_COLORS[0]
  )

  // When the backer finish changes, keep the selected color valid for that finish.
  function chooseBgAcrylicFinish(finish: "translucent" | "opaque" | "transparent" | "matte") {
    setBgAcrylicFinish(finish)
    if (bgAcrylicColor.finish !== finish) {
      const first = ACRYLIC_COLORS.find(c => c.finish === finish)
      if (first) setBgAcrylicColor(first)
    }
  }
  // Dura-Cast acrylic finish (client choice) + color
  const [acrylicFinish, setAcrylicFinish] = useState<"translucent" | "opaque" | "transparent" | "matte">("translucent")
  const [acrylicColor, setAcrylicColor] = useState<AcrylicColor>(DEFAULT_ACRYLIC_COLOR)

  // When the finish changes, keep the color valid for that finish.
  function chooseAcrylicFinish(finish: "translucent" | "opaque" | "transparent" | "matte") {
    setAcrylicFinish(finish)
    if (acrylicColor.finish !== finish) {
      const first = ACRYLIC_COLORS.find(c => c.finish === finish)
      if (first) setAcrylicColor(first)
    }
  }

  // ── Derived from the selected reference style ──
  const selectedReference = REFERENCE_STYLES.find(r => r.id === referenceId) ?? DEFAULT_REFERENCE
  const mapping = getSpecMapping(referenceId)
  const signType = mapping.signType
  const isAwning = referenceId === "awning"
  // Channel-letter styles (everything except the cabinet light-box and the awning)
  // can sit on a backer panel or mount directly to the wall.
  const isChannelLetter = !isAwning && referenceId !== "light-box"
  const lightingType = selectedReference.lightingType
  const illumination: IlluminationType = isAwning ? awningIllumination : mapping.illumination
  // Material is a CLIENT choice for every non-awning style (default = cheaper acrylic).
  const material: SignMaterial = isAwning ? "vinyl" : signMaterial
  const colorSystem: "durabond" | "acrylic" | "awning" =
    isAwning ? "awning" : signMaterial === "aluminum" ? "durabond" : "acrylic"

  const stepIdx = STEPS.indexOf(step)

  // logoIncludesName only matters when both a logo and a name are present — if the
  // logo art already spells out the business name, don't render the name a second time.
  const brandMode: "text-only" | "logo-only" | "logo-and-text" =
    logoDataUrl && businessName ? (logoIncludesName ? "logo-only" : "logo-and-text")
    : logoDataUrl               ? "logo-only"
    :                             "text-only"

  function extractDominantColor(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = document.createElement("img")
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve("#1C1C1C"); return }
        canvas.width = 100; canvas.height = 100
        ctx.drawImage(img, 0, 0, 100, 100)
        try {
          const { data } = ctx.getImageData(0, 0, 100, 100)
          const colorMap: Record<string, number> = {}
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!
            if (a < 128 || (r > 240 && g > 240 && b > 240)) continue
            const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`
            colorMap[key] = (colorMap[key] ?? 0) + 1
          }
          let maxCount = 0, dominant = "28,28,28"
          for (const [color, count] of Object.entries(colorMap)) {
            if (count > maxCount) { maxCount = count; dominant = color }
          }
          const [rr, gg, bb] = dominant.split(",").map(Number)
          resolve("#" + [rr, gg, bb].map((x) => (x ?? 0).toString(16).padStart(2, "0")).join(""))
        } catch { resolve("#1C1C1C") }
      }
      img.onerror = () => resolve("#1C1C1C")
      img.src = dataUrl
    })
  }

  // Derive the sign's styling from an uploaded logo:
  //  • sample the dominant color from the logo
  //  • if the nearest acrylic swatch is a close enough match → use acrylic with that color
  //  • otherwise → switch to aluminum (Dura-Bond) with the nearest panel color
  //    (never use both — one material only)
  //  • always force a background panel on so the user picks the backdrop color
  async function applyLogoStyling(logoUrl: string) {
    let color: string
    if (logoColorCacheRef.current?.url === logoUrl) {
      color = logoColorCacheRef.current.color
    } else {
      color = await extractDominantColor(logoUrl)
      logoColorCacheRef.current = { url: logoUrl, color }
    }
    setPrimaryColor(color)

    // Find the nearest acrylic across ALL finishes (not filtered to current finish).
    const bestAcrylic = nearestColor(color, ACRYLIC_COLORS)
    // Threshold: squared RGB distance ~150 per channel on average = 67500.
    // Below this the acrylic swatch is a credible brand-color match.
    const ACRYLIC_THRESHOLD = 20000
    if (colorDistance(color, bestAcrylic.hex) < ACRYLIC_THRESHOLD) {
      setSignMaterial("acrylic")
      setAcrylicFinish(bestAcrylic.finish)
      setAcrylicColor(bestAcrylic)
    } else {
      setSignMaterial("aluminum")
      setPanelFaceColor(nearestColor(color, DURABOND_COLORS))
    }

    // Always show a background panel when a logo is present — user must choose color.
    setHasBackground(true)
  }

  // Colors shown: always include the 12 common + the currently selected color (even if not common)
  const visibleColors = showAllColors
    ? SUNBRELLA_COLORS
    : SUNBRELLA_COLORS.filter(c => c.common || c.code === awningFabric.code)

  const visiblePanelFace = showAllPanelFace
    ? DURABOND_COLORS
    : DURABOND_COLORS.filter(c => c.common || c.code === panelFaceColor.code)

  const visiblePanelBg = showAllPanelBg
    ? DURABOND_COLORS
    : DURABOND_COLORS.filter(c => c.common || c.code === panelBgColor.code)

  // Colors are filtered to the chosen finish (client picks the finish first).
  const visibleAcrylic = ACRYLIC_COLORS.filter(c => c.finish === acrylicFinish)

  // Backer panel: acrylic colors filtered to the chosen backer finish.
  const bgAcrylicOptions = ACRYLIC_COLORS.filter(c => c.finish === bgAcrylicFinish)
  // Active background color (depends on the chosen panel material).
  const bgColor = bgMaterial === "acrylic" ? bgAcrylicColor : panelBgColor

  // The exact prompt we hand to the AI — assembled by the SAME builder the server
  // uses, so what the client previews here is what actually gets sent.
  const promptParams: SignPromptParams = {
    businessName,
    brandMode,
    hasLogo: !!logoDataUrl,
    referenceId,
    lightingType,
    fontStyle,
    letterColor: primaryColor,
    panelFace: colorSystem === "durabond" ? { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex } : null,
    panelBg: isChannelLetter && hasBackground
      ? (bgMaterial === "acrylic"
          ? { name: bgColor.name, code: bgColor.code, hex: bgColor.hex, finish: bgAcrylicColor.finish }
          : { name: bgColor.name, code: bgColor.code, hex: bgColor.hex })
      : null,
    hasBackground: isChannelLetter ? hasBackground : undefined,
    bgMaterial: isChannelLetter && hasBackground ? bgMaterial : undefined,
    acrylic: colorSystem === "acrylic" ? { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish } : null,
    awningFrame: isAwning ? awningFrame : undefined,
    fabricName: isAwning ? `${awningFabric.name} (Sunbrella ${awningFabric.code})` : undefined,
    awningIllumination: isAwning ? awningIllumination : undefined,
    isCorner,
    foldXPct: isCorner && quad && quad.length === 6 ? ((quad[1].x + quad[4].x) / 2) * 100 : undefined,
    customPrompt: customPrompt.trim() || undefined,
  }
  const assembledPrompt = buildSignPrompt(promptParams)

  async function runEstimate(q: QuadPoint[]) {
    if (!photoDataUrl) return
    setEstimating(true)
    setEstimateError(null)
    setSizeResult(null)
    try {
      const res = await fetch("/api/order/estimate-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: photoDataUrl, quad: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Estimation failed")
      setSizeResult(data)
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : "Estimation failed")
    } finally {
      setEstimating(false)
    }
  }

  async function handleGuestSubmit() {
    const name = guestName.trim()
    const phone = guestPhone.trim()
    if (!name) { setGuestError("Please enter your name."); return }
    if (!phone) { setGuestError("Please enter your phone number."); return }
    setGuestSubmitting(true)
    setGuestError(null)
    try {
      const sb = createBrowserClient()
      const { error: signInErr } = await sb.auth.signInAnonymously()
      if (signInErr) throw signInErr
      await sb.auth.updateUser({ data: { full_name: name, phone, role: "client" } })
      const res = await saveGuestProfile(name, phone, guestEmail.trim())
      if (res?.error) throw new Error(res.error)
      setShowGuestModal(false)
      runPreview()
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : "Could not proceed. Try again.")
    } finally {
      setGuestSubmitting(false)
    }
  }

  async function runPreview() {
    if (!photoDataUrl || !quad) return

    // Show the guest capture modal instead of hitting the 401 wall
    const { data: { user } } = await createBrowserClient().auth.getUser()
    if (!user) { setShowGuestModal(true); return }

    setGenerating(true)
    setGenerateError(null)
    setPreviewOptions([])
    setSelectedPreviewIdx(0)
    setPreviewSkipped(false)

    // Reuse the exact same params that build the on-screen prompt preview, so what
    // the client sees is byte-for-byte what the server sends to the AI.
    const payload = {
      imageDataUrl: photoDataUrl, quad,
      logoDataUrl: logoDataUrl ?? undefined,
      ...promptParams,
      count: 3,
    }

    try {
      // 1) Kick off an async job (returns fast — no serverless timeout).
      const startRes = await fetch("/api/order/preview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const startData = await startRes.json().catch(() => ({})) as { jobId?: string; error?: string }
      if (startRes.status === 401) {
        setGenerating(false)
        setShowGuestModal(true)
        return
      }
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error ?? `Could not start preview (${startRes.status})`)
      }

      // 2) Poll for completion (worker generates + uploads, then we get URLs).
      const jobId = startData.jobId
      const deadline = Date.now() + 5 * 60 * 1000 // 5 min — covers 3 sequential Gemini calls
      let consecutiveNetworkErrors = 0
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 4000))
        const sRes = await fetch(`/api/order/preview/status?jobId=${jobId}`)
        if (!sRes.ok) {
          consecutiveNetworkErrors++
          if (consecutiveNetworkErrors >= 5) throw new Error("Lost connection to server. Please try again.")
          continue
        }
        consecutiveNetworkErrors = 0
        const sData = await sRes.json().catch(() => ({})) as { status?: string; previewUrls?: string[]; error?: string }
        if (sData.status === "done") {
          const urls = sData.previewUrls ?? []
          if (urls.length === 0) throw new Error("No previews were generated. Please try again.")
          setPreviewOptions(urls)
          return
        }
        if (sData.status === "error") {
          throw new Error(sData.error ?? "Preview generation failed.")
        }
        // status === "pending" | "processing" — keep polling
      }
      throw new Error("Preview is taking too long. Please try again.")
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Preview generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const hasBrandInput = !!(businessName || logoDataUrl)

  function goTo(s: Step) {
    if (s === "quad" && !photoDataUrl) return
    if (s === "customize" && !quad) return
    if (s === "preview" && !hasBrandInput) return
    setStep(s)
  }

  // Installation choice is required; if the SC installs and insurance is required,
  // a coverage amount must be set before the job can go out for quotes.
  const requirementsComplete =
    needsInstallation !== null &&
    !(needsInstallation === true && coiRequired === "yes" && coiAmount == null)

  function handleSubmit() {
    if (!photoDataUrl || !quad || !sizeResult || !hasBrandInput || !requirementsComplete) return
    setSubmitError(null)

    const signSpec: SignSpec = {
      sign_type: signType,
      width_inches: sizeResult.widthInches,
      height_inches: sizeResult.heightInches,
      width_confidence: sizeResult.confidence,
      business_name: businessName,
      primary_color: isAwning ? awningFabric.hex : primaryColor,
      secondary_color: isAwning ? null : (secondaryColor || null),
      material,
      illumination,
      custom_notes: notes || null,
      estimation_references: sizeResult.referencesUsed,
      estimation_angle_warning: sizeResult.angleWarning,
      selection_quad: quad as SignSpec["selection_quad"],
      // reference style the client picked (webs/signs structure)
      reference_style: referenceId,
      ...(isCorner && {
        is_corner: true,
        front_width_inches: sizeResult.frontWidthInches,
        side_width_inches: sizeResult.sideWidthInches,
      }),
      ...(isAwning && {
        awning_frame_style: awningFrame,
        awning_fabric: awningFabric,
      }),
      brand_mode: brandMode,
      ...(logoDataUrl && businessName && { logo_includes_name: logoIncludesName }),
      ...(logoAnalysis && { logo_analysis: logoAnalysis }),
      ...(!isAwning && { font_style: fontStyle }),
      ...(isChannelLetter && {
        has_background: hasBackground,
        ...(hasBackground && {
          bg_material: bgMaterial,
          panel_bg_color: {
            name: bgColor.name, code: bgColor.code, hex: bgColor.hex,
            ...(bgMaterial === "acrylic" && { finish: bgAcrylicColor.finish }),
          },
        }),
      }),
      ...(colorSystem === "durabond" && {
        panel_face_color: { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex },
        channel_lighting: { type: lightingType },
      }),
      ...(colorSystem === "acrylic" && {
        acrylic_color:    { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish },
        channel_lighting: { type: lightingType },
      }),
      // Job requirements (installation + insurance)
      ...(needsInstallation !== null && { needs_installation: needsInstallation }),
      ...(needsInstallation === true && coiRequired && {
        coi_required: coiRequired === "yes" ? true : coiRequired === "no" ? false : null,
        ...(coiRequired === "yes" && coiAmount != null && { coi_amount: coiAmount }),
      }),
      // New tree structure
      sign_category: signCategory || undefined,
      ...(signCategory === "letters" && {
        is_lit: isLit,
        lighting_style: lightingStyle,
        light_warmth: lightWarmth,
        light_colorful: lightColorful,
      }),
      ...(signCategory === "light_box" && {
        light_box_type: lightBoxType,
        light_box_shape: lightBoxShape,
        is_perpendicular: isPerpendicular,
      }),
    }

    startSubmit(async () => {
      const result = await createOrder({ photoDataUrl, previewDataUrl, logoDataUrl, signSpec })
      if ("error" in result) {
        setSubmitError(result.error)
      } else {
        router.push(`/order/${result.orderId}?submitted=1`)
      }
    })
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const done = i < stepIdx
          const active = s === step
          return (
            <div key={s} className="flex items-center gap-1">
              <button
                onClick={() => goTo(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${active ? "bg-foreground text-background" : done ? "bg-accent/20 text-accent hover:bg-accent/30" : "text-muted-foreground cursor-default"}`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px]
                  ${active ? "bg-background text-foreground" : done ? "bg-accent text-white" : "bg-muted"}`}>
                  {done ? "✓" : i + 1}
                </span>
                {STEP_LABELS[s]}
              </button>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Photo ── */}
      {step === "photo" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Upload your storefront photo</h1>
            <p className="text-muted-foreground mt-1">We use this to estimate your sign size and generate an AI preview.</p>
          </div>
          <PhotoUpload onPhoto={(url) => { setPhotoDataUrl(url); setQuad(null); setSizeResult(null); setPreviewOptions([]); setLogoDataUrl(null) }} />
          {photoDataUrl && (
            <button
              onClick={() => setStep("quad")}
              className="w-full bg-accent text-accent-foreground rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity"
            >
              Continue → Mark Sign Area
            </button>
          )}
        </div>
      )}

      {/* ── Step 2: Quad selection + size estimate ── */}
      {step === "quad" && photoDataUrl && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Mark where your sign will go</h1>
            <p className="text-muted-foreground mt-1">Drag the corners to outline the sign area precisely.</p>
          </div>
          {/* Corner toggle */}
          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={isCorner}
              onChange={e => {
                setIsCorner(e.target.checked)
                setQuad(null)
                setSizeResult(null)
              }}
              className="w-4 h-4 accent-accent"
            />
            <div>
              <p className="text-sm font-medium leading-tight">Corner sign (wraps two walls)</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Use this if your sign bends around the building corner, covering both the front and side face.</p>
            </div>
          </label>

          <QuadSelector
            imageDataUrl={photoDataUrl}
            corner={isCorner}
            onChange={(q) => {
              setQuad(q)
              setSizeResult(null)
            }}
          />

          {quad && !sizeResult && !estimating && (
            <button
              onClick={() => runEstimate(quad)}
              className="w-full border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Estimate Size with AI
            </button>
          )}

          {estimating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="animate-spin">⟳</span> Analyzing photo…
            </div>
          )}

          {estimateError && (
            <p className="text-sm text-red-600">{estimateError}</p>
          )}

          {sizeResult && (
            <div className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  {sizeResult.isCorner && sizeResult.frontWidthInches && sizeResult.sideWidthInches ? (
                    <>
                      <p className="font-semibold text-lg leading-tight">
                        Front {formatDimensions(sizeResult.frontWidthInches, sizeResult.heightInches)}
                      </p>
                      <p className="font-semibold text-lg leading-tight">
                        Side {formatDimensions(sizeResult.sideWidthInches, sizeResult.heightInches)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Total developed: {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold text-lg">
                      {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {sizeResult.referencesUsed.length > 0
                      ? `Based on: ${sizeResult.referencesUsed.join(", ")}`
                      : "No clear reference found — estimate may be approximate"}
                  </p>
                </div>
                <ConfidenceBadge confidence={sizeResult.confidence} />
              </div>
              {sizeResult.angleWarning && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  ⚠️ Photo appears angled. For better accuracy, retake straight-on.
                </p>
              )}
              <button
                onClick={() => { runEstimate(quad!) }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Re-estimate
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep("photo")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={() => setStep("customize")}
              disabled={!quad}
              className="flex-2 flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue → Sign Details
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Sign customizer ── */}
      {step === "customize" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Sign Details</h1>
            <p className="text-muted-foreground mt-1">Tell sign companies what you need.</p>
          </div>

          <div className="space-y-5">
            {/* Logo upload */}
            <div>
              <label className="block text-sm font-medium mb-1">Logo <span className="text-muted-foreground font-normal">(optional)</span></label>
              <p className="text-xs text-muted-foreground mb-2">PNG with transparent background works best. When uploaded, colors are extracted automatically.</p>
              {logoDataUrl ? (
                <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoDataUrl} alt="Logo" className="h-10 w-auto object-contain rounded" />
                  <span className="flex-1 text-sm text-foreground font-medium">Logo uploaded</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDataUrl(null)
                      setLogoIncludesName(false)
                      setLogoAnalysis(null)
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg px-4 py-3 cursor-pointer hover:border-accent/50 transition-colors">
                  <span className="text-2xl">🖼️</span>
                  <div>
                    <p className="text-sm font-medium">Upload your logo</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, SVG</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async e => {
                      const file = e.currentTarget.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = async (ev) => {
                        const url = ev.target?.result as string
                        setLogoDataUrl(url)
                        setLogoAnalyzing(true)
                        await Promise.all([
                          applyLogoStyling(url),
                          analyzeLogoComplexity(url).then(setLogoAnalysis).catch(() => setLogoAnalysis(null)),
                        ])
                        setLogoAnalyzing(false)
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">AND / OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Business name on the sign {!logoDataUrl && <span className="text-destructive">*</span>}</label>
              <input
                value={businessName}
                onChange={async e => {
                  setBusinessName(e.target.value)
                  if (e.target.value && logoDataUrl) {
                    const color = logoColorCacheRef.current?.url === logoDataUrl
                      ? logoColorCacheRef.current.color
                      : await extractDominantColor(logoDataUrl)
                    setPrimaryColor(color)
                  }
                }}
                placeholder="e.g. Joe's Pizza"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Only relevant when both a logo and a name exist — does the logo already spell out the name? */}
            {logoDataUrl && businessName && (
              <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={logoIncludesName}
                  onChange={e => setLogoIncludesName(e.target.checked)}
                  className="w-4 h-4 accent-accent mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium leading-tight">My logo already includes my business name</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {logoIncludesName
                      ? "We'll render the logo only — no separate name on the sign."
                      : "We'll render your name next to the logo. Check this if your logo art already spells it out."}
                  </p>
                </div>
              </label>
            )}

            {/* ── MAIN: What kind of sign? ── */}
            <div>
              <label className="block text-sm font-medium mb-2">What kind of sign? *</label>
              <div className="grid grid-cols-3 gap-2">
                <PictureChoice
                  imageSrc="/examples/sign-type/letters.jpg"
                  label="Letters"
                  description="Channel letters or flat-cut dimensional signage"
                  selected={signCategory === "letters"}
                  onClick={() => { setSignCategory("letters"); setIsLit(null) }}
                />
                <PictureChoice
                  imageSrc="/examples/sign-type/light-box.jpg"
                  label="Light Box"
                  description="Backlit cabinet or see-through letters"
                  selected={signCategory === "light_box"}
                  onClick={() => setSignCategory("light_box")}
                />
                <PictureChoice
                  imageSrc="/examples/sign-type/awning.jpg"
                  label="Awning"
                  description="Printed or lit fabric awning"
                  selected={signCategory === "awning"}
                  onClick={() => { setSignCategory("awning"); setAwningIllumination("none") }}
                />
              </div>
            </div>

            {/* ── LETTERS ── */}
            {signCategory === "letters" && (
              <>
                {/* Fabrication feasibility hint — logo may be too complex to cut as channel letters */}
                {logoDataUrl && logoAnalysis && !logoAnalysis.letters_feasible && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-medium leading-tight">Your logo may be too detailed for channel letters</p>
                    <p className="text-xs leading-snug mt-1">
                      It looks like it has {logoAnalysis.distinct_colors}+ colors or fine detail, which can&apos;t be cut from flat acrylic.
                      Consider switching to <span className="font-medium">Light Box</span> — it prints your logo exactly as-is.
                    </p>
                  </div>
                )}

                {/* Background toggle */}
                <div>
                  <label className="block text-sm font-medium mb-2">Background panel</label>
                  <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <input type="checkbox" checked={hasBackground} onChange={e => setHasBackground(e.target.checked)} className="w-4 h-4 accent-accent mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-tight">{hasBackground ? "With background panel" : "Letters only (no background)"}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{hasBackground ? "Letters on a finished backer panel" : "Letters mounted directly on the wall"}</p>
                      <div className="mt-2 w-32 rounded-lg overflow-hidden bg-muted aspect-square relative">
                        <img
                          src={hasBackground ? "/examples/background/with-panel.jpg" : "/examples/background/letters-only.jpg"}
                          alt={hasBackground ? "Letters with background panel" : "Letters only, no background"}
                          className="w-full h-full object-cover"
                          onError={e => { const img = e.currentTarget; img.style.display = "none"; const ph = img.nextElementSibling as HTMLElement | null; if (ph) ph.style.display = "flex" }}
                        />
                        <div className="hidden absolute inset-0 items-center justify-center bg-muted" aria-hidden="true">
                          <span className="text-3xl text-muted-foreground/25">📷</span>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Background colors (right after toggle, when has_background) */}
                {hasBackground && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Background color</label>
                    <div className="grid grid-cols-6 gap-2 mb-3">
                      {[
                        DURABOND_COLORS.find(c => c.code === "DB-03"),
                        DURABOND_COLORS.find(c => c.code === "DB-35"),
                        DURABOND_COLORS.find(c => c.code === "DB-13"),
                      ].filter(Boolean).map(c => (
                        <button
                          key={c!.code}
                          type="button"
                          onClick={() => setPanelBgColor(c!)}
                          className={`aspect-square rounded-lg border-2 transition-all ${
                            panelBgColor.code === c!.code ? "border-accent scale-105" : "border-border"
                          }`}
                          style={{ background: c!.hex }}
                          title={c!.name}
                        />
                      ))}
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-accent">Show all aluminum colors</summary>
                      <div className="grid grid-cols-6 gap-2 mt-2">
                        {DURABOND_COLORS.map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => setPanelBgColor(c)}
                            className={`aspect-square rounded-lg border-2 transition-all ${
                              panelBgColor.code === c.code ? "border-accent scale-105" : "border-border"
                            }`}
                            style={{ background: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {/* Lighting choice */}
                <div>
                  <label className="block text-sm font-medium mb-2">Will your sign be lit at night? *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsLit(true)}
                      className={`text-left rounded-lg border-2 p-3 transition-all ${
                        isLit === true ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold">Yes, with lighting</span>
                      <span className="block text-[11px] text-muted-foreground mt-1">Glows at night for visibility and branding</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLit(false)}
                      className={`text-left rounded-lg border-2 p-3 transition-all ${
                        isLit === false ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold">No lighting</span>
                      <span className="block text-[11px] text-muted-foreground mt-1">Daytime only or floodlit</span>
                    </button>
                  </div>
                </div>

                {/* Lighting style (if lit) */}
                {isLit === true && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">How should it be lit?</label>
                      <p className="text-xs text-muted-foreground mb-3">Choose the lighting direction and style.</p>
                      <div className={`grid gap-2 ${hasBackground ? "grid-cols-3" : "grid-cols-2"}`}>
                        {!hasBackground ? (
                          <>
                            <PictureChoice imageSrc="/examples/letters-lighting-nobg/front.jpg" label="Front" description="Light on the face" selected={lightingStyle === "front"} onClick={() => setLightingStyle("front")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-nobg/back.jpg" label="Back" description="Halo glow behind" selected={lightingStyle === "back"} onClick={() => setLightingStyle("back")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-nobg/front_back.jpg" label="Front + Back" description="Light both ways" selected={lightingStyle === "front_back"} onClick={() => setLightingStyle("front_back")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-nobg/full.jpg" label="Full surround" description="All-around glow" selected={lightingStyle === "full"} onClick={() => setLightingStyle("full")} />
                          </>
                        ) : (
                          <>
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/front.jpg" label="Front" description="Lit face only" selected={lightingStyle === "front"} onClick={() => setLightingStyle("front")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/back.jpg" label="Back" description="Panel glow" selected={lightingStyle === "back"} onClick={() => setLightingStyle("back")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/back_side.jpg" label="Back + Side" description="Back & side light" selected={lightingStyle === "back_side"} onClick={() => setLightingStyle("back_side")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/front_back.jpg" label="Front + Back" description="Both directions" selected={lightingStyle === "front_back"} onClick={() => setLightingStyle("front_back")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/front_side.jpg" label="Front + Side" description="Face & side glow" selected={lightingStyle === "front_side"} onClick={() => setLightingStyle("front_side")} />
                            <PictureChoice imageSrc="/examples/letters-lighting-bg/full.jpg" label="Full light" description="All-around" selected={lightingStyle === "full"} onClick={() => setLightingStyle("full")} />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Letter color (full acrylic palette) */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Letter color</label>
                      <div className="grid grid-cols-6 gap-2">
                        {ACRYLIC_COLORS.map(c => (
                          <button
                            key={`${c.code}-${c.finish}`}
                            type="button"
                            title={`${c.name} #${c.code}`}
                            onClick={() => { setAcrylicColor(c); setPrimaryColor(c.hex) }}
                            className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                              ${primaryColor === c.hex ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                          >
                            <div className="w-full h-full" style={{ background: c.hex, opacity: c.finish === "translucent" ? 0.75 : c.finish === "transparent" ? 0.55 : 1 }} />
                            {primaryColor === c.hex && <div className="absolute inset-0 flex items-center justify-center"><span className="text-white text-sm drop-shadow">✓</span></div>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Advanced: warmth + colorful */}
                    <details className="border border-border rounded-xl overflow-hidden group">
                      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
                        <span>Advanced lighting settings</span>
                        <span className="text-xs text-muted-foreground group-open:hidden">show</span>
                        <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">Light warmth</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={lightWarmth}
                            onChange={e => setLightWarmth(parseInt(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>Cool</span>
                            <span>Neutral</span>
                            <span>Warm</span>
                          </div>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={lightColorful}
                            onChange={e => setLightColorful(e.target.checked)}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-sm font-medium">Multicolor RGB LED (programmable colors)</span>
                        </label>
                      </div>
                    </details>
                  </>
                )}

                {/* Letter color (aluminum only, if no light) */}
                {isLit === false && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Letter color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {DURABOND_COLORS.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          title={c.name}
                          onClick={() => { setPanelFaceColor(c); setPrimaryColor(c.hex) }}
                          className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                            ${primaryColor === c.hex ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                        >
                          <div className="w-full h-full" style={{ background: c.hex }} />
                          {primaryColor === c.hex && <div className="absolute inset-0 flex items-center justify-center"><span className="text-white text-sm drop-shadow">✓</span></div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}

            {/* ── LIGHT BOX ── */}
            {signCategory === "light_box" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Style</label>
                  <div className="grid grid-cols-2 gap-3">
                    <PictureChoice
                      imageSrc="/examples/lightbox-type/cabinet.jpg"
                      label="Cabinet"
                      description="Backlit box with cutout letters"
                      selected={lightBoxType === "cabinet"}
                      onClick={() => setLightBoxType("cabinet")}
                      recommended
                    />
                    <PictureChoice
                      imageSrc="/examples/lightbox-type/seethrough.jpg"
                      label="See-through letters"
                      description="Transparent letters on a lit panel"
                      selected={lightBoxType === "seethrough_letters"}
                      onClick={() => setLightBoxType("seethrough_letters")}
                    />
                  </div>
                </div>

                {/* Perpendicular (blade) mounting toggle */}
                <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={isPerpendicular}
                    onChange={e => setIsPerpendicular(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium leading-tight">Wall-mounted perpendicular (blade sign)</p>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">Sign sticks out from the wall instead of sitting flush against it.</p>
                    <div className="mt-2 w-32 rounded-lg overflow-hidden bg-muted aspect-square relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/examples/lightbox-mount/perpendicular.jpg"
                        alt="Perpendicular blade sign example"
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.style.display = "none"
                          const ph = e.currentTarget.nextElementSibling as HTMLElement | null
                          if (ph) ph.style.display = "flex"
                        }}
                      />
                      <div className="hidden absolute inset-0 items-center justify-center">
                        <span className="text-3xl text-muted-foreground/25">📷</span>
                      </div>
                    </div>
                  </div>
                </label>

                <details className="border border-border rounded-xl overflow-hidden group">
                  <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
                    <span>Advanced settings</span>
                    <span className="text-xs text-muted-foreground group-open:hidden">show</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-2">Shape (optional)</label>
                      <div className="grid grid-cols-5 gap-2">
                        {["rectangle", "circle", "oval", "rounded", "logo"].map(shape => (
                          <PictureChoice
                            key={shape}
                            imageSrc={`/examples/lightbox-shape/${shape}.jpg`}
                            label={shape === "logo" ? "Your logo" : shape.charAt(0).toUpperCase() + shape.slice(1)}
                            selected={lightBoxShape === shape}
                            onClick={() => setLightBoxShape(shape)}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <div className="grid grid-cols-6 gap-2">
                    {(lightBoxType === "cabinet" ? ACRYLIC_COLORS : DURABOND_COLORS).map(c => (
                      <button
                        key={("code" in c) ? c.code : ""}
                        type="button"
                        onClick={() => setPrimaryColor(c.hex)}
                        className={`aspect-square rounded-lg border-2 transition-all ${
                          primaryColor === c.hex ? "border-accent scale-105" : "border-transparent hover:border-border"
                        }`}
                        style={{ background: c.hex, opacity: ("finish" in c && c.finish === "translucent") ? 0.75 : 1 }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── AWNING ── */}
            {signCategory === "awning" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Will it be lit at night?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <PictureChoice
                      imageSrc="/examples/awning-lighting/night.jpg"
                      label="With lighting"
                      description="Glows at night"
                      selected={awningIllumination === "internal_led"}
                      onClick={() => setAwningIllumination("internal_led")}
                      recommended
                    />
                    <PictureChoice
                      imageSrc="/examples/awning-lighting/day.jpg"
                      label="No light"
                      description="Daytime only"
                      selected={awningIllumination === "none"}
                      onClick={() => setAwningIllumination("none")}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Fabric color (Sunbrella)</label>
                  <div className="grid grid-cols-6 gap-2">
                    {SUNBRELLA_COLORS.filter(c => c.common).map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setAwningFabric(c)}
                        className={`aspect-square rounded-lg border-2 transition-all ${
                          awningFabric.code === c.code ? "border-accent scale-105" : "border-transparent hover:border-border"
                        }`}
                        style={{ background: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <details className="border border-border rounded-xl overflow-hidden group">
                  <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
                    <span>Frame style (advanced)</span>
                    <span className="text-xs text-muted-foreground group-open:hidden">show</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-3 gap-2">
                      {AWNING_FRAMES.map(f => (
                        <PictureChoice
                          key={f.value}
                          imageSrc={`/examples/awning-frames/${f.value}.jpg`}
                          label={f.label}
                          selected={awningFrame === f.value}
                          onClick={() => setAwningFrame(f.value)}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                </details>
              </>
            )}

            {/* Notes (always visible) */}
            <div>
              <label className="block text-sm font-medium mb-2">Additional notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Special requirements, preferences…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            {/* Advanced AI settings — extra instructions fed straight to the preview generator */}
            <details className="border border-border rounded-xl overflow-hidden group">
              <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
                <span>Advanced AI settings</span>
                <span className="text-xs text-muted-foreground group-open:hidden">show</span>
                <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
              </summary>
              <div className="px-4 pb-4 space-y-2">
                <label className="block text-sm font-medium">Extra instructions for the AI preview</label>
                <p className="text-xs text-muted-foreground">
                  Added directly to the AI prompt. Use it to steer the render — e.g. keep the logo untouched, a mounting detail, or a background note.
                </p>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. Keep the logo exactly as uploaded — do not redraw or recolor it."
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-muted-foreground">Full prompt sent to the AI</label>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(assembledPrompt)}
                      className="text-xs text-accent font-medium hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                    {assembledPrompt}
                  </pre>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Live preview — updates as you change options above. Your extra instructions are appended at the end.
                  </p>
                </div>
              </div>
            </details>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("quad")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={() => { setStep("preview"); runPreview() }}
              disabled={!businessName || !signCategory || (signCategory === "letters" && isLit === null)}
              className="flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue → AI Preview
            </button>
          </div>
        </div>
      )}
      {step === "preview" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">AI Sign Preview</h1>
            <p className="text-muted-foreground mt-1">See how your sign could look on your building.</p>
          </div>

          {sizeResult && (
            <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-lg">📐</span>
                <div>
                  {sizeResult.isCorner && sizeResult.frontWidthInches && sizeResult.sideWidthInches ? (
                    <>
                      <p className="font-semibold leading-tight text-sm">
                        Front {formatDimensions(sizeResult.frontWidthInches, sizeResult.heightInches)} · Side {formatDimensions(sizeResult.sideWidthInches, sizeResult.heightInches)}
                      </p>
                      <p className="text-xs text-muted-foreground leading-tight">
                        Corner sign · total developed {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold leading-tight">
                        {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                      </p>
                      <p className="text-xs text-muted-foreground leading-tight">
                        Estimated sign size · {sizeResult.widthInches}″ W × {sizeResult.heightInches}″ H
                      </p>
                    </>
                  )}
                </div>
              </div>
              <ConfidenceBadge confidence={sizeResult.confidence} />
            </div>
          )}

          {generating && (
            <div className="border border-border rounded-xl p-12 text-center space-y-3">
              <div className="text-4xl animate-pulse">🎨</div>
              <p className="font-medium">Generating preview…</p>
              <p className="text-sm text-muted-foreground">Generating 3 options — this takes about 60 seconds.</p>
            </div>
          )}

          {!generating && previewSkipped && (
            <div className="border border-border rounded-xl p-8 text-center space-y-3">
              <div className="text-4xl">📋</div>
              <p className="font-medium">Preview not available</p>
              <p className="text-sm text-muted-foreground">
                We couldn't generate a preview for this order. Your order will still receive competitive quotes from sign companies.
              </p>
            </div>
          )}

          {!generating && generateError && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-5 space-y-3">
              <p className="text-sm font-medium text-red-700">Preview generation failed</p>
              <p className="text-sm text-red-600">{generateError}</p>
              <button onClick={runPreview} className="text-sm text-accent font-medium hover:underline">
                Try again
              </button>
            </div>
          )}

          {!generating && previewOptions.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Choose an option:</p>
              <div className="grid grid-cols-1 gap-3">
                {previewOptions.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPreviewIdx(i)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-colors text-left ${
                      selectedPreviewIdx === i
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Option ${i + 1}`} className="w-full" />
                    <div className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedPreviewIdx === i
                        ? "bg-accent text-accent-foreground"
                        : "bg-black/50 text-white"
                    }`}>
                      {i + 1}
                    </div>
                    {selectedPreviewIdx === i && (
                      <div className="absolute top-2 right-2 bg-accent text-accent-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                        Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  AI-generated previews. Actual result will vary — your sign company measures on-site.
                </p>
                <button
                  onClick={runPreview}
                  className="text-xs text-accent font-medium hover:underline flex-shrink-0 ml-2"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}

          {!generating && (
            <div className="flex gap-3">
              <button onClick={() => setStep("customize")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
                ← Back
              </button>
              <button
                onClick={() => setStep("review")}
                className="flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Continue → Review & Submit
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Review & Submit ── */}
      {step === "review" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Review & Submit</h1>
            <p className="text-muted-foreground mt-1">Your order will be sent to sign companies for quotes.</p>
          </div>

          {/* ── Installation ── */}
          <div>
            <label className="block text-sm font-medium mb-2">Do you need installation? *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNeedsInstallation(true)}
                className={`text-left rounded-lg border-2 p-3 transition-all ${
                  needsInstallation === true ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                }`}
              >
                <span className="block text-sm font-semibold">Install it for me</span>
                <span className="block text-[11px] text-muted-foreground mt-1">The sign company fabricates and mounts it on your building.</span>
              </button>
              <button
                type="button"
                onClick={() => { setNeedsInstallation(false); setCoiRequired(null); setCoiAmount(null) }}
                className={`text-left rounded-lg border-2 p-3 transition-all ${
                  needsInstallation === false ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                }`}
              >
                <span className="block text-sm font-semibold">I&apos;ll install it myself</span>
                <span className="block text-[11px] text-muted-foreground mt-1">The sign company fabricates and ships it; you handle mounting.</span>
              </button>
            </div>

            {/* Soft, non-blocking nudge for self-install */}
            {needsInstallation === false && (
              <p className="mt-2 text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
                Heads up — many landlords require proof of insurance even for tenant-arranged installs. Check your lease; if so, we can install it for you instead.
              </p>
            )}
          </div>

          {/* ── Insurance (only when the SC installs) ── */}
          {needsInstallation === true && (
            <div>
              <label className="block text-sm font-medium mb-2">Does your building require the installer to be insured?</label>
              <p className="text-xs text-muted-foreground mb-2">Many commercial landlords require a Certificate of Insurance (COI) from whoever installs the sign.</p>
              <div className="grid grid-cols-3 gap-3">
                {([["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setCoiRequired(val); if (val !== "yes") setCoiAmount(null) }}
                    className={`rounded-lg border-2 p-2.5 text-sm font-medium transition-all ${
                      coiRequired === val ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {coiRequired === "unsure" && (
                <p className="mt-2 text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
                  No problem — the sign company can confirm the requirement with you before work begins.
                </p>
              )}

              {coiRequired === "yes" && (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2">Required coverage amount</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1_000_000, 2_000_000, 5_000_000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCoiAmount(amt)}
                        className={`rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                          coiAmount === amt ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                        }`}
                      >
                        ${amt / 1_000_000}M
                      </button>
                    ))}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Custom $"
                      value={coiAmount != null && ![1_000_000, 2_000_000, 5_000_000].includes(coiAmount) ? coiAmount : ""}
                      onChange={e => setCoiAmount(e.target.value ? parseInt(e.target.value) : null)}
                      className="rounded-lg border-2 border-border px-2 text-sm focus:outline-none focus:border-accent/40 min-w-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border border-border rounded-xl divide-y divide-border">
            <Row label="Business name" value={businessName} />
            <Row label="Sign style" value={
              <span className="flex items-center gap-1.5">
                {selectedReference.name}
                {isCorner && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">corner</span>}
              </span>
            } />
            {sizeResult ? (
              sizeResult.isCorner && sizeResult.frontWidthInches && sizeResult.sideWidthInches ? (
                <>
                  <Row label="Front face" value={formatDimensions(sizeResult.frontWidthInches, sizeResult.heightInches)} />
                  <Row label="Side face" value={formatDimensions(sizeResult.sideWidthInches, sizeResult.heightInches)} />
                  <Row label="Total developed" value={formatDimensions(sizeResult.widthInches, sizeResult.heightInches)} />
                </>
              ) : (
                <Row label="Estimated size" value={formatDimensions(sizeResult.widthInches, sizeResult.heightInches)} />
              )
            ) : (
              <Row label="Estimated size" value="Not estimated — go back to Mark Sign Area" />
            )}
            {isAwning ? (
              <>
                <Row label="Frame style" value={AWNING_FRAMES.find(f => f.value === awningFrame)?.label ?? awningFrame} />
                <Row label="Sunbrella® fabric" value={
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded border border-border inline-block flex-shrink-0" style={{ background: awningFabric.hex }} />
                    {awningFabric.name} #{awningFabric.code}
                  </span>
                } />
                <Row label="Lighting" value={AWNING_LIGHTING.find(o => o.value === awningIllumination)?.label ?? awningIllumination} />
              </>
            ) : (
              <>
                {businessName.trim() && (
                  <Row label="Font" value={FONT_OPTIONS.find(f => f.id === fontStyle)?.name ?? fontStyle} />
                )}
                <Row label="Material" value={SIGN_MATERIALS.find(m => m.value === signMaterial)?.label ?? signMaterial} />
                {colorSystem === "durabond" && (
                  <Row label="Letter face" value={
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: panelFaceColor.hex }} />
                      {panelFaceColor.name}
                    </span>
                  } />
                )}
                {colorSystem === "acrylic" && (
                  <Row label="Acrylic face" value={
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: acrylicColor.hex }} />
                      {acrylicColor.name} #{acrylicColor.code}
                      <span className="text-xs text-accent capitalize">{acrylicColor.finish}</span>
                    </span>
                  } />
                )}
                {isChannelLetter && (
                  <Row label="Background" value={
                    hasBackground ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: bgColor.hex }} />
                        {bgColor.name} · {bgMaterial === "acrylic" ? `acrylic (${bgAcrylicColor.finish})` : "aluminum"} panel
                      </span>
                    ) : "Letters only (no panel)"
                  } />
                )}
                <Row label="Lighting" value={
                  referenceId === "no-light-outdoor" ? "No illumination"
                  : selectedReference.lightingType === "front" ? "Front-lit"
                  : selectedReference.lightingType === "back" ? "Back-lit halo"
                  : "Front + back lit"
                } />
              </>
            )}
            {notes && <Row label="Notes" value={notes} />}
            {needsInstallation !== null && (
              <Row label="Installation" value={needsInstallation ? "Sign company installs" : "Self-install (fabricate only)"} />
            )}
            {needsInstallation === true && coiRequired && (
              <Row label="Installer insurance" value={
                coiRequired === "yes" ? (coiAmount ? `Required · $${(coiAmount / 1_000_000).toLocaleString()}M coverage` : "Required")
                : coiRequired === "no" ? "Not required"
                : "Client unsure — SC to confirm"
              } />
            )}
            <Row label="AI preview" value={previewDataUrl ? "Included ✓" : previewSkipped ? "Not available for this type" : "Not generated"} />
          </div>

          <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-1">
            <p>🕐 Sign companies have <strong>24 hours</strong> to submit quotes.</p>
            <p>💳 You are not charged until you accept a quote.</p>
            <p>📐 The sign company will re-measure on-site before fabrication.</p>
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("preview")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !requirementsComplete}
              className="flex-1 bg-accent text-accent-foreground rounded-xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Submitting…" : "Submit for Quotes →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Guest capture modal ── */}
      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold mb-1">Almost there!</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Tell us who you are so sign companies can reach you with quotes.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Your name</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGuestSubmit()}
                  placeholder="Jane Smith"
                  autoFocus
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGuestSubmit()}
                  placeholder="jane@example.com"
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone number</label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGuestSubmit()}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              {guestError && <p className="text-sm text-red-600">{guestError}</p>}
              <button
                onClick={handleGuestSubmit}
                disabled={guestSubmitting}
                className="w-full bg-accent text-accent-foreground rounded-xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {guestSubmitting ? "Setting up…" : "Generate my preview →"}
              </button>
              <p className="text-xs text-center text-muted-foreground">
                By continuing you agree to receive sign quotes at this number.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const map = {
    high:   { label: "High confidence", color: "bg-green-100 text-green-700" },
    medium: { label: "Medium confidence", color: "bg-yellow-100 text-yellow-700" },
    low:    { label: "Low confidence", color: "bg-orange-100 text-orange-700" },
  }
  const { label, color } = map[confidence]
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>{label}</span>
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-xs">{value}</span>
    </div>
  )
}
