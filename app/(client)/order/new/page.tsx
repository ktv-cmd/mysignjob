"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import PhotoUpload from "@/components/order/PhotoUpload"
import QuadSelector, { type QuadPoint } from "@/components/order/QuadSelector"
import { createOrder } from "@/app/actions/order"
import { formatDimensions } from "@/lib/utils"
import type { SignType, SignMaterial, IlluminationType, SignSpec, AwningFrameStyle, SunbrellaFabric } from "@/types"

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
  confidence: "high" | "medium" | "low"
  referencesUsed: string[]
  angleWarning: boolean
  reasoning: string
}

const SIGN_TYPES: { value: SignType; label: string; preview: boolean }[] = [
  { value: "channel_letters", label: "Channel Letters", preview: true },
  { value: "cabinet",         label: "Cabinet / Lightbox", preview: true },
  { value: "flat_cut",        label: "Flat Cut Letters", preview: true },
  { value: "blade",           label: "Blade Sign", preview: true },
  { value: "window_vinyl",    label: "Window Vinyl", preview: true },
  { value: "monument",        label: "Monument Sign", preview: false },
  { value: "pylon",           label: "Pylon Sign", preview: false },
  { value: "awning",          label: "Awning", preview: false },
  { value: "other",           label: "Other", preview: false },
]

const ILLUMINATION_OPTS: { value: IlluminationType; label: string }[] = [
  { value: "none",         label: "No lighting (day only)" },
  { value: "internal_led", label: "Front-lit LED (glowing faces)" },
  { value: "halo",         label: "Back-lit halo glow" },
  { value: "external",     label: "External floodlight" },
]

const MATERIAL_OPTS: { value: SignMaterial; label: string }[] = [
  { value: "aluminum", label: "Aluminum" },
  { value: "acrylic",  label: "Acrylic" },
  { value: "vinyl",    label: "Vinyl" },
  { value: "steel",    label: "Steel" },
  { value: "wood",     label: "Wood" },
]

// ── Awning frame styles (industry standard — most common is "standard" shed slope)
const AWNING_FRAMES: { value: AwningFrameStyle; label: string; desc: string; aiPhrase: string }[] = [
  { value: "standard_valence", label: "Standard w/ Valence", desc: "Sloped + front valence drop", aiPhrase: "traditional slope awning with a front valence drop" },
  { value: "standard",         label: "Standard",            desc: "Classic slope — most common", aiPhrase: "classic slope shed awning" },
  { value: "arch",             label: "Arch",                desc: "Curved top, flat base",       aiPhrase: "arched curved-top awning" },
  { value: "bullnose",         label: "Bullnose",            desc: "Rounded convex front",        aiPhrase: "bullnose convex-front rounded awning" },
  { value: "dome",             label: "Dome",                desc: "Full semicircle dome",        aiPhrase: "full dome semicircular awning" },
  { value: "circular",         label: "Circular",            desc: "Gentle half-barrel curve",    aiPhrase: "circular barrel-curved awning" },
  { value: "gable",            label: "Gable",               desc: "Peaked ridge roof shape",     aiPhrase: "gable peaked-ridge awning" },
  { value: "half_round",       label: "Half Round",          desc: "Arched with swept sides",     aiPhrase: "half-round arch awning with swept sides" },
  { value: "quarter_round",    label: "Quarter Round",       desc: "Quarter-circle from wall",    aiPhrase: "quarter-round curved awning projecting from wall" },
  { value: "concave",          label: "Concave",             desc: "Inward curved, dramatic flair",aiPhrase: "concave inward-curved awning" },
  { value: "waterfall",        label: "Waterfall",           desc: "Sweeping cascade curve",      aiPhrase: "waterfall cascading curved awning" },
  { value: "box",              label: "Box",                 desc: "Flat top, boxy profile",      aiPhrase: "flat-top box awning with straight returns" },
]

// ── Sunbrella Awning/Marine Grade solid fabric palette (10-yr warranty, weatherproof)
// Codes are official Sunbrella SKU prefixes; hex values are visual approximations for swatches.
const SUNBRELLA_COLORS: SunbrellaFabric[] = [
  { name: "Natural",        code: "4604", hex: "#F2EFE4" },
  { name: "White",          code: "4634", hex: "#FAFAFA" },
  { name: "Parchment",      code: "6083", hex: "#E5DCC3" },
  { name: "Beige",          code: "4620", hex: "#D9CDB3" },
  { name: "Toast",          code: "4628", hex: "#8B6B56" },
  { name: "Cocoa",          code: "6076", hex: "#5C4232" },
  { name: "Walnut Brown",   code: "4618", hex: "#5C4B3B" },
  { name: "Terracotta",     code: "4622", hex: "#A84E34" },
  { name: "Orange",         code: "6009", hex: "#D2622A" },
  { name: "Sunflower",      code: "4602", hex: "#E0A92B" },
  { name: "Erin Green",     code: "6000", hex: "#2E6B3E" },
  { name: "Basil",          code: "4688", hex: "#3E5641" },
  { name: "Forest Green",   code: "4637", hex: "#1F3D2B" },
  { name: "Sky Blue",       code: "6024", hex: "#5B8FB9" },
  { name: "Pacific Blue",   code: "4601", hex: "#1C3F6E" },
  { name: "Royal Blue",     code: "4617", hex: "#2E4A7A" },
  { name: "Sapphire Blue",  code: "6041", hex: "#1B4F8A" },
  { name: "Navy",           code: "6026", hex: "#1E2A44" },
  { name: "Burgundy",       code: "4631", hex: "#5C1A2B" },
  { name: "Black Cherry",   code: "6040", hex: "#4A1C28" },
  { name: "Silver",         code: "4651", hex: "#B8BCC0" },
  { name: "Cadet Grey",     code: "6030", hex: "#8A9499" },
  { name: "Slate",          code: "4684", hex: "#4D5358" },
  { name: "Black",          code: "4608", hex: "#1C1C1C" },
]

const DEFAULT_AWNING_FABRIC = SUNBRELLA_COLORS.find(c => c.code === "4601")! // Pacific Blue

export default function NewOrderPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("photo")
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [quad, setQuad] = useState<QuadPoint[] | null>(null)
  const [sizeResult, setSizeResult] = useState<SizeResult | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [previewSkipped, setPreviewSkipped] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [regenCount, setRegenCount] = useState(0)
  const [submitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Sign spec fields
  const [signType, setSignType] = useState<SignType>("channel_letters")
  const [businessName, setBusinessName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#1C1C1C")
  const [secondaryColor, setSecondaryColor] = useState("")
  const [material, setMaterial] = useState<SignMaterial>("aluminum")
  const [illumination, setIllumination] = useState<IlluminationType>("none")
  const [notes, setNotes] = useState("")
  // Awning-specific
  const [awningFrame, setAwningFrame] = useState<AwningFrameStyle>("standard")
  const [awningFabric, setAwningFabric] = useState<SunbrellaFabric>(DEFAULT_AWNING_FABRIC)

  const stepIdx = STEPS.indexOf(step)

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
    setPreviewDataUrl(null)
    setPreviewSkipped(false)
    try {
      const res = await fetch("/api/order/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: photoDataUrl, quad, signType, businessName,
          primaryColor: signType === "awning" ? awningFabric.hex : primaryColor,
          illumination,
          awningFrame: signType === "awning" ? awningFrame : undefined,
          fabricName: signType === "awning" ? `${awningFabric.name} (Sunbrella ${awningFabric.code})` : undefined,
        }),
      })
      const data = await res.json()
      if (data.skipped) { setPreviewSkipped(true); return }
      if (!res.ok) throw new Error(data.error ?? "Preview generation failed")
      setPreviewDataUrl(data.previewDataUrl)
      setRegenCount(c => c + 1)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Preview generation failed")
    } finally {
      setGenerating(false)
    }
  }

  function goTo(s: Step) {
    if (s === "quad" && !photoDataUrl) return
    if (s === "customize" && !quad) return
    if (s === "preview" && (!businessName || !signType)) return
    setStep(s)
  }

  function handleSubmit() {
    if (!photoDataUrl || !quad || !sizeResult || !businessName) return
    setSubmitError(null)

    const signSpec: SignSpec = {
      sign_type: signType,
      width_inches: sizeResult.widthInches,
      height_inches: sizeResult.heightInches,
      width_confidence: sizeResult.confidence,
      business_name: businessName,
      primary_color: signType === "awning" ? awningFabric.hex : primaryColor,
      secondary_color: signType === "awning" ? null : (secondaryColor || null),
      material: signType === "awning" ? "vinyl" : material, // fabric replaces material for awnings
      illumination,
      custom_notes: notes || null,
      estimation_references: sizeResult.referencesUsed,
      estimation_angle_warning: sizeResult.angleWarning,
      selection_quad: quad as SignSpec["selection_quad"],
      ...(signType === "awning" && {
        awning_frame_style: awningFrame,
        awning_fabric: awningFabric,
      }),
    }

    startSubmit(async () => {
      const result = await createOrder({ photoDataUrl, previewDataUrl, signSpec })
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
          <PhotoUpload onPhoto={(url) => { setPhotoDataUrl(url); setQuad(null); setSizeResult(null); setPreviewDataUrl(null) }} />
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
          <QuadSelector
            imageDataUrl={photoDataUrl}
            onChange={(q) => {
              setQuad(q)
              setSizeResult(null)
            }}
          />

          {/* Run size estimate */}
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
                  <p className="font-semibold text-lg">
                    {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                  </p>
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
            <div>
              <label className="block text-sm font-medium mb-2">Business name on the sign *</label>
              <input
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Joe's Pizza"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Sign type *</label>
              <div className="grid grid-cols-3 gap-2">
                {SIGN_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSignType(t.value)}
                    className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors
                      ${signType === t.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                  >
                    {t.label}
                    {!t.preview && <span className="block text-[10px] text-muted-foreground">No AI preview</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Awning-specific options ── */}
            {signType === "awning" ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Frame style</label>
                  <p className="text-xs text-muted-foreground mb-2">Choose the awning profile shape. <span className="font-medium">Standard</span> is the most common for storefronts.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {AWNING_FRAMES.map(f => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setAwningFrame(f.value)}
                        className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors
                          ${awningFrame === f.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                      >
                        <span className="block font-medium">{f.label}</span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">{f.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Sunbrella® fabric color</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Commercial-grade awning fabric — 10-yr warranty, UV & weather resistant.
                    Selected: <span className="font-medium">{awningFabric.name}</span>
                    <span className="text-muted-foreground"> · #{awningFabric.code}</span>
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {SUNBRELLA_COLORS.map(c => (
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
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-border flex-shrink-0" style={{ background: awningFabric.hex }} />
                    <span className="text-sm font-medium">{awningFabric.name}</span>
                    <span className="text-xs text-muted-foreground">Sunbrella® {awningFabric.code}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Illumination</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "none" as IlluminationType, label: "No lighting (day only)" },
                      { value: "external" as IlluminationType, label: "External floodlight" },
                    ].map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setIllumination(o.value)}
                        className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors
                          ${illumination === o.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Primary color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={e => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded border border-border cursor-pointer"
                      />
                      <input
                        value={primaryColor}
                        onChange={e => setPrimaryColor(e.target.value)}
                        className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Secondary color <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor || "#ffffff"}
                        onChange={e => setSecondaryColor(e.target.value)}
                        className="w-10 h-10 rounded border border-border cursor-pointer"
                      />
                      <input
                        value={secondaryColor}
                        onChange={e => setSecondaryColor(e.target.value)}
                        placeholder="#ffffff"
                        className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Illumination</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ILLUMINATION_OPTS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setIllumination(o.value)}
                        className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors
                          ${illumination === o.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Material preference</label>
                  <div className="flex flex-wrap gap-2">
                    {MATERIAL_OPTS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setMaterial(o.value)}
                        className={`rounded-full px-3 py-1 text-xs border transition-colors
                          ${material === o.value ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted/50"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
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

          <div className="flex gap-3">
            <button onClick={() => setStep("quad")} className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50">
              ← Back
            </button>
            <button
              onClick={() => { setStep("preview"); runPreview() }}
              disabled={!businessName}
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
                  <p className="font-semibold leading-tight">
                    {formatDimensions(sizeResult.widthInches, sizeResult.heightInches)}
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight">
                    Estimated sign size · {sizeResult.widthInches}″ W × {sizeResult.heightInches}″ H
                  </p>
                </div>
              </div>
              <ConfidenceBadge confidence={sizeResult.confidence} />
            </div>
          )}

          {generating && (
            <div className="border border-border rounded-xl p-12 text-center space-y-3">
              <div className="text-4xl animate-pulse">🎨</div>
              <p className="font-medium">Generating preview…</p>
              <p className="text-sm text-muted-foreground">Gemini is rendering your sign. This takes ~20 seconds.</p>
            </div>
          )}

          {!generating && previewSkipped && (
            <div className="border border-border rounded-xl p-8 text-center space-y-3">
              <div className="text-4xl">📋</div>
              <p className="font-medium">No AI preview for this sign type</p>
              <p className="text-sm text-muted-foreground">
                AI preview isn't available for {SIGN_TYPES.find(t => t.value === signType)?.label ?? signType} in this version.
                Your order will still receive competitive quotes from sign companies.
              </p>
            </div>
          )}

          {!generating && generateError && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-5 space-y-3">
              <p className="text-sm font-medium text-red-700">Preview generation failed</p>
              <p className="text-sm text-red-600">{generateError}</p>
              {regenCount < 3 && (
                <button onClick={runPreview} className="text-sm text-accent font-medium hover:underline">
                  Try again
                </button>
              )}
            </div>
          )}

          {!generating && previewDataUrl && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewDataUrl} alt="AI sign preview" className="w-full" />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  AI-generated preview. Actual result will vary — your sign company measures on-site.
                </p>
                {regenCount < 3 && (
                  <button
                    onClick={runPreview}
                    className="text-xs text-accent font-medium hover:underline flex-shrink-0 ml-2"
                  >
                    Regenerate ({3 - regenCount} left)
                  </button>
                )}
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
      {step === "review" && sizeResult && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Review & Submit</h1>
            <p className="text-muted-foreground mt-1">Your order will be sent to sign companies for quotes.</p>
          </div>

          <div className="border border-border rounded-xl divide-y divide-border">
            <Row label="Business name" value={businessName} />
            <Row label="Sign type" value={SIGN_TYPES.find(t => t.value === signType)?.label ?? signType} />
            <Row label="Estimated size" value={formatDimensions(sizeResult.widthInches, sizeResult.heightInches)} />
            <Row label="Primary color" value={<span className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-border inline-block" style={{ background: primaryColor }} />{primaryColor}</span>} />
            <Row label="Illumination" value={ILLUMINATION_OPTS.find(o => o.value === illumination)?.label ?? illumination} />
            <Row label="Material" value={MATERIAL_OPTS.find(o => o.value === material)?.label ?? material} />
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
