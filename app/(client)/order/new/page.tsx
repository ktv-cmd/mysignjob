"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import PhotoUpload from "@/components/order/PhotoUpload"
import QuadSelector, { type QuadPoint } from "@/components/order/QuadSelector"
import { createOrder } from "@/app/actions/order"
import { formatDimensions } from "@/lib/utils"
import type { IlluminationType, SignSpec, AwningFrameStyle, SunbrellaFabric } from "@/types"
import {
  DURABOND_COLORS, ACRYLIC_COLORS,
  DEFAULT_PANEL_FACE_COLOR, DEFAULT_PANEL_BG_COLOR, DEFAULT_ACRYLIC_COLOR,
  type PanelColor, type AcrylicColor,
} from "@/lib/sign-colors"
import {
  REFERENCE_STYLES, DEFAULT_REFERENCE, FONT_OPTIONS, getSpecMapping,
  type FontStyle,
} from "@/lib/sign-references"
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

// ── SVG profile icons for each awning frame style (side-view silhouettes) ──────
function AwningFrameIcon({ style, active }: { style: AwningFrameStyle; active: boolean }) {
  const fill = active ? "currentColor" : "currentColor"
  const opacity = active ? 0.85 : 0.35

  const paths: Record<AwningFrameStyle, React.ReactNode> = {
    // Classic shed slope — slants from high-left to lower-right
    standard: (
      <path d="M2,8 L56,24 L56,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Shed slope + short valence hanging at the front edge
    standard_valence: (
      <>
        <path d="M2,8 L56,22 L56,34 L2,34 Z" fill={fill} fillOpacity={opacity} />
        <rect x="48" y="34" width="8" height="8" fill={fill} fillOpacity={opacity} />
      </>
    ),
    // Gentle convex arc on top
    arch: (
      <path d="M2,10 Q29,0 56,18 L56,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Convex front edge bows out
    bullnose: (
      <path d="M2,10 L40,10 Q62,10 54,32 L2,32 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Full dome semicircle
    dome: (
      <path d="M2,36 A27,27 0 0 1 56,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Shallower barrel curve
    circular: (
      <path d="M2,34 Q29,10 56,34 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Peaked A-frame / gable from front
    gable: (
      <path d="M2,36 L29,8 L56,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Semicircular arch with swept sides
    half_round: (
      <path d="M2,36 Q2,10 29,10 Q56,10 56,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Quarter-circle arc from wall (starts vertical, ends horizontal)
    quarter_round: (
      <path d="M2,8 A48,48 0 0 1 50,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Concave — inward curve on top surface
    concave: (
      <path d="M2,10 Q29,26 56,10 L56,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Waterfall — S-curve cascade
    waterfall: (
      <path d="M2,10 C18,10 38,36 56,26 L56,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
    // Flat-top rectangle / box
    box: (
      <path d="M2,10 L56,10 L56,36 L2,36 Z" fill={fill} fillOpacity={opacity} />
    ),
  }

  return (
    <svg viewBox="0 0 58 44" className="w-full h-10 mb-1" aria-hidden="true">
      {/* Wall attachment line */}
      <line x1="1" y1="2" x2="1" y2="42" stroke={fill} strokeOpacity={active ? 0.7 : 0.25} strokeWidth="2" strokeLinecap="round" />
      {paths[style]}
    </svg>
  )
}

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

  // Sign spec fields
  // ── Primary signage selector: reference style (webs/signs structure) ──
  const [referenceId, setReferenceId] = useState<string>(DEFAULT_REFERENCE.id)
  const [fontStyle, setFontStyle] = useState<FontStyle>("modern-sans")
  const [businessName, setBusinessName] = useState("")
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState("#1C1C1C") // letter color
  const [secondaryColor, setSecondaryColor] = useState("")
  const [notes, setNotes] = useState("")
  // Awning-specific
  const [awningFrame, setAwningFrame] = useState<AwningFrameStyle>("standard")
  const [awningFabric, setAwningFabric] = useState<SunbrellaFabric>(DEFAULT_AWNING_FABRIC)
  const [awningIllumination, setAwningIllumination] = useState<IlluminationType>("none")
  const [showAllColors, setShowAllColors] = useState(false)
  // Corner / wraparound sign
  const [isCorner, setIsCorner] = useState(false)
  // Dura-Bond ACP colors (aluminum / no-light style)
  const [panelFaceColor, setPanelFaceColor] = useState<PanelColor>(DEFAULT_PANEL_FACE_COLOR)
  const [panelBgColor, setPanelBgColor] = useState<PanelColor>(DEFAULT_PANEL_BG_COLOR)
  const [showAllPanelFace, setShowAllPanelFace] = useState(false)
  const [showAllPanelBg, setShowAllPanelBg] = useState(false)
  // Dura-Cast acrylic color
  const [acrylicColor, setAcrylicColor] = useState<AcrylicColor>(DEFAULT_ACRYLIC_COLOR)
  const [showAllAcrylic, setShowAllAcrylic] = useState(false)

  // ── Derived from the selected reference style ──
  const selectedReference = REFERENCE_STYLES.find(r => r.id === referenceId) ?? DEFAULT_REFERENCE
  const mapping = getSpecMapping(referenceId)
  const signType = mapping.signType
  const material = mapping.material
  const colorSystem = mapping.colorSystem
  const isAwning = referenceId === "awning"
  const lightingType = selectedReference.lightingType
  const illumination: IlluminationType = isAwning ? awningIllumination : mapping.illumination

  const stepIdx = STEPS.indexOf(step)

  const brandMode: "text-only" | "logo-only" | "logo-and-text" =
    logoDataUrl && businessName ? "logo-and-text"
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

  const visibleAcrylic = showAllAcrylic
    ? ACRYLIC_COLORS
    : ACRYLIC_COLORS.filter(c => c.common || (c.code === acrylicColor.code && c.finish === acrylicColor.finish))

  // Build the exact prompt params shared by the client (display) and server (generation)
  function buildPromptParams(): SignPromptParams {
    const isCornerQuad = !!quad && quad.length === 6
    const foldXPct = isCornerQuad && quad ? ((quad[1].x + quad[4].x) / 2) * 100 : undefined
    return {
      businessName,
      brandMode,
      hasLogo: !!logoDataUrl,
      referenceId,
      lightingType,
      fontStyle,
      letterColor: primaryColor,
      panelFace: colorSystem === "durabond" ? { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex } : null,
      panelBg:   colorSystem === "durabond" ? { name: panelBgColor.name,   code: panelBgColor.code,   hex: panelBgColor.hex   } : null,
      acrylic:   colorSystem === "acrylic"  ? { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish } : null,
      awningFrame: isAwning ? awningFrame : undefined,
      fabricName: isAwning ? `${awningFabric.name} (Sunbrella ${awningFabric.code})` : undefined,
      awningIllumination: isAwning ? awningIllumination : undefined,
      isCorner: isCornerQuad,
      foldXPct,
    }
  }

  const currentPrompt = buildSignPrompt(buildPromptParams())

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

  async function runPreview() {
    if (!photoDataUrl || !quad) return
    setGenerating(true)
    setGenerateError(null)
    setPreviewOptions([])
    setSelectedPreviewIdx(0)
    setPreviewSkipped(false)

    try {
      const res = await fetch("/api/order/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: photoDataUrl, quad,
          logoDataUrl: logoDataUrl ?? undefined,
          // reference-style + brand params (shared with the prompt preview)
          referenceId, lightingType, businessName, brandMode,
          fontStyle, letterColor: primaryColor,
          panelFace: colorSystem === "durabond" ? { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex } : undefined,
          panelBg:   colorSystem === "durabond" ? { name: panelBgColor.name,   code: panelBgColor.code,   hex: panelBgColor.hex   } : undefined,
          acrylic:   colorSystem === "acrylic"  ? { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish } : undefined,
          awningFrame: isAwning ? awningFrame : undefined,
          fabricName: isAwning ? `${awningFabric.name} (Sunbrella ${awningFabric.code})` : undefined,
          awningIllumination: isAwning ? awningIllumination : undefined,
          count: 3,
        }),
      })

      const text = await res.text()
      let data: { previewDataUrls?: string[]; skipped?: boolean; error?: string }
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Server error (${res.status}) — please try again.`)
      }

      if (data.skipped) { setPreviewSkipped(true); return }
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)

      const urls = data.previewDataUrls ?? []
      if (urls.length === 0) throw new Error("No previews were generated. Please try again.")
      setPreviewOptions(urls)
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

  function handleSubmit() {
    if (!photoDataUrl || !quad || !sizeResult || !hasBrandInput) return
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
      ...(!isAwning && { font_style: fontStyle }),
      ...(colorSystem === "durabond" && {
        panel_face_color: { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex },
        panel_bg_color:   { name: panelBgColor.name,   code: panelBgColor.code,   hex: panelBgColor.hex   },
        channel_lighting: { type: lightingType },
      }),
      ...(colorSystem === "acrylic" && {
        acrylic_color:    { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish },
        channel_lighting: { type: lightingType },
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
                    onClick={() => setLogoDataUrl(null)}
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
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = async (ev) => {
                        const url = ev.target?.result as string
                        setLogoDataUrl(url)
                        // Auto-fill color from logo when name is also present
                        if (businessName) {
                          const color = await extractDominantColor(url)
                          setPrimaryColor(color)
                        }
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
                  // When user types a name and a logo is already loaded, extract color
                  if (e.target.value && logoDataUrl) {
                    const color = await extractDominantColor(logoDataUrl)
                    setPrimaryColor(color)
                  }
                }}
                placeholder="e.g. Joe's Pizza"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {!businessName && !logoDataUrl && (
                <p className="text-xs text-muted-foreground mt-1">Required if no logo is uploaded.</p>
              )}
              {brandMode !== "text-only" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {brandMode === "logo-only" ? "Logo only — sign will display your logo." : "Logo + name — sign will display both."}
                </p>
              )}
            </div>

            {/* ── Font style (only when a business name is on the sign) ── */}
            {businessName.trim() && (
              <div>
                <label className="block text-sm font-medium mb-2">Font style</label>
                <p className="text-xs text-muted-foreground mb-2">
                  How the business name letters are shaped.
                  {brandMode === "logo-and-text" && " Letter color is taken from your logo automatically."}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {FONT_OPTIONS.map(f => {
                    const active = fontStyle === f.id
                    return (
                      <button key={f.id} type="button" onClick={() => setFontStyle(f.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 transition-all
                          ${active ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"}`}>
                        <span className={`text-2xl font-bold
                          ${f.id === "modern-sans" ? "font-sans" : f.id === "classic-serif" ? "font-serif" : "font-sans tracking-tighter"}`}>Aa</span>
                        <span className={`text-xs ${active ? "text-accent font-medium" : "text-muted-foreground"}`}>{f.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Sign style (reference styles, ported from webs/signs) ── */}
            <div>
              <label className="block text-sm font-medium mb-2">Sign style *</label>
              <p className="text-xs text-muted-foreground mb-3">Pick the construction & lighting style for your sign.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {REFERENCE_STYLES.map(ref => {
                  const active = referenceId === ref.id
                  return (
                    <button key={ref.id} type="button" onClick={() => setReferenceId(ref.id)}
                      className={`relative text-left rounded-xl border-2 overflow-hidden transition-all
                        ${active ? "border-accent shadow-sm" : "border-border hover:border-accent/40"}`}>
                      <div className="h-24 bg-muted overflow-hidden flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ref.imageUrl} alt={ref.name} className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold">{ref.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{ref.description}</p>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{ref.lightingType}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{ref.materialFeel}</span>
                        </div>
                      </div>
                      {active && <span className="absolute top-2 right-2 text-accent text-lg drop-shadow">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Style-specific options ── */}
            {isAwning ? (
              <>
                {/* Frame style with SVG icons */}
                <div>
                  <label className="block text-sm font-medium mb-1">Frame style</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Choose the awning profile shape. <span className="font-medium">Standard</span> is the most common for storefronts.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {AWNING_FRAMES.map(f => {
                      const active = awningFrame === f.value
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setAwningFrame(f.value)}
                          className={`rounded-lg border px-3 pt-2 pb-2 text-xs transition-colors text-left
                            ${active ? "border-accent bg-accent/10" : "border-border hover:bg-muted/50"}`}
                        >
                          <AwningFrameIcon style={f.value} active={active} />
                          <span className={`block font-medium leading-tight ${active ? "text-accent" : ""}`}>{f.label}</span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5 leading-tight">{f.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Sunbrella fabric color with progressive disclosure */}
                <div>
                  <label className="block text-sm font-medium mb-1">Sunbrella® fabric color</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Commercial-grade awning fabric — 10-yr warranty, UV &amp; weather resistant.
                    Selected: <span className="font-medium">{awningFabric.name}</span>
                    <span className="text-muted-foreground"> · #{awningFabric.code}</span>
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {visibleColors.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        title={`${c.name} (${c.code})`}
                        onClick={() => setAwningFabric(c)}
                        className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                          ${awningFabric.code === c.code ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                      >
                        <div className="w-full h-full" style={{ background: c.hex }} />
                        <div className="absolute inset-0 flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                          <span className="text-[9px] text-white font-medium leading-tight px-0.5 text-center">{c.name}</span>
                        </div>
                        {awningFabric.code === c.code && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-white text-sm drop-shadow">✓</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Show all / show fewer toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAllColors(v => !v)}
                    className="mt-3 text-xs text-accent font-medium hover:underline flex items-center gap-1"
                  >
                    {showAllColors
                      ? `Show fewer ▴`
                      : `Show all ${SUNBRELLA_COLORS.length} colors ▾`}
                  </button>

                  {/* Selected swatch summary */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-border flex-shrink-0" style={{ background: awningFabric.hex }} />
                    <span className="text-sm font-medium">{awningFabric.name}</span>
                    <span className="text-xs text-muted-foreground">Sunbrella® {awningFabric.code}</span>
                  </div>
                </div>

                {/* Awning illumination — 2 options only */}
                <div>
                  <label className="block text-sm font-medium mb-2">Lighting</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AWNING_LIGHTING.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setAwningIllumination(o.value)}
                        className={`text-left rounded-lg border px-3 py-2.5 text-xs transition-colors
                          ${awningIllumination === o.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                      >
                        <span className="block font-medium">{o.label}</span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">{o.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── Lighting (determined by the chosen sign style) ── */}
                <div className="flex items-center gap-2 text-xs bg-muted/40 border border-border rounded-lg px-3 py-2.5">
                  <span>💡</span>
                  <span className="text-muted-foreground">
                    Lighting comes with your sign style —{" "}
                    <span className="font-medium text-foreground">
                      {referenceId === "no-light-outdoor"
                        ? "no illumination (daytime / floodlit)"
                        : selectedReference.lightingType === "front" ? "front-lit (glowing faces)"
                        : selectedReference.lightingType === "back" ? "back-lit halo glow"
                        : "front + back lit"}
                    </span>
                  </span>
                </div>

                {/* ── Dura-Bond ACP colors (no-light / aluminum styles) ── */}
                {colorSystem === "durabond" && (
                  <>
                    <PanelColorPicker
                      label="Letter face color (Dura-Bond ACP)"
                      subtitle="Color of the letter/panel face"
                      selected={panelFaceColor}
                      onSelect={setPanelFaceColor}
                      visible={visiblePanelFace}
                      showAll={showAllPanelFace}
                      onToggleAll={() => setShowAllPanelFace(v => !v)}
                      total={DURABOND_COLORS.length}
                    />
                    <PanelColorPicker
                      label="Background panel color (Dura-Bond ACP)"
                      subtitle="Color of the backer panel behind the letters"
                      selected={panelBgColor}
                      onSelect={setPanelBgColor}
                      visible={visiblePanelBg}
                      showAll={showAllPanelBg}
                      onToggleAll={() => setShowAllPanelBg(v => !v)}
                      total={DURABOND_COLORS.length}
                    />
                  </>
                )}

                {/* ── Dura-Cast® Acrylic color (illuminated styles) ── */}
                {colorSystem === "acrylic" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Dura-Cast® acrylic face color</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      <span className="inline-flex gap-2 flex-wrap">
                        <span><span className="font-mono bg-muted px-1 rounded text-[10px]">T</span> Translucent — glows with LED</span>
                        <span><span className="font-mono bg-muted px-1 rounded text-[10px]">O</span> Opaque — solid, no light-through</span>
                        <span><span className="font-mono bg-muted px-1 rounded text-[10px]">◇</span> Transparent — tinted see-through</span>
                        <span><span className="font-mono bg-muted px-1 rounded text-[10px]">M</span> Matte — diffused non-gloss</span>
                      </span>
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                      {visibleAcrylic.map(c => {
                        const finishBadge = c.finish === "translucent" ? "T" : c.finish === "opaque" ? "O" : c.finish === "transparent" ? "◇" : "M"
                        const opacity = c.finish === "translucent" ? 0.75 : c.finish === "transparent" ? 0.55 : 1
                        return (
                          <button key={`${c.code}-${c.finish}`} type="button"
                            title={`${c.name} #${c.code} — ${c.finish}`}
                            onClick={() => setAcrylicColor(c)}
                            className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                              ${acrylicColor.code === c.code && acrylicColor.finish === c.finish ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}>
                            <div className="w-full h-full" style={{ background: c.hex, opacity }} />
                            <div className="absolute inset-0 flex items-start justify-end p-0.5">
                              <span className="text-[8px] bg-white/80 text-foreground rounded px-0.5 leading-tight font-bold">{finishBadge}</span>
                            </div>
                            <div className="absolute inset-0 flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                              <span className="text-[9px] text-white font-medium leading-tight px-0.5 text-center">{c.name}</span>
                            </div>
                            {acrylicColor.code === c.code && acrylicColor.finish === c.finish && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-white text-sm drop-shadow">✓</span>
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <button type="button" onClick={() => setShowAllAcrylic(v => !v)}
                      className="mt-3 text-xs text-accent font-medium hover:underline">
                      {showAllAcrylic ? `Show fewer ▴` : `Show all ${ACRYLIC_COLORS.length} colors ▾`}
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-border flex-shrink-0"
                        style={{ background: acrylicColor.hex, opacity: acrylicColor.finish === "translucent" ? 0.75 : acrylicColor.finish === "transparent" ? 0.55 : 1 }} />
                      <span className="text-sm font-medium">{acrylicColor.name}</span>
                      <span className="text-xs text-muted-foreground">#{acrylicColor.code}</span>
                      <span className="text-xs text-accent capitalize">{acrylicColor.finish}</span>
                    </div>
                  </div>
                )}

                {/* ── Logo color note (Case C) ── */}
                {brandMode === "logo-and-text" && (
                  <div className="flex items-center gap-2 text-xs bg-accent/5 border border-accent/30 rounded-lg px-3 py-2.5">
                    <span>🎨</span>
                    <span className="text-muted-foreground">
                      Letter color is sampled automatically from your logo for a unified brand look.
                    </span>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Additional notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Special requirements, logo integration, mounting preferences…"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>
          </div>

          {/* ── AI prompt preview (exactly what gets sent to the image model) ── */}
          <details className="border border-border rounded-xl bg-muted/20 overflow-hidden group" open>
            <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
              <span className="flex items-center gap-2">🤖 AI prompt preview</span>
              <span className="text-xs text-muted-foreground group-open:hidden">show</span>
              <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                This is the exact instruction sent to the AI to render your sign. Adjust the options above and it updates live.
              </p>
              <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-background border border-border rounded-lg p-3 font-mono text-foreground/90 max-h-56 overflow-auto">{currentPrompt}</pre>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(currentPrompt)}
                className="text-xs text-accent font-medium hover:underline"
              >
                Copy prompt
              </button>
            </div>
          </details>

          <div className="flex gap-3">
            <button onClick={() => setStep("quad")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={() => { setStep("preview"); runPreview() }}
              disabled={!hasBrandInput}
              className="flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue → AI Preview
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: AI Preview ── */}
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
                {colorSystem === "durabond" && (
                  <Row label="Face / background" value={
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: panelFaceColor.hex }} />
                      {panelFaceColor.name}
                      <span className="text-muted-foreground">on</span>
                      <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: panelBgColor.hex }} />
                      {panelBgColor.name}
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
                <Row label="Lighting" value={
                  referenceId === "no-light-outdoor" ? "No illumination"
                  : selectedReference.lightingType === "front" ? "Front-lit"
                  : selectedReference.lightingType === "back" ? "Back-lit halo"
                  : "Front + back lit"
                } />
              </>
            )}
            {notes && <Row label="Notes" value={notes} />}
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
              disabled={submitting}
              className="flex-1 bg-accent text-accent-foreground rounded-xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Submitting…" : "Submit for Quotes →"}
            </button>
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
