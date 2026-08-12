"use client"

import { useState, useTransition, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient as createBrowserClient } from "@/lib/supabase/client"
import { saveGuestProfile } from "@/app/actions/auth"
import PhotoUpload from "@/components/order/PhotoUpload"
import VideoRulerCapture from "@/components/order/VideoRulerCapture"
import ARMeasureCapture, { isARMeasureSupported } from "@/components/order/ARMeasureCapture"
import PhoneHandoff from "@/components/order/PhoneHandoff"
import MeasureAppNudge from "@/components/order/MeasureAppNudge"
import QuadSelector, { type QuadPoint } from "@/components/order/QuadSelector"
import DoorCornerTap from "@/components/order/DoorCornerTap"
import { createOrder } from "@/app/actions/order"
import { isPdfFile, pdfFileToLogoDataUrl } from "@/lib/pdf-logo"
import {
  computeSignDimensions, isPlausibleDimension, fitQuadToRatio,
  MAX_SIGN_DIMENSION_INCHES, MAX_REFERENCE_INCHES,
  type SignDimensions,
} from "@/lib/sign-geometry"
import { computeDoorHomographyDimensions } from "@/lib/sign-homography"
import type { IlluminationType, SignMaterial, SignSpec, AwningFrameStyle, SunbrellaFabric } from "@/types"
import {
  DURABOND_COLORS, ACRYLIC_COLORS,
  DEFAULT_PANEL_FACE_COLOR, DEFAULT_PANEL_BG_COLOR, DEFAULT_ACRYLIC_COLOR,
  type PanelColor, type AcrylicColor,
} from "@/lib/sign-colors"
import {
  REFERENCE_STYLES, DEFAULT_REFERENCE, FONT_OPTIONS, getSpecMapping,
  type FontStyle,
} from "@/lib/sign-references"
import PictureChoice from "@/components/order/PictureChoice"
import LightWarmthSlider, { DEFAULT_LIGHT_WARMTH_K } from "@/components/order/LightWarmthSlider"
import { buildSignPrompt, type SignPromptParams } from "@/lib/sign-prompt"

// A deploy that lands while this page is still open in a browser tab changes
// every Server Action's content hash, so a stale client's action reference
// stops resolving on the server — Next.js throws "Server Action ... was not
// found". The fix is just a reload (fetches the current bundle); the raw
// error otherwise reads as a scary, unrecoverable crash to a customer.
function isStaleServerActionError(err: unknown): boolean {
  return err instanceof Error && /Server Action .* was not found/i.test(err.message)
}

function recoverFromStaleServerAction() {
  toast.info("This app was just updated — refreshing…")
  setTimeout(() => window.location.reload(), 1200)
}

type Step = "photo" | "quad" | "customize" | "preview" | "review"

const STEPS: Step[] = ["photo", "quad", "customize", "preview", "review"]
const STEP_LABELS: Record<Step, string> = {
  photo: "Photo",
  quad: "Mark Sign Area",
  customize: "Sign Details",
  preview: "AI Preview",
  review: "Submit",
}

// Review-page display labels for the channel-letter lighting style — keyed on
// the same granular lightingStyle state the picker uses, not the collapsed
// ReferenceStyle.lightingType (which only distinguishes front/back/both and
// would show "Front + back lit" for Side, Front + Side, and Full alike).
const LIGHTING_STYLE_LABELS: Record<"front" | "back" | "back_side" | "front_back" | "front_side" | "full", string> = {
  front: "Front-lit",
  back: "Back-lit halo",
  back_side: "Side (back-lit + edge accent)",
  front_back: "Front + back lit",
  front_side: "Front-lit + side accent",
  full: "Full 360° (front, back + side)",
}

// Suggested height for the entrance door, used only to prefill the reference
// input. It is a starting guess, NOT a measurement: 80" (6'8") is the US
// residential standard, while commercial storefront entrances are frequently
// 84" or taller. Since this single number scales every dimension derived from
// the photo, leaving it untouched is tracked (referenceAssumed) and caps the
// reported confidence — see computeSignDimensions in lib/sign-geometry.ts.
const DEFAULT_DOOR_INCHES = 80

const AWNING_LIGHTING: { value: IlluminationType; label: string; desc: string }[] = [
  { value: "none",         label: "No Lighting",             desc: "Daytime only, no illumination" },
  { value: "internal_led", label: "Backlit (interior light)", desc: "Fabric glows from inside the frame at night" },
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

export default function OrderNewClient({ startInCaptureMode = false }: { startInCaptureMode?: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("photo")
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  // "live" lets someone standing at the storefront right now capture a
  // guided photo with their camera instead of uploading a file — see
  // components/order/VideoRulerCapture.tsx. "ar" (see ARMeasureCapture.tsx)
  // goes further — it taps 4 real-world corners with WebXR and hands back
  // real inches, not just a photo. All three only replace photo
  // acquisition; everything downstream (QuadSelector, size calculation)
  // treats the result identically to an uploaded photo, except that an "ar"
  // result also short-circuits the reference-measurement sub-steps below
  // (see arMeasurement).
  // startInCaptureMode arrives from the desktop QR hand-off — see the page's
  // own comment. Taking the photo is the entire reason that device was brought
  // into the flow, so it opens on the camera rather than the file picker.
  const [captureMode, setCaptureMode] = useState<"upload" | "live" | "ar">(
    startInCaptureMode ? "live" : "upload"
  )
  // Whether this browser/device can run the WebXR AR measurement flow —
  // resolved asynchronously (isARMeasureSupported awaits navigator.xr's own
  // promise), so it starts false and the "Measure with AR" option simply
  // doesn't exist until proven supported. Never shown, never an error, on a
  // device that can't do it — there is nothing degraded to explain.
  const [arSupported, setArSupported] = useState(false)
  const [quad, setQuad] = useState<QuadPoint[] | null>(null)
  // Reference calibration (the "app ruler" pattern) — the client marks an
  // object of known size in the photo and the sign's size is derived from it
  // client-side. Two shapes: "door" is the guided 4-point outline (the common
  // case, and the more accurate one since it averages both vertical edges and
  // tolerates perspective), "custom" is a plain 2-point line for any other
  // object.
  const [referenceType, setReferenceType] = useState<"door" | "custom">("door")
  const [referenceInches, setReferenceInches] = useState<number>(DEFAULT_DOOR_INCHES)
  // Whether the client actually supplied the reference's real size rather than
  // accepting the suggested door height. A wrong assumption here skews every
  // derived dimension by the same percentage while the geometry still looks
  // perfect, so this is the one error the pixel math cannot detect — it feeds
  // the confidence tier written to sign_spec.width_confidence.
  const [referenceInchesEdited, setReferenceInchesEdited] = useState(false)
  const referenceAssumed = referenceType === "door" && !referenceInchesEdited
  const [reference, setReference] = useState<QuadPoint[] | null>(null)
  // The 4 door corners tapped via DoorCornerTap — a separate slot from
  // `reference` (not reused) because `reference`'s existing contract is
  // specifically QuadSelector's own shape-drag output; conflating the two
  // would let a future reader assume `reference` always came from that
  // component. Only ever set while referenceType === "door"; the old
  // scalar-calibration path (computeSignDimensions via `reference`) stays
  // live for referenceType === "custom".
  const [doorCorners, setDoorCorners] = useState<QuadPoint[] | null>(null)
  // Non-null only when the current photo+quad came from ARMeasureCapture's
  // WebXR tap-4-corners flow — its presence IS the "this is an AR order"
  // flag, read below to (a) build a SignDimensions branch with its own
  // "ar_measurement" provenance rather than reusing the typed-number
  // "client_provided" branch, which would misreport where the number came
  // from, (b) skip the sizeQuestion/explain/placement reference sub-steps,
  // since AR already knows the size, and (c) omit the reference_* fields
  // from the submitted sign_spec, since there is no reference object. Reset
  // to null any time the photo is replaced by a non-AR capture.
  const [arMeasurement, setArMeasurement] = useState<{ widthInches: number; heightInches: number; squareness: number } | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [previewOptions, setPreviewOptions] = useState<string[]>([])
  // AI-reported color(s) per preview variant, parallel to previewOptions —
  // only populated when logoColorMatch is true (see SignSpec.logo_color_match_hex).
  // Best-effort: read off a photo, not a real swatch lookup.
  const [previewColorReports, setPreviewColorReports] = useState<({ letters?: string; panel?: string } | null)[]>([])
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState<number>(0)
  const [previewSkipped, setPreviewSkipped] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const previewDataUrl = previewOptions[selectedPreviewIdx] ?? null
  const previewColorReport = previewColorReports[selectedPreviewIdx] ?? null
  const [submitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Guest capture modal (shown instead of login when the user has no session)
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  // Same modal also offers an inline login for returning customers, so a
  // person with a real account doesn't get funneled into a second, orphaned
  // anonymous account just because this browser has no session.
  const [authModalMode, setAuthModalMode] = useState<"guest" | "login">("guest")
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  // Sign spec fields
  const [signMaterial, setSignMaterial] = useState<"acrylic" | "aluminum">("acrylic") // cheaper default
  const [fontStyle, setFontStyle] = useState<FontStyle>("modern-sans")
  const [businessName, setBusinessName] = useState("")
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  // Client-confirmed: does the uploaded logo already render the business name?
  // If so, we show logo-only (never duplicate the name on the sign).
  const [logoIncludesName, setLogoIncludesName] = useState(false)
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
  // New tree structure: sign type selector
  const [signCategory, setSignCategory] = useState<"letters" | "light_box" | "awning" | null>("letters")
  const [isLit, setIsLit] = useState<boolean | null>(null)
  const [lightingStyle, setLightingStyle] = useState<"front" | "back" | "back_side" | "front_back" | "front_side" | "full">("front")
  const [lightBoxType, setLightBoxType] = useState<"cabinet" | "seethrough_letters">("cabinet")
  const [isPerpendicular, setIsPerpendicular] = useState(false)
  const [lightBoxShape, setLightBoxShape] = useState<string>("rectangle")
  const [lightWarmth, setLightWarmth] = useState<number>(DEFAULT_LIGHT_WARMTH_K)
  const [lightColorful, setLightColorful] = useState<boolean>(false)
  const [showAllColors, setShowAllColors] = useState(false)
  // Corner / wraparound sign
  const [isCorner, setIsCorner] = useState(false)
  // The "Mark Sign Area" step is a small guided sequence rather than one long
  // scrolling form: mark the area, then a focused size question, then (only
  // if the client doesn't know their exact size) an explanation of the
  // door/brick reference method and a screen to actually place it on the photo.
  const [quadSubStep, setQuadSubStep] = useState<"area" | "sizeQuestion" | "explain" | "placement" | "mount">("area")
  const [sizeQuestionAnswered, setSizeQuestionAnswered] = useState(false)
  // Client already knows the sign's exact size — skip photo-based measuring
  const [knownSize, setKnownSize] = useState(false)
  const [knownWidthInches, setKnownWidthInches] = useState<number>(0)
  const [knownHeightInches, setKnownHeightInches] = useState<number>(0)
  const [knownFrontWidthInches, setKnownFrontWidthInches] = useState<number>(0)
  const [knownSideWidthInches, setKnownSideWidthInches] = useState<number>(0)
  // Dura-Bond ACP colors (aluminum / no-light style)
  const [panelFaceColor, setPanelFaceColor] = useState<PanelColor>(DEFAULT_PANEL_FACE_COLOR)
  const [panelBgColor, setPanelBgColor] = useState<PanelColor>(DEFAULT_PANEL_BG_COLOR)
  // Backer panel behind the letters (channel-letter styles). Default ON — most
  // storefront walls aren't an attractive backdrop on their own.
  const [hasBackground, setHasBackground] = useState(true)
  // Dura-Cast acrylic color
  const [acrylicColor, setAcrylicColor] = useState<AcrylicColor>(DEFAULT_ACRYLIC_COLOR)

  // ── Compute referenceId from new UI state ──
  const computedReferenceId = (() => {
    if (signCategory === "awning") return "awning"
    if (signCategory === "light_box") return "light-box"
    if (signCategory === "letters" && isLit === false) return "no-light-outdoor"
    if (signCategory === "letters" && isLit === true) {
      if (lightingStyle === "front") return "front-lid"
      if (lightingStyle === "back") return "back-lit"
      if (lightingStyle === "front_back" || lightingStyle === "front_side" || lightingStyle === "back_side" || lightingStyle === "full") return "back-front-lid"
    }
    return "front-lid" // default fallback
  })()

  // Feature-detect WebXR AR measurement once on mount — resolves false (never
  // throws) on any device without it, which is the overwhelming majority, so
  // this stays a no-op there. See arSupported's own comment above.
  useEffect(() => {
    let cancelled = false
    isARMeasureSupported().then(supported => { if (!cancelled) setArSupported(supported) })
    return () => { cancelled = true }
  }, [])

  // Auto-switch to aluminum when "No lighting" is selected
  useEffect(() => {
    if (isLit === false && signMaterial !== "aluminum") {
      setSignMaterial("aluminum")
    }
  }, [isLit, signMaterial])

  // Auto-lock sign category to light_box when perpendicular (blade) mount is selected
  useEffect(() => {
    if (isPerpendicular && signCategory !== "light_box") {
      setSignCategory("light_box")
    }
  }, [isPerpendicular, signCategory])

  // ── Derived from the selected reference style ──
  const selectedReference = REFERENCE_STYLES.find(r => r.id === computedReferenceId) ?? DEFAULT_REFERENCE
  const mapping = getSpecMapping(computedReferenceId)
  const signType = mapping.signType
  const isAwning = computedReferenceId === "awning"
  // Channel-letter styles (everything except the cabinet light-box and the awning)
  // can sit on a backer panel or mount directly to the wall.
  const isChannelLetter = !isAwning && computedReferenceId !== "light-box"
  // For lit channel letters, use the client's actual granular lightingStyle
  // pick (front/back/front_back/front_side/back_side/full) — ReferenceStyle's
  // own lightingType only distinguishes front/back/both and would collapse
  // side-accent and full-surround into the same "both" prompt as plain
  // front+back lighting. Other categories (light-box, awning, no-light) don't
  // expose that picker, so they keep the reference style's default.
  const lightingType = signCategory === "letters" && isLit === true
    ? lightingStyle
    : selectedReference.lightingType
  const illumination: IlluminationType = isAwning ? awningIllumination : mapping.illumination
  // Material is a CLIENT choice for every non-awning style (default = cheaper acrylic).
  const material: SignMaterial = isAwning ? "vinyl" : signMaterial
  const colorSystem: "durabond" | "acrylic" | "awning" =
    isAwning ? "awning" : signMaterial === "aluminum" ? "durabond" : "acrylic"

  // No letter/panel color is asked for here — the sign company color-matches
  // the uploaded logo exactly instead. Scoped narrowly: lit channel letters
  // WITH a background panel, or a cabinet light box. Unlit letters, letters
  // with no panel, see-through light boxes, and awnings keep the normal
  // manual color picker even with a logo present.
  const logoColorMatch = !!logoDataUrl && (
    (signCategory === "letters" && isLit === true && hasBackground) ||
    (signCategory === "light_box" && lightBoxType === "cabinet")
  )

  const stepIdx = STEPS.indexOf(step)

  // logoIncludesName only matters when both a logo and a name are present — if the
  // logo art already spells out the business name, don't render the name a second time.
  const brandMode: "text-only" | "logo-only" | "logo-and-text" =
    logoDataUrl && businessName ? (logoIncludesName ? "logo-only" : "logo-and-text")
    : logoDataUrl               ? "logo-only"
    :                             "text-only"

  // Colors shown: always include the 12 common + the currently selected color (even if not common)
  const visibleColors = showAllColors
    ? SUNBRELLA_COLORS
    : SUNBRELLA_COLORS.filter(c => c.common || c.code === awningFabric.code)

  // The exact prompt we hand to the AI — assembled by the SAME builder the server
  // uses, so what the client previews here is what actually gets sent. Memoized so
  // the sanitizing prompt builder doesn't rerun on every keystroke in unrelated
  // fields (e.g. the Notes textarea) — only when a field it actually reads changes.
  const promptParams: SignPromptParams = useMemo(() => ({
    businessName,
    brandMode,
    hasLogo: !!logoDataUrl,
    // Mirrors the server rule: for NO-light letters and see-through letters the
    // logo file is tinted to the chosen sign color (flattened on white) before
    // sending, so the prompt asks for exact reproduction instead of a recolor.
    logoPreColored: !!logoDataUrl && (
      computedReferenceId === "no-light-outdoor" ||
      (signCategory === "light_box" && lightBoxType === "seethrough_letters")
    ),
    referenceId: computedReferenceId,
    lightingType,
    illuminated: isLit !== false,
    fontStyle,
    letterColor: primaryColor,
    // No swatch was chosen when logoColorMatch applies — the fabricator reads
    // colors straight off the logo, so don't hand the prompt a stale default.
    panelFace: !logoColorMatch && colorSystem === "durabond" ? { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex } : null,
    panelBg: !logoColorMatch && isChannelLetter && hasBackground
      ? { name: panelBgColor.name, code: panelBgColor.code, hex: panelBgColor.hex }
      : null,
    hasBackground: isChannelLetter ? hasBackground : undefined,
    bgMaterial: isChannelLetter && hasBackground ? ("aluminum" as const) : undefined,
    acrylic: !logoColorMatch && colorSystem === "acrylic" ? { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish } : null,
    logoColorMatch,
    awningFrame: isAwning ? awningFrame : undefined,
    fabricName: isAwning ? `${awningFabric.name} (Sunbrella ${awningFabric.code})` : undefined,
    awningIllumination: isAwning ? awningIllumination : undefined,
    isCorner,
    foldXPct: isCorner && quad && quad.length === 6 ? ((quad[1].x + quad[4].x) / 2) * 100 : undefined,
    customPrompt: customPrompt.trim() || undefined,
  }), [
    businessName, brandMode, logoDataUrl, computedReferenceId, signCategory, lightBoxType,
    lightingType, isLit, fontStyle, primaryColor, colorSystem, panelFaceColor, isChannelLetter,
    hasBackground, panelBgColor, acrylicColor, isAwning, awningFrame, awningFabric,
    awningIllumination, isCorner, quad, customPrompt, logoColorMatch,
  ])
  const assembledPrompt = useMemo(() => buildSignPrompt(promptParams), [promptParams])

  // Pure client-side geometry — no AI call. Recomputes on any quad/reference
  // drag. Returns null if inputs are incomplete OR the reference line is too
  // short to trust (hard minimum gate) — never shown to the client, just
  // used to gate progression and to populate sign_spec on submit.
  const geometryResult = useMemo(
    () => computeSignDimensions(quad, reference, referenceInches, imgDims, referenceType, referenceAssumed),
    [quad, reference, referenceInches, imgDims, referenceType, referenceAssumed]
  )
  // Distinguishes "haven't marked both yet" from "marked, but line too short" —
  // drives the inline error copy in the quad step.
  const referenceTooShort = !!quad && !!reference && !!imgDims && !geometryResult

  // Door-corner-tap homography — replaces the scalar geometryResult path for
  // referenceType === "door": a full 4-point projective transform instead of
  // one global pixels-per-inch scalar, correcting perspective distortion for
  // any camera angle rather than only when the shot happens to be
  // perpendicular. See lib/sign-homography.ts.
  const homographyResult = useMemo(
    () =>
      referenceType === "door" && doorCorners
        ? computeDoorHomographyDimensions(quad, doorCorners, referenceInches, imgDims, referenceAssumed)
        : null,
    [referenceType, doorCorners, quad, referenceInches, imgDims, referenceAssumed]
  )
  // Same "attempted but rejected" vs. "not attempted yet" distinction
  // referenceTooShort makes for the old scalar path.
  const doorHomographyFailed = referenceType === "door" && !!quad && !!doorCorners && !!imgDims && !homographyResult

  // When the client already knows their sign's exact size, skip the photo-based
  // measurement entirely and build a SignDimensions from their typed numbers.
  const manualDimensionsValid = knownSize && (
    isCorner
      ? isPlausibleDimension(knownFrontWidthInches) && isPlausibleDimension(knownSideWidthInches) && isPlausibleDimension(knownHeightInches)
      : isPlausibleDimension(knownWidthInches) && isPlausibleDimension(knownHeightInches)
  )
  // AR takes priority over both other branches — an AR capture never leaves
  // knownSize/geometryResult in a state that could be mistaken for it (the
  // sizeQuestion sub-step that sets knownSize is skipped entirely for AR,
  // and geometryResult needs a `reference` that AR never sets). It gets its
  // own branch rather than reusing the knownSize/"client_provided" one below
  // because an AR reading is neither hand-typed nor reference-derived — that
  // would misreport its provenance to the sign companies quoting against it.
  // squareness (how close the 4 tapped corners are to a true rectangle) is
  // the one reliability signal AR gives us about itself, so a sloppy tap
  // sequence is capped at "medium" confidence and flagged, the same way the
  // reference-calibration branch (computeConfidence in lib/sign-geometry.ts)
  // caps confidence on its own uncertain inputs.
  const signDimensions: SignDimensions | null = arMeasurement
    ? {
        widthInches: arMeasurement.widthInches,
        heightInches: arMeasurement.heightInches,
        isCorner: false,
        confidence: arMeasurement.squareness >= 0.9 ? "high" : "medium",
        angleWarning: arMeasurement.squareness < 0.9,
        referencesUsed: ["ar_measurement"],
      }
    : knownSize
    ? (manualDimensionsValid
        ? {
            widthInches: isCorner ? knownFrontWidthInches + knownSideWidthInches : knownWidthInches,
            heightInches: knownHeightInches,
            ...(isCorner && { frontWidthInches: knownFrontWidthInches, sideWidthInches: knownSideWidthInches }),
            isCorner,
            confidence: "high",
            angleWarning: false,
            referencesUsed: ["client_provided"],
          }
        : null)
    : referenceType === "door"
    ? homographyResult
    : geometryResult

  // Once real dimensions are known (typed, reference-calibrated, or later a
  // Maps cross-check), silently snap whatever quad is currently drawn onto
  // the correct ratio — closes the gap where the "I already know my exact
  // size" path draws its quad during the earlier `area` step (before any
  // ratio is known) and never revisits it, so a client could otherwise reach
  // submission with a quad that's still an arbitrary, unrelated shape.
  // QuadSelector is uncontrolled, so this pushes the fitted quad down via
  // `applyQuad` rather than writing `quad` directly — see QuadSelector's
  // Props doc comment.
  //
  // Guarded by the target *ratio* (not a one-shot "have we ever snapped"
  // flag) so it: (a) re-snaps if the client edits the typed dimensions again
  // after an earlier snap — a plain one-shot flag missed this, leaving the
  // box locked to a stale shape that then silently failed the server-side
  // ratio check at submit with no clue why; (b) does NOT re-snap on every
  // frame while the client drags the reference line during the measured
  // path, since scaling the reference changes width/height in lockstep and
  // leaves their ratio (and thus this key) unchanged; (c) does NOT fight the
  // client's own locked resize/rotate drags, which by construction always
  // preserve the ratio they were locked to.
  const lastSnappedRatioKeyRef = useRef<string | null>(null)
  const [quadSnapTrigger, setQuadSnapTrigger] = useState<QuadPoint[] | undefined>(undefined)

  useEffect(() => {
    if (quad === null) lastSnappedRatioKeyRef.current = null
  }, [quad])

  useEffect(() => {
    // Door-homography path: skip entirely. fitQuadToRatio assumes the quad's
    // ON-SCREEN (image-space) width:height ratio directly reflects its
    // real-world ratio — true for the old scalar method, but not for a
    // homography, whose whole point is that a projective transform can map
    // an arbitrarily-shaped on-screen quad to the correct real-world size
    // without the two ratios matching. Running this anyway created a live
    // feedback loop: fitting the quad to homographyResult's ratio changes
    // `quad`, which changes homographyResult's own ratio (computed via the
    // projective inverse, not image-space distance), which never converges —
    // an infinite re-render loop. There's also no need for it: the door path
    // never re-shows the sign quad for interaction after "area" (see the
    // dedicated DoorCornerTap screen above), so nothing needs its on-screen
    // shape corrected.
    if (referenceType === "door") return
    if (!signDimensions || !quad || !imgDims) return
    if (!(signDimensions.heightInches > 0)) return // guard against a NaN ratio key from a degenerate measurement
    const ratioKey = signDimensions.isCorner
      ? `c:${((signDimensions.frontWidthInches ?? 0) / signDimensions.heightInches).toFixed(4)}:${((signDimensions.sideWidthInches ?? 0) / signDimensions.heightInches).toFixed(4)}`
      : `f:${(signDimensions.widthInches / signDimensions.heightInches).toFixed(4)}`
    if (lastSnappedRatioKeyRef.current === ratioKey) return
    const aspect = imgDims.w / imgDims.h
    const fitted = isCorner
      ? fitQuadToRatio(quad, aspect, signDimensions.widthInches, signDimensions.heightInches, true, signDimensions.frontWidthInches, signDimensions.sideWidthInches)
      : fitQuadToRatio(quad, aspect, signDimensions.widthInches, signDimensions.heightInches, false)
    lastSnappedRatioKeyRef.current = ratioKey
    setQuadSnapTrigger(fitted)
  }, [signDimensions, quad, imgDims, isCorner, referenceType])

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
      if (isStaleServerActionError(err)) { recoverFromStaleServerAction(); return }
      setGuestError(err instanceof Error ? err.message : "Could not proceed. Try again.")
    } finally {
      setGuestSubmitting(false)
    }
  }

  // Returning customer signing into their real account from the same gate —
  // inline, client-side, no redirect, so the in-progress photo/quad/sign-spec
  // state survives and generation resumes immediately after auth.
  async function handleInlineLogin() {
    const email = loginEmail.trim()
    const password = loginPassword
    if (!email) { setLoginError("Please enter your email."); return }
    if (!password) { setLoginError("Please enter your password."); return }
    setLoginSubmitting(true)
    setLoginError(null)
    try {
      const sb = createBrowserClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
      setShowGuestModal(false)
      runPreview()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Could not log in. Try again.")
    } finally {
      setLoginSubmitting(false)
    }
  }

  async function runPreview() {
    // Defense in depth: this should be unreachable now that QuadSelector reports
    // its default quad on mount, but a silent no-op here previously meant a
    // missing quad hung the AI preview step forever with zero user feedback.
    if (!photoDataUrl || !quad) {
      setGenerateError("We're missing your photo or the marked sign area. Please go back and confirm the sign area box on your photo.")
      return
    }

    // Show the guest capture modal instead of hitting the 401 wall
    const { data: { user } } = await createBrowserClient().auth.getUser()
    if (!user) { setShowGuestModal(true); return }

    setGenerating(true)
    setGenerateError(null)
    setPreviewOptions([])
    setPreviewColorReports([])
    setSelectedPreviewIdx(0)
    setPreviewSkipped(false)

    // Reuse the exact same params that build the on-screen prompt preview, so what
    // the client sees is byte-for-byte what the server sends to the AI.
    const payload = {
      imageDataUrl: photoDataUrl, quad,
      logoDataUrl: logoDataUrl ?? undefined,
      ...promptParams,
      seeThroughLetters: signCategory === "light_box" && lightBoxType === "seethrough_letters",
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
        const sData = await sRes.json().catch(() => ({})) as {
          status?: string
          previewUrls?: string[]
          previewColors?: ({ letters?: string; panel?: string } | null)[]
          error?: string
        }
        if (sData.status === "done") {
          const urls = sData.previewUrls ?? []
          if (urls.length === 0) throw new Error("No previews were generated. Please try again.")
          setPreviewOptions(urls)
          setPreviewColorReports(sData.previewColors ?? [])
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
    if (s === "customize" && !signDimensions) return
    if (s === "preview" && !hasBrandInput) return
    setStep(s)
  }

  // Installation choice is required; if the SC installs and insurance is required,
  // a coverage amount must be set before the job can go out for quotes.
  const requirementsComplete =
    needsInstallation !== null &&
    !(needsInstallation === true && coiRequired === "yes" && coiAmount == null)

  function handleSubmit() {
    if (!photoDataUrl || !quad || !signDimensions || (!reference && !doorCorners && !knownSize && !arMeasurement) || !hasBrandInput || !requirementsComplete) return
    // Self-install orders have no professional site visit to catch a bad
    // photo-based estimate before installation — unlike the SC-install path,
    // where the company remeasures on-site before production, here the
    // client's own measurement has to BE the final number. This is a hard
    // guard independent of which measurement UI was used to get here (photo
    // reference, door homography, or AR), not just a step-ordering nudge —
    // needsInstallation is only asked later, at review, so nothing earlier
    // in the flow can enforce this by construction.
    if (needsInstallation === false && !knownSize) {
      setSubmitError("Since you're installing this yourself, we need your own exact measurement — enter it in the box above before submitting.")
      return
    }
    setSubmitError(null)

    const signSpec: SignSpec = {
      sign_type: signType,
      width_inches: signDimensions.widthInches,
      height_inches: signDimensions.heightInches,
      width_confidence: signDimensions.confidence,
      business_name: businessName,
      primary_color: isAwning ? awningFabric.hex : primaryColor,
      secondary_color: isAwning ? null : (secondaryColor || null),
      material,
      illumination,
      custom_notes: notes || null,
      estimation_references: signDimensions.referencesUsed,
      estimation_angle_warning: signDimensions.angleWarning,
      selection_quad: quad as SignSpec["selection_quad"],
      // The photo's own aspect ratio at the time the quad was drawn — lets
      // the server interpret selection_quad's normalized coordinates as real
      // proportions (see validateQuadMatchesRatio in lib/sign-geometry.ts).
      image_aspect_ratio: imgDims ? imgDims.w / imgDims.h : undefined,
      // reference style derived from the sign-type / lighting choices
      reference_style: computedReferenceId,
      // Reference-line calibration used to compute the size above — omitted
      // entirely for an AR measurement, which has no reference object at
      // all. Leaving these set on an AR order would persist a meaningless
      // default door height (reference_inches) that was never actually used.
      ...(!arMeasurement && {
        reference_type: referenceType,
        reference_inches: referenceInches,
        // reference (custom ruler/outline mode) and doorCorners (the new
        // tap-4-corners homography mode) are mutually exclusive — only one is
        // ever set for a given order, matching reference_line's own existing
        // shape (2-point ruler mode or 4-point [TL,TR,BR,BL] door mode).
        reference_line: reference ?? doorCorners ?? undefined,
      }),
      ...(isCorner && {
        is_corner: true,
        front_width_inches: signDimensions.frontWidthInches,
        side_width_inches: signDimensions.sideWidthInches,
      }),
      ...(isAwning && {
        awning_frame_style: awningFrame,
        awning_fabric: awningFabric,
      }),
      brand_mode: brandMode,
      ...(logoDataUrl && businessName && { logo_includes_name: logoIncludesName }),
      ...(!isAwning && { font_style: fontStyle }),
      ...(logoColorMatch && { logo_color_match: true }),
      // AI-reported hex(es) for the preview variant the client actually picked
      // — the only concrete color data on file when no swatch was chosen.
      // Best-effort: omitted entirely if that generation never returned one
      // (preview is best-effort and can fail without blocking the order).
      ...(logoColorMatch && previewColorReport && { logo_color_match_hex: previewColorReport }),
      ...(isChannelLetter && {
        has_background: hasBackground,
        ...(hasBackground && !logoColorMatch && {
          bg_material: "aluminum" as const,
          panel_bg_color: {
            name: panelBgColor.name, code: panelBgColor.code, hex: panelBgColor.hex,
          },
        }),
      }),
      ...(colorSystem === "durabond" && {
        ...(!logoColorMatch && { panel_face_color: { name: panelFaceColor.name, code: panelFaceColor.code, hex: panelFaceColor.hex } }),
        channel_lighting: { type: lightingType },
      }),
      ...(colorSystem === "acrylic" && {
        ...(!logoColorMatch && { acrylic_color: { name: acrylicColor.name, code: acrylicColor.code, hex: acrylicColor.hex, finish: acrylicColor.finish } }),
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
      try {
        const result = await createOrder({ photoDataUrl, previewDataUrl, logoDataUrl, signSpec })
        if ("error" in result) {
          setSubmitError(result.error)
        } else {
          router.push(`/order/${result.orderId}?submitted=1`)
        }
      } catch (err) {
        if (isStaleServerActionError(err)) { recoverFromStaleServerAction(); return }
        setSubmitError("Something went wrong submitting your order. Please try again.")
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
                style={active ? { backgroundImage: "var(--gradient-brand)" } : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${active ? "text-white" : done ? "bg-accent/20 text-accent hover:bg-accent/30" : "text-muted-foreground cursor-default"}`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0
                  ${active ? "bg-white/25 text-white" : done ? "bg-accent text-white" : "bg-muted"}`}>
                  {done ? "✓" : i + 1}
                </span>
                {/* Full labels wrap the page into horizontal scroll on narrow phones —
                    show them at sm+ only, except the active step, which keeps its
                    label always visible so mobile users don't lose context. */}
                <span className={active ? "" : "hidden sm:inline"}>{STEP_LABELS[s]}</span>
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
            <h1 className="text-2xl font-semibold">Upload a photo of your storefront</h1>
            <p className="text-muted-foreground mt-1">We use it to measure your sign area and show you an AI preview before any company sees your order.</p>
          </div>
          {photoDataUrl ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoDataUrl} alt="Storefront" className="w-full" />
              </div>
              <button
                type="button"
                onClick={() => { setPhotoDataUrl(null); setCaptureMode("upload"); setQuad(null); setReference(null); setDoorCorners(null); setImgDims(null); setPreviewOptions([]); setPreviewColorReports([]); setLogoDataUrl(null); setArMeasurement(null) }}
                className="py-3 text-xs text-muted-foreground hover:text-foreground underline"
              >
                Use a different photo
              </button>
            </div>
          ) : (
            <>
              {/* A third "Measure with AR" tile only ever renders once arSupported
                  resolves true — on every other device this stays a 2-up grid,
                  identical to before AR existed. */}
              <div className={`grid gap-2 ${arSupported ? "grid-cols-3" : "grid-cols-2"}`}>
                <button
                  type="button"
                  onClick={() => setCaptureMode("upload")}
                  className={`text-left rounded-2xl border-2 px-4 py-3 transition-all ${
                    captureMode === "upload" ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                  }`}
                >
                  <span className="block text-sm font-semibold">Upload a photo</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">Already have one on your phone or computer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode("live")}
                  className={`text-left rounded-2xl border-2 px-4 py-3 transition-all ${
                    captureMode === "live" ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                  }`}
                >
                  <span className="block text-sm font-semibold">Use my camera now</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">At the storefront right now — we'll guide you</span>
                </button>
                {arSupported && (
                  <button
                    type="button"
                    onClick={() => setCaptureMode("ar")}
                    className={`text-left rounded-2xl border-2 px-4 py-3 transition-all ${
                      captureMode === "ar" ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                    }`}
                  >
                    <span className="block text-sm font-semibold">Measure with AR</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">Tap the sign&apos;s corners — we&apos;ll get the exact size</span>
                  </button>
                )}
              </div>
              <PhoneHandoff />
              {captureMode === "ar" ? (
                <ARMeasureCapture
                  onCapture={({ dataUrl, quad: arQuad, widthInches, heightInches, squareness }) => {
                    setPhotoDataUrl(dataUrl)
                    setQuad(arQuad)
                    setReference(null)
                    setDoorCorners(null)
                    setImgDims(null)
                    setPreviewOptions([])
                    setPreviewColorReports([])
                    setLogoDataUrl(null)
                    setArMeasurement({ widthInches, heightInches, squareness })
                    // Push the tapped quad into QuadSelector the moment it mounts on
                    // the quad step — the same one-shot channel the ratio-lock snap
                    // below uses. Without this the client would see QuadSelector's
                    // generic centered default box instead of what they just measured.
                    setQuadSnapTrigger(arQuad)
                  }}
                  onCancel={() => setCaptureMode("upload")}
                />
              ) : captureMode === "live" ? (
                <VideoRulerCapture
                  onCapture={(url) => { setPhotoDataUrl(url); setQuad(null); setReference(null); setDoorCorners(null); setImgDims(null); setPreviewOptions([]); setPreviewColorReports([]); setLogoDataUrl(null); setArMeasurement(null) }}
                  onCancel={() => setCaptureMode("upload")}
                />
              ) : (
                <PhotoUpload onPhoto={(url) => { setPhotoDataUrl(url); setQuad(null); setReference(null); setDoorCorners(null); setImgDims(null); setPreviewOptions([]); setPreviewColorReports([]); setLogoDataUrl(null); setArMeasurement(null) }} />
              )}
            </>
          )}
          {photoDataUrl && (
            <button
              onClick={() => setStep("quad")}
              className="w-full bg-accent text-accent-foreground rounded-2xl py-3 font-semibold hover:opacity-90 transition-opacity"
            >
              Continue → Mark where the sign goes
            </button>
          )}
        </div>
      )}

      {/* ── Step 2: Quad selection + size estimate ── */}
      {step === "quad" && photoDataUrl && (
        <div className="space-y-6">
          {quadSubStep === "area" && (
            <div>
              <h1 className="text-2xl font-semibold">Mark where your sign will go</h1>
              <p className="text-muted-foreground mt-1">Drag the corners of the gold box to outline the sign area — or drag anywhere inside it to move the whole box at once.</p>
            </div>
          )}

          {/* Corner toggle — hidden when perpendicular (blade signs can't wrap a corner)
              or when the current measurement came from AR (ARMeasureCapture only ever
              taps 4 corners of a single flat wall, so there's no second face to fold
              into and nothing to re-measure if this were toggled on).
              Only relevant while marking the area, but stays mounted (just visually
              hidden) the rest of this step so its own state never resets. */}
          <div className={quadSubStep === "area" && !isPerpendicular && !arMeasurement ? "" : "hidden"}>
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={isCorner}
                onChange={e => {
                  setIsCorner(e.target.checked)
                  setQuad(null)
                }}
                className="w-4 h-4 accent-accent"
              />
              <div>
                <p className="text-sm font-medium leading-tight">Corner sign (wraps two walls)</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">Use this if your sign bends around the building corner, covering both the front and side face.</p>
              </div>
            </label>
          </div>

          {/* QuadSelector stays mounted for the whole step (never conditionally
              unmounted) so its internal quad/reference drag state survives moving
              between sub-steps — only its visibility toggles. It's needed again on
              the "placement" screen, after the size/reference questions below —
              except for referenceType === "door", where "placement" instead shows
              a dedicated DoorCornerTap screen below (a focused single-purpose
              capture, not this canvas's combined sign-quad + reference-outline
              view — see DoorCornerTap's own module doc for why). */}
          <div className={quadSubStep === "area" || (quadSubStep === "placement" && referenceType === "custom") ? "" : "hidden"}>
            {/* lockedAspectRatio/lockedFrontRatio/lockedSideRatio below are gated to
                quadSubStep === "placement" only. Locking replaces free 4-corner
                dragging with resize/rotate-only handles — necessary there, since the
                box's own shape IS the reference-calibration measurement, so an
                off-ratio box would silently corrupt it. On "area" the box is just
                rough placement (typed/AR dimensions don't come from its shape at all,
                and quadSnapTrigger below already re-fits it to the correct ratio the
                moment signDimensions changes), so corners stay freely draggable there
                in both flat and corner mode. */}
            <QuadSelector
              imageDataUrl={photoDataUrl}
              corner={isCorner}
              onChange={(q) => setQuad(q)}
              onReferenceChange={(r) => setReference(r)}
              onImageLoad={(w, h) => setImgDims({ w, h })}
              referenceLabel="Reference"
              referenceIcon="ruler"
              showReference={quadSubStep === "placement"}
              lockedAspectRatio={quadSubStep === "placement" && !isCorner && signDimensions ? signDimensions.widthInches / signDimensions.heightInches : undefined}
              lockedFrontRatio={quadSubStep === "placement" && isCorner && signDimensions && signDimensions.frontWidthInches ? signDimensions.frontWidthInches / signDimensions.heightInches : undefined}
              lockedSideRatio={quadSubStep === "placement" && isCorner && signDimensions && signDimensions.sideWidthInches ? signDimensions.sideWidthInches / signDimensions.heightInches : undefined}
              applyQuad={quadSnapTrigger}
              caption={quadSubStep === "placement" ? "Drag anywhere to move it, or drag either end to match your reference object's exact length." : undefined}
            />
            {quadSubStep === "placement" && referenceTooShort && (
              <p className="text-sm text-destructive mt-2">
                The measurement line is too short — drag the ends further apart so we can calculate the scale.
              </p>
            )}
            {quadSubStep === "placement" && geometryResult && (
              <p className="text-sm text-green-700 flex items-center gap-1.5 mt-2">
                <span>✓</span> Lined up — we can calculate your sign's size
              </p>
            )}
          </div>

          {/* Dedicated door-corner-tap screen — replaces the combined
              QuadSelector view above for referenceType === "door". A focused
              single-purpose capture (just the photo + 4 door pins) rather than
              showing the sign quad and the reference simultaneously; the sign
              quad was already drawn during "area" and doesn't need further
              interaction here. */}
          {quadSubStep === "placement" && referenceType === "door" && photoDataUrl && imgDims && (
            <div>
              <DoorCornerTap
                imageDataUrl={photoDataUrl}
                imgDims={imgDims}
                onCorners={(c) => setDoorCorners(c)}
              />
              {doorHomographyFailed && (
                <p className="text-sm text-destructive mt-2">
                  Those corners don&apos;t line up as a real door — try dragging them further apart, or check they&apos;re not all bunched together.
                </p>
              )}
              {homographyResult && (
                <p className="text-sm text-green-700 flex items-center gap-1.5 mt-2">
                  <span>✓</span> Lined up — we can calculate your sign&apos;s size
                </p>
              )}
              {homographyResult && referenceAssumed && (
                <p className="text-xs text-muted-foreground mt-2">
                  This size is a pricing estimate, not accurate enough for production — it&apos;ll be confirmed with an exact measurement (yours or the sign company&apos;s, depending on who installs) before anything is built.
                </p>
              )}
            </div>
          )}

          {quadSubStep === "sizeQuestion" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Do you know your sign's exact size?</h1>
                <p className="text-muted-foreground mt-1">
                  If you&apos;re at the storefront, measuring the wall with a tape measure takes 30 seconds and gives the most accurate quotes. If you can&apos;t, we&apos;ll work it out from your photo instead.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setKnownSize(true); setSizeQuestionAnswered(true) }}
                  className={`text-left rounded-2xl border-2 p-4 transition-all ${
                    sizeQuestionAnswered && knownSize ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                  }`}
                >
                  <span className="block text-sm font-semibold">Yes, I know it</span>
                  <span className="block text-xs text-muted-foreground mt-1">Most accurate — I&apos;ll type the width and height.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setKnownSize(false); setSizeQuestionAnswered(true) }}
                  className={`text-left rounded-2xl border-2 p-4 transition-all ${
                    sizeQuestionAnswered && !knownSize ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                  }`}
                >
                  <span className="block text-sm font-semibold">No, help me measure</span>
                  <span className="block text-xs text-muted-foreground mt-1">We'll use something in your photo to figure it out.</span>
                </button>
              </div>

              <MeasureAppNudge onChooseMeasure={() => { setKnownSize(true); setSizeQuestionAnswered(true) }} />

              {sizeQuestionAnswered && knownSize && (
                <div>
                  <label className="block text-sm font-medium mb-1">Your sign's dimensions</label>
                  <p className="text-xs text-muted-foreground mb-2">We'll use these exact numbers instead of estimating from the photo.</p>
                  {isCorner ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Front width (inches)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={MAX_SIGN_DIMENSION_INCHES}
                            value={knownFrontWidthInches || ""}
                            onChange={e => setKnownFrontWidthInches(e.target.value ? parseFloat(e.target.value) : 0)}
                            placeholder="e.g. 60"
                            className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Side width (inches)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={MAX_SIGN_DIMENSION_INCHES}
                            value={knownSideWidthInches || ""}
                            onChange={e => setKnownSideWidthInches(e.target.value ? parseFloat(e.target.value) : 0)}
                            placeholder="e.g. 36"
                            className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs font-medium mb-1">Height (inches)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={MAX_SIGN_DIMENSION_INCHES}
                          value={knownHeightInches || ""}
                          onChange={e => setKnownHeightInches(e.target.value ? parseFloat(e.target.value) : 0)}
                          placeholder="e.g. 24"
                          className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">Width (inches)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={MAX_SIGN_DIMENSION_INCHES}
                          value={knownWidthInches || ""}
                          onChange={e => setKnownWidthInches(e.target.value ? parseFloat(e.target.value) : 0)}
                          placeholder="e.g. 60"
                          className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Height (inches)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={knownHeightInches || ""}
                          onChange={e => setKnownHeightInches(e.target.value ? parseFloat(e.target.value) : 0)}
                          placeholder="e.g. 24"
                          className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>
                    </div>
                  )}
                  {!manualDimensionsValid && (
                    <p className="text-xs text-destructive mt-2">
                      {isCorner
                        ? "Enter the front width, side width, and height to continue."
                        : "Enter the width and height to continue."}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {quadSubStep === "explain" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Here's how we'll measure it</h1>
                <p className="text-muted-foreground mt-1">
                  We compare your sign area to something in the photo whose real size we know. That gives us the scale to convert everything else into inches.
                </p>
              </div>

              {/* A tape measure beats anything we can do from a photo, so anyone
                  who can measure is pointed at that instead of this flow. */}
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <p className="text-sm font-semibold">Standing at your storefront?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Measuring the wall with a tape measure — or your phone&apos;s built-in Measure app — takes about 30 seconds and is far more accurate than anything we can work out from a photo.
                </p>
                <button
                  type="button"
                  onClick={() => { setKnownSize(true); setSizeQuestionAnswered(true); setQuadSubStep("sizeQuestion") }}
                  className="mt-2 text-xs font-medium text-accent underline"
                >
                  I&apos;ll measure it and type the numbers →
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {referenceType === "door" ? "How tall is your entrance door?" : "How long is the object you'll mark?"}
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  {referenceType === "door"
                    ? "This one number sets the scale for everything else, so it's worth measuring if you can."
                    : "Pick something you know the exact size of, and mark it near the sign area."}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={MAX_REFERENCE_INCHES}
                    value={referenceInches || ""}
                    onChange={e => {
                      setReferenceInches(e.target.value ? parseFloat(e.target.value) : 0)
                      setReferenceInchesEdited(true)
                    }}
                    placeholder={referenceType === "door" ? "e.g. 80" : "e.g. 36"}
                    className="w-32 rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="text-sm text-muted-foreground">inches</span>
                </div>
                {referenceAssumed && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Using {DEFAULT_DOOR_INCHES}&quot; as an estimate — that&apos;s standard for most doors, but commercial entrances are often 84&quot; or taller. We&apos;ll flag your size as an estimate unless you measure it.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = referenceType === "door" ? "custom" : "door"
                    setReferenceType(next)
                    setReference(null)
                    setDoorCorners(null)
                    if (next === "door") {
                      setReferenceInches(DEFAULT_DOOR_INCHES)
                      setReferenceInchesEdited(false)
                    } else {
                      setReferenceInches(0)
                      setReferenceInchesEdited(false)
                    }
                  }}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {referenceType === "door"
                    ? "No door in the photo? Mark something else instead →"
                    : "← Go back to marking a door"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCaptureMode("live")
                  setPhotoDataUrl(null)
                  setQuad(null)
                  setReference(null)
                  setDoorCorners(null)
                  setImgDims(null)
                  setPreviewOptions([])
                  setPreviewColorReports([])
                  setArMeasurement(null)
                  setStep("photo")
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Want to retake the photo with a guided camera? →
              </button>
            </div>
          )}

          {quadSubStep === "placement" && (
            <div>
              <h1 className="text-2xl font-semibold">
                {referenceType === "door" ? "Tap the door's corners" : "Mark your reference object"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {referenceType === "door"
                  ? `Drag the 4 dots onto the real corners of your entrance door — you told us it's ${referenceInches}" tall, and that height sets the scale, so take your time getting each corner exact.`
                  : `Mark the object you measured at ${referenceInches}". Drag either end of the line to match it exactly, and pick something close to the sign area.`}
              </p>
            </div>
          )}

          {quadSubStep === "mount" && (
            <div>
              <p className="text-sm font-medium mb-0.5">How will the sign mount?</p>
              <p className="text-xs text-muted-foreground mb-2">Flat signs sit against the wall. Blade signs stick out over the sidewalk so people see them walking along the street.</p>
              <div className="grid grid-cols-2 gap-2">
                <PictureChoice
                  label="Flat on the wall"
                  description="Faces the street, sits flush"
                  imageSrc="/examples/letters-lighting-bg/Front_Light_day.jpg"
                  selected={!isPerpendicular}
                  onClick={() => setIsPerpendicular(false)}
                />
                <PictureChoice
                  label="Perpendicular (blade)"
                  description="Sticks out from the wall on a bracket"
                  imageSrc="/examples/lightbox-mount/perpendicular.jpg"
                  selected={isPerpendicular}
                  onClick={() => {
                    setIsPerpendicular(true)
                    if (isCorner) {
                      setIsCorner(false)
                      setQuad(null)
                    }
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                if (quadSubStep === "area") setStep("photo")
                else if (quadSubStep === "sizeQuestion") setQuadSubStep("area")
                else if (quadSubStep === "explain") setQuadSubStep("sizeQuestion")
                else if (quadSubStep === "placement") setQuadSubStep("explain")
                else setQuadSubStep(arMeasurement ? "area" : knownSize ? "sizeQuestion" : "placement")
              }}
              className="flex-1 border border-border rounded-2xl py-2.5 text-sm font-medium hover:bg-muted/50"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                // AR already knows the size — skip straight past the
                // sizeQuestion/explain/placement reference sub-steps, which
                // exist only to derive dimensions this capture already has.
                if (quadSubStep === "area") setQuadSubStep(arMeasurement ? "mount" : "sizeQuestion")
                else if (quadSubStep === "sizeQuestion") setQuadSubStep(knownSize ? "mount" : "explain")
                else if (quadSubStep === "explain") setQuadSubStep("placement")
                else if (quadSubStep === "placement") setQuadSubStep("mount")
                else setStep("customize")
              }}
              disabled={
                (quadSubStep === "sizeQuestion" && (!sizeQuestionAnswered || (knownSize && !manualDimensionsValid))) ||
                (quadSubStep === "placement" && !signDimensions) ||
                (quadSubStep === "mount" && !signDimensions)
              }
              className="flex-2 flex-1 bg-accent text-accent-foreground rounded-2xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {quadSubStep === "mount" ? "Continue → Sign Details" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Sign customizer ── */}
      {step === "customize" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Sign details</h1>
            <p className="text-muted-foreground mt-1">These details go straight to the sign companies — they use them to prepare your quotes.</p>
          </div>

          <div className="space-y-5">
            {/* Logo upload */}
            <div>
              <label className="block text-sm font-medium mb-1">Logo <span className="text-muted-foreground font-normal">(optional)</span></label>
              <p className="text-xs text-muted-foreground mb-2">PNG with a transparent background works best. The sign company will color-match fabrication to your logo's real colors.</p>
              {logoDataUrl ? (
                <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoDataUrl} alt="Logo" className="h-10 w-auto object-contain rounded" />
                  <span className="flex-1 text-sm text-foreground font-medium">
                    Logo uploaded
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDataUrl(null)
                      setLogoIncludesName(false)
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
                    <p className="text-xs text-muted-foreground">PNG, JPG, PDF, or SVG</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    className="sr-only"
                    onChange={async e => {
                      const file = e.currentTarget.files?.[0]
                      if (!file) return

                      async function readAsDataUrl(f: File): Promise<string> {
                        return new Promise((resolve, reject) => {
                          const reader = new FileReader()
                          reader.onload = ev => resolve(ev.target?.result as string)
                          reader.onerror = () => reject(reader.error)
                          reader.readAsDataURL(f)
                        })
                      }

                      let url: string
                      try {
                        if (isPdfFile(file)) {
                          url = await pdfFileToLogoDataUrl(file)
                        } else {
                          url = await readAsDataUrl(file)
                        }
                      } catch {
                        toast.error("Couldn't read that logo file — try a PNG, JPG, or PDF.")
                        return
                      }

                      setLogoDataUrl(url)
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
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Joe's Pizza"
                className="w-full rounded-lg border border-border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
                      ? "We'll show the logo only — no separate business name on the sign."
                      : "We'll show your name beside the logo. Check this box if your logo art already spells out the name."}
                  </p>
                </div>
              </label>
            )}

            {/* ── MAIN: What kind of sign? ── */}
            <div>
              <label className="block text-sm font-medium mb-2">What kind of sign? *</label>
              {isPerpendicular ? (
                <div className="flex items-center gap-4 rounded-2xl border border-border px-4 py-3 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/examples/sign-type/Light_box.png"
                    alt="Light Box"
                    className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold leading-tight">Light Box (blade sign)</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-1">Projecting blade signs are built as double-sided light boxes. To change this, go back and switch the mount to flat.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <PictureChoice
                    imageSrc="/examples/sign-type/Letters.jpg"
                    label="Letters"
                    description="Channel letters or flat-cut dimensional signage"
                    selected={signCategory === "letters"}
                    onClick={() => { setSignCategory("letters"); setIsLit(null) }}
                  />
                  <PictureChoice
                    imageSrc="/examples/sign-type/Light_box.png"
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
              )}
            </div>

            {/* ── LETTERS ── */}
            {signCategory === "letters" && (
              <>

                {/* Background panel choice */}
                <div>
                  <label className="block text-sm font-medium mb-2">Background panel</label>
                  <div className="grid grid-cols-2 gap-3">
                    <PictureChoice
                      imageSrc="/examples/background/with-panel.jpg"
                      label="With background"
                      description="Letters on a finished backer panel"
                      selected={hasBackground}
                      onClick={() => setHasBackground(true)}
                      recommended
                    />
                    <PictureChoice
                      imageSrc="/examples/background/letters-only.jpg"
                      label="Letters only"
                      description="Letters mounted directly on the wall"
                      selected={!hasBackground}
                      onClick={() => setHasBackground(false)}
                    />
                  </div>
                </div>

                {/* Background colors (right after toggle, when has_background) */}
                {hasBackground && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Background color</label>
                    {logoColorMatch ? (
                      <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-muted/30">
                        <span className="text-sm text-muted-foreground">Will be color-matched to your logo exactly — no need to choose.</span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          {[
                            { color: DURABOND_COLORS.find(c => c.code === "DB-03"), imageSrc: "/examples/background/Letters_White.jpg" },
                            { color: DURABOND_COLORS.find(c => c.code === "DB-35"), imageSrc: "/examples/background/Letters_Gray.jpg" },
                            { color: DURABOND_COLORS.find(c => c.code === "DB-13"), imageSrc: "/examples/background/Letters_Black_no light.jpg" },
                          ].filter(c => c.color).map(({ color: c, imageSrc }) => (
                            <PictureChoice
                              key={c!.code}
                              imageSrc={imageSrc}
                              label={c!.name}
                              selected={panelBgColor.code === c!.code}
                              onClick={() => setPanelBgColor(c!)}
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
                      </>
                    )}
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
                      <p className="text-xs text-muted-foreground mb-3">Choose how the light comes through the letters.</p>
                      <div className={`grid gap-2 ${hasBackground ? "grid-cols-3" : "grid-cols-2"}`}>
                        {!hasBackground ? (
                          <>
                            <PictureChoice key="nobg-front" imageSrc="/examples/letters-lighting-nobg/front_day.jpg" nightImageSrc="/examples/letters-lighting-nobg/front.jpg" defaultNight label="Front" description="Light on the face" selected={lightingStyle === "front"} onClick={() => setLightingStyle("front")} />
                            <PictureChoice key="nobg-back" imageSrc="/examples/letters-lighting-nobg/back_day.jpg" nightImageSrc="/examples/letters-lighting-nobg/back.jpg" defaultNight label="Back" description="Halo glow behind" selected={lightingStyle === "back"} onClick={() => setLightingStyle("back")} />
                            <PictureChoice key="nobg-front_back" imageSrc="/examples/letters-lighting-nobg/front_back_day.jpg" nightImageSrc="/examples/letters-lighting-nobg/front_back.jpg" defaultNight label="Front + Back" description="Light both ways" selected={lightingStyle === "front_back"} onClick={() => setLightingStyle("front_back")} />
                            <PictureChoice key="nobg-full" imageSrc="/examples/letters-lighting-nobg/full_day.jpg" nightImageSrc="/examples/letters-lighting-nobg/full.jpg" defaultNight label="Full surround" description="All-around glow" selected={lightingStyle === "full"} onClick={() => setLightingStyle("full")} />
                          </>
                        ) : (
                          <>
                            <PictureChoice key="bg-back" imageSrc="/examples/letters-lighting-bg/Back_Light_day.jpg" nightImageSrc="/examples/letters-lighting-bg/back_light_night.jpg" defaultNight label="Back" description="Panel glow" selected={lightingStyle === "back"} onClick={() => setLightingStyle("back")} />
                            <PictureChoice key="bg-front" imageSrc="/examples/letters-lighting-bg/Front_Light_day.jpg" nightImageSrc="/examples/letters-lighting-bg/front_light_night.jpg" defaultNight label="Front" description="Lit face only" selected={lightingStyle === "front"} onClick={() => setLightingStyle("front")} />
                            <PictureChoice key="bg-side" imageSrc="/examples/letters-lighting-bg/Side_Light_day.jpg" nightImageSrc="/examples/letters-lighting-bg/Side_light_night.jpg" defaultNight label="Side" description="Edge glow" selected={lightingStyle === "back_side"} onClick={() => setLightingStyle("back_side")} />
                            <PictureChoice key="bg-front_back" imageSrc="/examples/letters-lighting-bg/Back_Front_Light_day.jpg" nightImageSrc="/examples/letters-lighting-bg/front_back_night.jpg" defaultNight label="Front + Back" description="Both directions" selected={lightingStyle === "front_back"} onClick={() => setLightingStyle("front_back")} />
                            <PictureChoice key="bg-full" imageSrc="/examples/letters-lighting-bg/Full_light_day.jpg" nightImageSrc="/examples/letters-lighting-bg/Full_light_night.jpg" defaultNight label="Full light" description="All-around" selected={lightingStyle === "full"} onClick={() => setLightingStyle("full")} />
                            <PictureChoice key="bg-front_side" imageSrc="/examples/letters-lighting-bg/Front_Side_ligth_day.jpg" nightImageSrc="/examples/letters-lighting-bg/front_side_night.jpg" defaultNight label="Front + Side" description="Face & side glow" selected={lightingStyle === "front_side"} onClick={() => setLightingStyle("front_side")} />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Letter color (full acrylic palette) */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Letter color</label>
                      {logoColorMatch ? (
                        <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-muted/30">
                          <span className="text-sm text-muted-foreground">Will be color-matched to your logo exactly — no need to choose.</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-6 gap-2">
                          {ACRYLIC_COLORS.map(c => (
                            <button
                              key={`${c.code}-${c.finish}`}
                              type="button"
                              title={`${c.name} #${c.code}`}
                              onClick={() => { setAcrylicColor(c); setSignMaterial("acrylic"); setPrimaryColor(c.hex) }}
                              className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                                ${primaryColor === c.hex ? "border-accent scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                            >
                              <div className="w-full h-full" style={{ background: c.hex, opacity: c.finish === "translucent" ? 0.75 : c.finish === "transparent" ? 0.55 : 1 }} />
                              {primaryColor === c.hex && <div className="absolute inset-0 flex items-center justify-center"><span className="text-white text-sm drop-shadow">✓</span></div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Advanced: warmth + colorful — dark panel throughout so the
                        light-warmth glow reads correctly against darkness */}
                    <details className="border border-white/10 bg-zinc-900 rounded-2xl overflow-hidden group">
                      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium text-white select-none hover:bg-white/5">
                        <span>Advanced lighting settings</span>
                        <span className="text-xs text-white/50 group-open:hidden">show</span>
                        <span className="text-xs text-white/50 hidden group-open:inline">hide</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">Light warmth</label>
                          <LightWarmthSlider value={lightWarmth} onChange={setLightWarmth} />
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={lightColorful}
                            onChange={e => setLightColorful(e.target.checked)}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-sm font-medium text-white">Multicolor RGB LED (programmable colors)</span>
                        </label>
                      </div>
                    </details>
                  </>
                )}

                {/* Letter color (aluminum only, if no light) — a logo doesn't
                    auto-match here: no-light letters keep a manual color pick. */}
                {isLit === false && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Letter color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {DURABOND_COLORS.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          title={c.name}
                          onClick={() => { setPanelFaceColor(c); setSignMaterial("aluminum"); setPrimaryColor(c.hex) }}
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
                    {isPerpendicular ? (
                      <>
                        {/* Blade mount — projecting versions so the photos match the chosen mount */}
                        <PictureChoice
                          key="blade-cabinet"
                          imageSrc="/examples/lightbox-mount/perpendicular.jpg"
                          nightImageSrc="/examples/lightbox-mount/perpendicular_night.jpg"
                          defaultNight
                          label="Cabinet"
                          description="Double-sided backlit box on a bracket"
                          selected={lightBoxType === "cabinet"}
                          onClick={() => setLightBoxType("cabinet")}
                          recommended
                        />
                        <PictureChoice
                          key="blade-seethrough"
                          imageSrc="/examples/lightbox-mount/perpendicular_seethrough.jpg"
                          nightImageSrc="/examples/lightbox-mount/perpendicular_seethrough_night.jpg"
                          defaultNight
                          label="See-through letters"
                          description="Lit letters visible from both directions"
                          selected={lightBoxType === "seethrough_letters"}
                          onClick={() => setLightBoxType("seethrough_letters")}
                        />
                      </>
                    ) : (
                      <>
                        <PictureChoice
                          key="flat-cabinet"
                          imageSrc="/examples/lightbox-type/Light_box_day.png"
                          nightImageSrc="/examples/lightbox-type/Light_box_night.png"
                          defaultNight
                          label="Cabinet"
                          description="Backlit box with cutout letters"
                          selected={lightBoxType === "cabinet"}
                          onClick={() => setLightBoxType("cabinet")}
                          recommended
                        />
                        <PictureChoice
                          key="flat-seethrough"
                          imageSrc="/examples/lightbox-type/Light_box_seethrough.png"
                          nightImageSrc="/examples/lightbox-type/Light_box_seethrough_night.png"
                          defaultNight
                          label="See-through letters"
                          description="Transparent letters on a lit panel"
                          selected={lightBoxType === "seethrough_letters"}
                          onClick={() => setLightBoxType("seethrough_letters")}
                        />
                      </>
                    )}
                  </div>
                </div>


                <details className="border border-border rounded-2xl overflow-hidden group">
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

                {logoColorMatch ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">Color</label>
                    <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-muted/30">
                      <span className="text-sm text-muted-foreground">Will be color-matched to your logo exactly — no need to choose.</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">Color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {lightBoxType === "cabinet"
                        ? ACRYLIC_COLORS.map(c => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => { setAcrylicColor(c); setSignMaterial("acrylic"); setPrimaryColor(c.hex) }}
                              className={`aspect-square rounded-lg border-2 transition-all ${
                                primaryColor === c.hex ? "border-accent scale-105" : "border-transparent hover:border-border"
                              }`}
                              style={{ background: c.hex, opacity: c.finish === "translucent" ? 0.75 : 1 }}
                              title={c.name}
                            />
                          ))
                        : DURABOND_COLORS.map(c => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => { setPanelFaceColor(c); setSignMaterial("aluminum"); setPrimaryColor(c.hex) }}
                              className={`aspect-square rounded-lg border-2 transition-all ${
                                primaryColor === c.hex ? "border-accent scale-105" : "border-transparent hover:border-border"
                              }`}
                              style={{ background: c.hex }}
                              title={c.name}
                            />
                          ))
                      }
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── AWNING ── */}
            {signCategory === "awning" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Will it be lit at night?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <PictureChoice
                      imageSrc="/examples/awning-lighting/light_day.jpg"
                      nightImageSrc="/examples/awning-lighting/night.jpg"
                      defaultNight
                      label="With lighting"
                      description="Glows at night"
                      selected={awningIllumination === "internal_led"}
                      onClick={() => setAwningIllumination("internal_led")}
                      recommended
                    />
                    <PictureChoice
                      imageSrc="/examples/awning-lighting/day.jpg"
                      nightImageSrc="/examples/awning-lighting/no_light_night.jpg"
                      defaultNight
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
                    {visibleColors.map(c => (
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
                  <button
                    type="button"
                    onClick={() => setShowAllColors(v => !v)}
                    className="mt-2 text-xs text-accent font-medium hover:underline"
                  >
                    {showAllColors ? "Show fewer ▴" : `Show all ${SUNBRELLA_COLORS.length} colors ▾`}
                  </button>
                </div>

                <details className="border border-border rounded-2xl overflow-hidden group">
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
            <details className="border border-border rounded-2xl overflow-hidden group">
              <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium select-none hover:bg-muted/40">
                <span>Advanced AI settings</span>
                <span className="text-xs text-muted-foreground group-open:hidden">show</span>
                <span className="text-xs text-muted-foreground hidden group-open:inline">hide</span>
              </summary>
              <div className="px-4 pb-4 space-y-2">
                <label className="block text-sm font-medium">Extra instructions for the AI preview</label>
                <p className="text-xs text-muted-foreground">
                  Sent directly to the AI. Use this to fine-tune the render — for example, keep the logo untouched, change the mounting detail, or adjust the background.
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
                    <label className="block text-xs font-medium text-muted-foreground">Full prompt we send to the AI</label>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(assembledPrompt)}
                      className="py-3.5 pl-3 -mr-3 -my-2.5 text-xs text-accent font-medium hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                    {assembledPrompt}
                  </pre>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Updates live as you change options above. Your extra instructions are added at the end.
                  </p>
                </div>
              </div>
            </details>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("quad")} className="flex-1 border border-border rounded-2xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={() => { setStep("preview"); runPreview() }}
              disabled={!businessName || !signCategory || (signCategory === "letters" && isLit === null)}
              className="flex-1 bg-accent text-accent-foreground rounded-2xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue → AI Preview
            </button>
          </div>
        </div>
      )}
      {step === "preview" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">AI sign preview</h1>
            <p className="text-muted-foreground mt-1">Here's how your sign could look on your building — pick the option you like best.</p>
          </div>

          {generating && (
            <div className="border border-border rounded-2xl p-12 text-center space-y-3">
              <div className="text-4xl animate-pulse">🎨</div>
              <p className="font-medium">Generating your preview…</p>
              <p className="text-sm text-muted-foreground">Creating 3 options — this usually takes about 60 seconds.</p>
            </div>
          )}

          {!generating && previewSkipped && (
            <div className="border border-border rounded-2xl p-8 text-center space-y-3">
              <div className="text-4xl">📋</div>
              <p className="font-medium">Preview not available</p>
              <p className="text-sm text-muted-foreground">
                We weren't able to generate a preview for this order. Sign companies will still be able to quote your job.
              </p>
            </div>
          )}

          {!generating && generateError && (
            <div className="border border-destructive/30 bg-destructive/10 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-medium text-destructive">Preview couldn't be generated</p>
              <p className="text-sm text-destructive">{generateError}</p>
              <button onClick={runPreview} className="text-sm text-accent font-medium hover:underline">
                Try again
              </button>
            </div>
          )}

          {!generating && previewOptions.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Choose an option to include with your order:</p>
              <div className="grid grid-cols-1 gap-3">
                {previewOptions.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPreviewIdx(i)}
                    className={`relative rounded-2xl overflow-hidden border-2 transition-colors text-left ${
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
                  AI-generated previews. The actual sign may look different — your sign company takes precise measurements on-site.
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
              <button onClick={() => setStep("customize")} className="flex-1 border border-border rounded-2xl py-2.5 text-sm font-medium hover:bg-muted/50">
                ← Back
              </button>
              <button
                onClick={() => {
                  // A client can continue past a failed/empty preview without
                  // retrying — flag it so the review step shows the reassuring
                  // "no preview, but quotes still work" message instead of nothing.
                  if (previewOptions.length === 0) setPreviewSkipped(true)
                  setStep("review")
                }}
                className="flex-1 bg-accent text-accent-foreground rounded-2xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Continue → Review your order
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Review & Submit ── */}
      {step === "review" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Review & submit</h1>
            <p className="text-muted-foreground mt-1">
              {previewDataUrl
                ? "Here's the sign you're ordering — check the details below, then send it out for quotes."
                : "Check your details below, then send your order out for quotes."}
            </p>
          </div>

          {/* ── Selected AI preview — shown up front so the client sees the actual
              sign before the spec list, instead of a buried "Included ✓" row ── */}
          {previewDataUrl ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewDataUrl}
                alt="Your selected sign preview"
                className="w-full rounded-2xl border border-border"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                AI-generated preview — your sign company will confirm exact details on-site.
              </p>
            </div>
          ) : previewSkipped ? (
            <div className="border border-border rounded-2xl p-4 text-sm text-muted-foreground bg-muted/30">
              A preview wasn't generated for this order — sign companies will still quote based on the details below.
            </div>
          ) : null}

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
                <span className="block text-[11px] text-muted-foreground mt-1">The sign company makes and mounts the sign on your building.</span>
              </button>
              <button
                type="button"
                onClick={() => { setNeedsInstallation(false); setCoiRequired(null); setCoiAmount(null) }}
                className={`text-left rounded-lg border-2 p-3 transition-all ${
                  needsInstallation === false ? "border-accent bg-accent/10" : "border-border hover:border-accent/40"
                }`}
              >
                <span className="block text-sm font-semibold">I'll install it myself</span>
                <span className="block text-[11px] text-muted-foreground mt-1">The sign company makes and ships it; you handle mounting.</span>
              </button>
            </div>

            {/* Soft, non-blocking nudge for self-install */}
            {needsInstallation === false && (
              <p className="mt-2 text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
                Worth checking — many landlords require proof of insurance even when the tenant arranges the install. Review your lease first, and if needed, switch to "Install it for me" above.
              </p>
            )}
          </div>

          {/* ── Insurance (only when the SC installs) ── */}
          {needsInstallation === true && (
            <div>
              <label className="block text-sm font-medium mb-2">Does your building require the installer to carry insurance?</label>
              <p className="text-xs text-muted-foreground mb-2">Many commercial landlords ask for a Certificate of Insurance (COI) before anyone installs a sign.</p>
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
                  That's fine — the sign company will confirm this with you before work starts.
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

          <div className="border border-border rounded-2xl divide-y divide-border">
            <Row label="Business name" value={businessName} />
            <Row label="Sign style" value={
              <span className="flex items-center gap-1.5">
                {selectedReference.name}
                {isCorner && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">corner</span>}
              </span>
            } />
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
                {logoColorMatch ? (
                  <Row label="Color" value={
                    previewColorReport ? (
                      <span className="flex items-center gap-2 flex-wrap">
                        {previewColorReport.letters && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: previewColorReport.letters }} />
                            {previewColorReport.letters}
                          </span>
                        )}
                        {previewColorReport.panel && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: previewColorReport.panel }} />
                            {previewColorReport.panel} panel
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">AI-estimated from your logo — verify before fabrication</span>
                      </span>
                    ) : (
                      <span className="text-accent">Matched to your logo exactly — no swatch chosen</span>
                    )
                  } />
                ) : (
                  <>
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
                  </>
                )}
                {isChannelLetter && (
                  <Row label="Background" value={
                    hasBackground ? (
                      logoColorMatch ? (
                        <span className="text-accent">Matched to your logo</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded border border-border inline-block" style={{ background: panelBgColor.hex }} />
                          {panelBgColor.name} · aluminum panel
                        </span>
                      )
                    ) : "Letters only (no panel)"
                  } />
                )}
                <Row label="Lighting" value={
                  computedReferenceId === "no-light-outdoor" ? "No illumination"
                  : signCategory === "letters" ? (LIGHTING_STYLE_LABELS[lightingStyle] ?? "Front-lit")
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
          </div>

          <div className="border border-border rounded-2xl p-4 text-sm text-muted-foreground space-y-1">
            <p>🕐 Sign companies have <strong>24 hours</strong> to submit quotes.</p>
            <p>💳 You're not charged until you accept a quote.</p>
            {needsInstallation === true && <p>📐 The sign company will measure on-site before making your sign.</p>}
          </div>

          {/* Self-install has no professional site visit to catch a bad
              photo-based estimate before installation, so the client's own
              measurement has to BE the final number (see handleSubmit's
              matching hard guard). Fixable right here instead of sending the
              client back to an earlier step — same fields, same state, as
              the "Yes, I know it" input on the size-question step. */}
          {needsInstallation === false && !knownSize && (
            <div className="border border-destructive/40 bg-destructive/5 rounded-2xl p-4 space-y-3">
              <p className="text-sm text-destructive">
                Since you&apos;re installing this yourself, we need your own exact measurement — the estimate from your photo isn&apos;t accurate enough to fabricate from.
              </p>
              {isCorner ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Front width (inches)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_SIGN_DIMENSION_INCHES}
                        value={knownFrontWidthInches || ""}
                        onChange={e => { setKnownFrontWidthInches(e.target.value ? parseFloat(e.target.value) : 0); setKnownSize(true) }}
                        placeholder="e.g. 60"
                        className="w-full rounded-lg border border-border px-3 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Side width (inches)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_SIGN_DIMENSION_INCHES}
                        value={knownSideWidthInches || ""}
                        onChange={e => { setKnownSideWidthInches(e.target.value ? parseFloat(e.target.value) : 0); setKnownSize(true) }}
                        placeholder="e.g. 36"
                        className="w-full rounded-lg border border-border px-3 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Height (inches)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_SIGN_DIMENSION_INCHES}
                      value={knownHeightInches || ""}
                      onChange={e => { setKnownHeightInches(e.target.value ? parseFloat(e.target.value) : 0); setKnownSize(true) }}
                      placeholder="e.g. 24"
                      className="w-full rounded-lg border border-border px-3 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Width (inches)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_SIGN_DIMENSION_INCHES}
                      value={knownWidthInches || ""}
                      onChange={e => { setKnownWidthInches(e.target.value ? parseFloat(e.target.value) : 0); setKnownSize(true) }}
                      placeholder="e.g. 60"
                      className="w-full rounded-lg border border-border px-3 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Height (inches)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_SIGN_DIMENSION_INCHES}
                      value={knownHeightInches || ""}
                      onChange={e => { setKnownHeightInches(e.target.value ? parseFloat(e.target.value) : 0); setKnownSize(true) }}
                      placeholder="e.g. 24"
                      className="w-full rounded-lg border border-border px-3 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("preview")} className="flex-1 border border-border rounded-2xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !requirementsComplete}
              className="rounded-full flex-1 text-white py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {submitting ? "Submitting…" : "Submit for Quotes →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Guest capture / inline login modal ── */}
      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            {authModalMode === "guest" ? (
              <>
                <h2 className="text-lg font-bold mb-1">One quick step</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  We need your contact details so sign companies can send you quotes.
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
                      className="w-full rounded-2xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
                      className="w-full rounded-2xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
                      className="w-full rounded-2xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  {guestError && <p className="text-sm text-destructive">{guestError}</p>}
                  <button
                    onClick={handleGuestSubmit}
                    disabled={guestSubmitting}
                    className="w-full bg-accent text-accent-foreground rounded-2xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {guestSubmitting ? "Setting up…" : "Generate my preview"}
                  </button>
                  <p className="text-xs text-center text-muted-foreground">
                    By continuing you agree to receive sign quotes at the number above.
                  </p>
                  <p className="text-sm text-center text-muted-foreground pt-1">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthModalMode("login"); setGuestError(null) }}
                      className="text-accent font-medium hover:underline"
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-1">Welcome back</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  Log in to continue generating your preview.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleInlineLogin()}
                      placeholder="jane@example.com"
                      autoFocus
                      autoComplete="email"
                      className="w-full rounded-2xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleInlineLogin()}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-2xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                  <button
                    onClick={handleInlineLogin}
                    disabled={loginSubmitting}
                    className="w-full bg-accent text-accent-foreground rounded-2xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {loginSubmitting ? "Logging in…" : "Log in & generate my preview"}
                  </button>
                  <p className="text-sm text-center text-muted-foreground pt-1">
                    New here?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthModalMode("guest"); setLoginError(null) }}
                      className="text-accent font-medium hover:underline"
                    >
                      Continue as guest
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-xs">{value}</span>
    </div>
  )
}
