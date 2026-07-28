"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { fitQuadToRatio } from "@/lib/sign-geometry"

export type QuadPoint = { x: number; y: number } // normalized 0–1

interface Props {
  imageDataUrl: string
  onChange: (quad: QuadPoint[]) => void // [TL,TR,BR,BL] flat | [TL,TM,TR,BR,BM,BL] corner
  corner?: boolean
  onReferenceChange?: (points: QuadPoint[]) => void // [A,B] ruler mode | [TL,TR,BR,BL] door/brick sticker mode
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void
  referenceLabel?: string // Label chip text shown at midpoint — never a number
  referenceIcon?: "door" | "brick" | "ruler" // visual overlay for the reference object — icon to place on top of the real object, instead of a plain ruler
  showReference?: boolean // when false, hides the reference overlay entirely and excludes it from hit-testing (client already knows the sign's exact size)
  caption?: string // overrides the default "drag the gold box corners" caption below the canvas — use when this render of the canvas is really about the reference (e.g. a dedicated door/brick placement screen), not the gold box
  // Aspect-ratio lock — once the sign's real width:height ratio is known
  // (typed, reference-calibrated, or a Maps cross-check), the parent passes
  // these so the quad can no longer be freely stretched/skewed away from the
  // real proportions. Flat mode uses lockedAspectRatio; corner mode uses
  // lockedFrontRatio + lockedSideRatio (front/side width, each against the
  // shared height) — pass both together for corner mode, neither locks
  // anything on its own.
  lockedAspectRatio?: number
  lockedFrontRatio?: number
  lockedSideRatio?: number
  // One-shot parent-pushed quad override — QuadSelector is otherwise fully
  // uncontrolled (see the "report the default quad on mount" effect below).
  // The parent uses this exactly once, to silently snap whatever quad is
  // currently drawn onto the correct ratio the moment real dimensions become
  // known. Pass a freshly computed array to apply it; a stable/unchanged
  // reference is a no-op.
  applyQuad?: QuadPoint[]
}

const HANDLE_RADIUS = 10
const GOLD = "#FFD740"
const FOLD_COLOR = "#FF8C42"  // orange — fold handles are visually distinct
const REFERENCE_COLOR = "#00E5FF" // cyan — reference line, distinct from quad/fold
const LOCK_ACCENT = "#4ADE80"  // green — the resize/rotate handles that appear once the quad is ratio-locked, visually distinct from GOLD's free-drag corners
const LOCK_MUTED = "rgba(255,255,255,0.6)"

// Touch-only sizing: visible dot stays modest, but the invisible grab zone
// clears Apple's ~44px minimum tap target so fingers don't need pixel accuracy.
const TOUCH_HANDLE_CSS_RADIUS = 14
const TOUCH_HIT_CSS_RADIUS = 24

// Magnifier loupe (touch only) — shown while dragging so the target point
// isn't hidden under the fingertip.
const LOUPE_CSS_RADIUS = 60
const LOUPE_ZOOM = 2.5
const LOUPE_CSS_OFFSET = 90

// Locked-mode resize/rotate handle sizing (css px, same touch-scaling convention as above)
const RESIZE_HANDLE_CSS = 8
const ROTATE_HANDLE_CSS_RADIUS = 9
const ROTATE_STEM_CSS_LEN = 30
// Below this many canvas-px, an edge is treated as degenerate (effectively
// zero-length) and the corner-mode resize drag it would anchor is skipped
// rather than computing a direction vector from it — guards against a
// collapsed/corrupted hexagon producing a (0,0) direction that would then
// silently collapse that face to a point on every subsequent drag.
const MIN_LOCK_DIR_PX = 1

function defaultQuad(corner: boolean): QuadPoint[] {
  if (corner) return [
    { x: 0.175, y: 0.15 }, // 0 TL
    { x: 0.50,  y: 0.15 }, // 1 TM (fold top)
    { x: 0.825, y: 0.15 }, // 2 TR
    { x: 0.825, y: 0.43 }, // 3 BR
    { x: 0.50,  y: 0.43 }, // 4 BM (fold bottom)
    { x: 0.175, y: 0.43 }, // 5 BL
  ]
  return [
    { x: 0.175, y: 0.15 },
    { x: 0.825, y: 0.15 },
    { x: 0.825, y: 0.43 },
    { x: 0.175, y: 0.43 },
  ]
}

// Positioned near the bottom of the frame — away from the default quad box
// (which sits in the y 0.15–0.43 band) so the two don't overlap. Ruler mode
// is a simple 2-point A/B line (an arbitrary object's length); door/brick
// sticker mode is a 4-point quad [TL,TR,BR,BL], same convention as the sign
// quad, so its corners can be dragged independently to match an object that
// sits at an angle in the photo instead of always rendering as a fixed
// vertical rectangle.
function defaultReference(icon: "door" | "brick" | "ruler"): QuadPoint[] {
  if (icon === "ruler") {
    return [
      { x: 0.5, y: 0.75 },
      { x: 0.5, y: 0.9 },
    ]
  }
  const topY = 0.75, bottomY = 0.9
  const width = (bottomY - topY) * (icon === "door" ? 0.45 : 2)
  return [
    { x: 0.5 - width / 2, y: topY },    // TL
    { x: 0.5 + width / 2, y: topY },    // TR
    { x: 0.5 + width / 2, y: bottomY }, // BR
    { x: 0.5 - width / 2, y: bottomY }, // BL
  ]
}

// canvas-space px per 1 css px, given the element's current on-screen size
function canvasScale(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  return rect.width ? canvas.width / rect.width : 1
}

function drawLoupe(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, img: HTMLImageElement, W: number, H: number, px: number, py: number) {
  const scale = canvasScale(canvas)
  const loupeRadius = LOUPE_CSS_RADIUS * scale
  const srcRadius = loupeRadius / LOUPE_ZOOM
  const vOffset = LOUPE_CSS_OFFSET * scale

  const cx = Math.max(loupeRadius, Math.min(W - loupeRadius, px))
  let cy = py - vOffset
  if (cy - loupeRadius < 0) cy = py + vOffset
  cy = Math.max(loupeRadius, Math.min(H - loupeRadius, cy))

  const sw = srcRadius * 2
  const sh = srcRadius * 2
  const sx = Math.max(0, Math.min(W - sw, px - srcRadius))
  const sy = Math.max(0, Math.min(H - sh, py - srcRadius))

  // Map the canvas-space crop rect into the source photo's natural pixel
  // space (the canvas draws the photo scaled to W×H, so the two spaces
  // differ whenever the photo's native resolution isn't exactly W×H).
  const imgScaleX = img.naturalWidth / W
  const imgScaleY = img.naturalHeight / H

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, loupeRadius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = "#111"
  ctx.fillRect(cx - loupeRadius, cy - loupeRadius, loupeRadius * 2, loupeRadius * 2)
  // Magnify straight from the source photo — never the composited canvas.
  // The canvas already has the active handle's own (enlarged, touch-sized)
  // indicator circle painted right at this point; capturing from the canvas
  // would blow that circle up 2.5x along with everything else, filling most
  // of the loupe with an opaque white blob and hiding the real photo detail
  // the loupe exists to reveal.
  ctx.drawImage(
    img,
    sx * imgScaleX, sy * imgScaleY, sw * imgScaleX, sh * imgScaleY,
    cx - loupeRadius, cy - loupeRadius, loupeRadius * 2, loupeRadius * 2,
  )

  // Crosshair at the exact target point — offset accounts for source-rect clamping near edges.
  const targetX = cx + (px - (sx + srcRadius)) * LOUPE_ZOOM
  const targetY = cy + (py - (sy + srcRadius)) * LOUPE_ZOOM
  ctx.strokeStyle = "rgba(255,255,255,0.95)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(targetX - 9, targetY)
  ctx.lineTo(targetX + 9, targetY)
  ctx.moveTo(targetX, targetY - 9)
  ctx.lineTo(targetX, targetY + 9)
  ctx.stroke()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, loupeRadius, 0, Math.PI * 2)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 3
  ctx.stroke()
}

type Pt = { x: number; y: number }

// ── Small vector helpers (canvas-px space) for the aspect-ratio-locked
// resize/rotate handles below. Kept tiny and generic on purpose — this is
// the only place in the component that needs real vector math, everywhere
// else works directly with x/y.
function vecSub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, y: a.y - b.y } }
function vecAdd(a: Pt, b: Pt): Pt { return { x: a.x + b.x, y: a.y + b.y } }
function vecScale(a: Pt, s: number): Pt { return { x: a.x * s, y: a.y * s } }
function vecLen(a: Pt): number { return Math.hypot(a.x, a.y) }
function vecUnit(a: Pt): Pt { const l = vecLen(a) || 1; return { x: a.x / l, y: a.y / l } }
function vecDot(a: Pt, b: Pt): number { return a.x * b.x + a.y * b.y }
function vecRotate(a: Pt, angle: number): Pt {
  const c = Math.cos(angle), s = Math.sin(angle)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}

// Canvas position of the rotate handle — offset outward from the shape's own
// current top edge (flat) or fold line (corner), so it stays sensibly placed
// as the shape rotates instead of always pointing screen-up. Shared between
// draw() and findHandle() so the drawn position and the hit-tested position
// never drift apart.
function rotateHandlePos(pts: Pt[], isCornerMode: boolean): Pt {
  if (isCornerMode) {
    const tm = pts[1], bm = pts[4]
    const up = vecUnit(vecSub(tm, bm))
    return vecAdd(tm, vecScale(up, ROTATE_STEM_CSS_LEN))
  }
  const tl = pts[0], tr = pts[1]
  const dirW = vecUnit(vecSub(tr, tl))
  const outward = { x: dirW.y, y: -dirW.x } // perpendicular, pointing away from the box
  const mid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }
  return vecAdd(mid, vecScale(outward, ROTATE_STEM_CSS_LEN))
}

// Bilinear interpolation across an arbitrary quad [TL,TR,BR,BL] — s=0..1 left→right,
// t=0..1 top→bottom. Lets the door/brick decorative details (panels, knob, mortar
// joint) sit at the same relative position regardless of how the quad's 4 corners
// have been dragged (rotated, skewed by perspective, stretched unevenly, etc.),
// instead of assuming a fixed-perpendicular-offset rectangle from just 2 points.
function bilerpQuad(tl: Pt, tr: Pt, br: Pt, bl: Pt, s: number, t: number): Pt {
  const top = { x: tl.x + (tr.x - tl.x) * s, y: tl.y + (tr.y - tl.y) * s }
  const bottom = { x: bl.x + (br.x - bl.x) * s, y: bl.y + (br.y - bl.y) * s }
  return { x: top.x + (bottom.x - top.x) * t, y: top.y + (bottom.y - top.y) * t }
}

// Semi-transparent door silhouette (rounded slab + knob) drawn across the
// [TL,TR,BR,BL] quad — same corner convention as the sign quad — so the
// client can drag any corner independently to match a door that sits at an
// angle in the photo, not just stretch a fixed vertical rectangle.
function drawDoorIcon(ctx: CanvasRenderingContext2D, tl: Pt, tr: Pt, br: Pt, bl: Pt) {
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.6)"
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.fillStyle = "rgba(255,166,60,0.55)"
  ctx.fill()
  ctx.shadowBlur = 0

  // Double outline — white halo under a dark wood stroke — pops on any photo
  ctx.strokeStyle = "rgba(255,255,255,0.95)"
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.strokeStyle = "rgba(120,66,18,0.95)"
  ctx.lineWidth = 3
  ctx.stroke()

  // Inner door panels (two stacked rectangles) — reads as "door" at a glance
  const panel = (fromT: number, toT: number) => {
    const sMin = 0.22, sMax = 0.78
    const p1a = bilerpQuad(tl, tr, br, bl, sMin, fromT)
    const p1b = bilerpQuad(tl, tr, br, bl, sMax, fromT)
    const p2b = bilerpQuad(tl, tr, br, bl, sMax, toT)
    const p2a = bilerpQuad(tl, tr, br, bl, sMin, toT)
    ctx.beginPath()
    ctx.moveTo(p1a.x, p1a.y)
    ctx.lineTo(p1b.x, p1b.y)
    ctx.lineTo(p2b.x, p2b.y)
    ctx.lineTo(p2a.x, p2a.y)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(120,66,18,0.8)"
  ctx.lineWidth = 2
  panel(0.12, 0.44)
  panel(0.56, 0.88)

  // Knob, roughly waist-height on the handle side
  const knob = bilerpQuad(tl, tr, br, bl, 0.88, 0.5)
  const widthEstimate = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2
  ctx.beginPath()
  ctx.arc(knob.x, knob.y, Math.max(4, widthEstimate * 0.07), 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.fill()
  ctx.strokeStyle = "rgba(60,40,20,0.9)"
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

// Semi-transparent brick silhouette (single course + mortar joint) drawn
// across the [TL,TR,BR,BL] quad — same corner convention as drawDoorIcon.
function drawBrickIcon(ctx: CanvasRenderingContext2D, tl: Pt, tr: Pt, br: Pt, bl: Pt) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.shadowColor = "rgba(0,0,0,0.6)"
  ctx.shadowBlur = 12
  ctx.fillStyle = "rgba(210,70,50,0.6)"
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = "rgba(255,255,255,0.95)"
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.strokeStyle = "rgba(90,30,20,0.95)"
  ctx.lineWidth = 2.5
  ctx.stroke()

  // Mortar joint across the middle of the brick face
  const midLeft = bilerpQuad(tl, tr, br, bl, 0, 0.5)
  const midRight = bilerpQuad(tl, tr, br, bl, 1, 0.5)
  ctx.beginPath()
  ctx.moveTo(midLeft.x, midLeft.y)
  ctx.lineTo(midRight.x, midRight.y)
  ctx.strokeStyle = "rgba(255,255,255,0.6)"
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

// Point-in-polygon (ray casting) — used to hit-test "inside the quad/reference
// body" for whole-shape drag, in canvas-px space. Works for any simple polygon,
// including the non-convex 6-point corner-sign hexagon.
function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// Handle-index scheme: quad corners come first (0..quadLen-1), then the
// reference's own points (ruler mode: A, B; door/brick sticker mode:
// [TL,TR,BR,BL] — genuine point handles, so any one of them can be dragged
// independently to skew the shape for an angled photo), then — sticker mode
// only — 4 edge-midpoint handles (REF_EDGE_TOP/RIGHT/BOTTOM/LEFT: drag one
// edge to resize that single dimension while keeping the shape rectangular,
// the common case for a straight-on photo of a straight door, without having
// to carefully drag all 4 corners to avoid skewing it), then REF_BODY ("grab
// the middle and move the whole thing") and QUAD_BODY ("grab anywhere inside
// the gold box and move it"), then — only meaningful once the quad is
// ratio-locked (see Props.lockedAspectRatio et al.) — QUAD_RESIZE_A/B and
// QUAD_ROTATE: the handles that replace free corner-dragging once the quad's
// shape must stay tied to a known real-world ratio. Centralized here so
// findHandle/draw/onDown/onMove/onHover/onUp agree. Priority: quad corners
// and reference points first (most specific), then the reference's edge
// handles, then the lock handles, then QUAD_BODY (the box is the primary
// thing on this step, so it wins over REF_BODY where the two shapes
// overlap), then REF_BODY.
function bodyDragIndices(quadLen: number, showReference: boolean, refLen: number) {
  const refPointCount = showReference ? refLen : 0
  const pointHandleCount = quadLen + refPointCount
  const QUAD_BODY = pointHandleCount + 5
  return {
    refPointCount,
    pointHandleCount,
    REF_EDGE_TOP: pointHandleCount,
    REF_EDGE_RIGHT: pointHandleCount + 1,
    REF_EDGE_BOTTOM: pointHandleCount + 2,
    REF_EDGE_LEFT: pointHandleCount + 3,
    REF_BODY: pointHandleCount + 4,
    QUAD_BODY,
    // Ratio-locked handles — QUAD_RESIZE_A is the sole resize handle in flat
    // mode (BR corner) or the front-face handle in corner mode (BL);
    // QUAD_RESIZE_B is corner-mode-only (side-face handle, BR).
    QUAD_RESIZE_A: QUAD_BODY + 1,
    QUAD_RESIZE_B: QUAD_BODY + 2,
    QUAD_ROTATE: QUAD_BODY + 3,
  }
}

// Drag-start snapshot for the locked resize/rotate handles — captured once in
// onDown so onMove has a stable anchor/orientation/direction to rebuild the
// quad from on every subsequent move, rather than re-deriving it from a quad
// that's actively being mutated mid-drag.
type LockDrag =
  | { kind: "resize-flat"; anchor: Pt; dirW: Pt; dirH: Pt; baseW: number; baseH: number }
  | { kind: "resize-front" | "resize-side"; anchor: Pt; upDir: Pt; frontDir: Pt; sideDir: Pt }
  | { kind: "rotate"; centroid: Pt; startAngle: number; snapshot: QuadPoint[] }

export default function QuadSelector({
  imageDataUrl, onChange, corner = false, onReferenceChange, onImageLoad,
  referenceLabel = "reference", referenceIcon = "ruler", showReference = true, caption,
  lockedAspectRatio, lockedFrontRatio, lockedSideRatio, applyQuad,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const quadRef = useRef<QuadPoint[]>(defaultQuad(corner))
  const referenceRef = useRef<QuadPoint[]>(defaultReference(referenceIcon))
  const draggingRef = useRef<number | null>(null)
  // Last pointer position (normalized) while dragging a whole shape's body
  // (either the quad or the reference icon — only one drag is active at a time)
  const bodyDragLastRef = useRef<{ x: number; y: number } | null>(null)
  const lockDragRef = useRef<LockDrag | null>(null)
  const prevCornerRef = useRef(corner)
  const [, forceRender] = useState(0)
  const [isCoarse, setIsCoarse] = useState(false)

  // Once real dimensions are known (typed, reference-calibrated, or a Maps
  // cross-check), the parent passes the target ratio(s) here and the quad can
  // no longer be freely stretched/skewed — see Props doc comment above.
  const isLocked = corner
    ? (lockedFrontRatio != null && lockedFrontRatio > 0 && lockedSideRatio != null && lockedSideRatio > 0)
    : (lockedAspectRatio != null && lockedAspectRatio > 0)

  // Builds a fresh default quad, snapped to the current lock ratio when
  // locked — shared by resetQuad() and the corner-toggle effect below so
  // neither one can reintroduce an off-ratio quad through the back door.
  function lockedDefaultQuad(): QuadPoint[] {
    const base = defaultQuad(corner)
    const canvas = canvasRef.current
    if (!isLocked || !canvas || !canvas.width || !canvas.height) return base
    const aspect = canvas.width / canvas.height
    return corner
      ? fitQuadToRatio(base, aspect, (lockedFrontRatio ?? 1) + (lockedSideRatio ?? 1), 1, true, lockedFrontRatio, lockedSideRatio)
      : fitQuadToRatio(base, aspect, lockedAspectRatio ?? 1, 1, false)
  }

  // Detect touch/coarse-pointer devices so mobile affordances stay off desktop.
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const update = () => setIsCoarse(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // Report the initial default quad to the parent on mount. Without this, the
  // box is drawn on the canvas but the parent's `quad` stays null until the
  // user drags a handle, hits Reset, or toggles corner mode — so a client who
  // uses "I already know my sign's exact size" and never touches the box can
  // reach the AI preview step with quad still null, silently blocking generation.
  useEffect(() => {
    onChange([...quadRef.current])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Parent-pushed quad override — the one path a parent can still write into
  // this otherwise-uncontrolled component, used exactly once to silently
  // snap the currently-drawn quad onto the correct ratio the moment real
  // dimensions become known (see Props.applyQuad doc comment).
  useEffect(() => {
    if (applyQuad && applyQuad.length === quadRef.current.length) {
      quadRef.current = applyQuad.map(p => ({ ...p }))
      draw()
      onChange([...quadRef.current])
      forceRender(n => n + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyQuad])

  // Ruler mode's reference is a 2-point A/B line; door/brick sticker mode is
  // a 4-point [TL,TR,BR,BL] quad. When referenceIcon switches between them,
  // convert the existing reference into the new shape instead of resetting
  // it, so the client doesn't lose their placement on every mode change.
  useEffect(() => {
    const isSticker = referenceIcon === "door" || referenceIcon === "brick"
    const ref = referenceRef.current
    if (isSticker && ref.length === 2) {
      const [a, b] = ref
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 0.01
      const ux = dx / len, uy = dy / len
      const px = -uy, py = ux
      const width = (referenceIcon === "door" ? 0.45 : 2) * len
      referenceRef.current = [
        { x: a.x + px * width / 2, y: a.y + py * width / 2 },
        { x: a.x - px * width / 2, y: a.y - py * width / 2 },
        { x: b.x - px * width / 2, y: b.y - py * width / 2 },
        { x: b.x + px * width / 2, y: b.y + py * width / 2 },
      ]
      onReferenceChange?.([...referenceRef.current])
      draw()
    } else if (!isSticker && ref.length === 4) {
      const [tl, tr, , bl] = ref
      referenceRef.current = [
        { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 },
        { x: (bl.x + ref[2].x) / 2, y: (bl.y + ref[2].y) / 2 },
      ]
      onReferenceChange?.([...referenceRef.current])
      draw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceIcon])

  // Reset quad when corner mode toggles
  useEffect(() => {
    if (prevCornerRef.current !== corner) {
      quadRef.current = lockedDefaultQuad()
      prevCornerRef.current = corner
      draw()
      onChange([...quadRef.current])
      forceRender(n => n + 1)
    }
  })

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Match the canvas to the photo's real aspect ratio so it isn't squished.
      const canvas = canvasRef.current
      if (canvas && img.naturalWidth && img.naturalHeight) {
        const W = 960
        canvas.width = W
        canvas.height = Math.round(W * (img.naturalHeight / img.naturalWidth))
      }
      if (img.naturalWidth && img.naturalHeight) {
        onImageLoad?.(img.naturalWidth, img.naturalHeight)
      }
      draw()
    }
    img.src = imageDataUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl])

  const getCanvasCoords = useCallback((e: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  function draw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext("2d")!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)

    const quad = quadRef.current
    const pts = quad.map(p => ({ x: p.x * W, y: p.y * H }))
    const activeIdx = draggingRef.current
    const handleR = isCoarse ? TOUCH_HANDLE_CSS_RADIUS * canvasScale(canvas) : HANDLE_RADIUS
    const labelFont = isCoarse ? "bold 11px system-ui" : "bold 9px system-ui"

    if (corner && pts.length === 6) {
      // pts: [TL(0), TM(1), TR(2), BR(3), BM(4), BL(5)]
      // Front face: TL, TM, BM, BL
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.lineTo(pts[5].x, pts[5].y)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 215, 64, 0.28)"
      ctx.fill()

      // Side face: TM, TR, BR, BM
      ctx.beginPath()
      ctx.moveTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[2].x, pts[2].y)
      ctx.lineTo(pts[3].x, pts[3].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 160, 64, 0.28)"
      ctx.fill()

      // Full hexagon border
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.stroke()

      // Fold dashed line TM → BM
      ctx.beginPath()
      ctx.moveTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.strokeStyle = FOLD_COLOR
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // "Building corner" label on fold line
      const midX = (pts[1].x + pts[4].x) / 2
      const midY = (pts[1].y + pts[4].y) / 2
      ctx.save()
      ctx.font = "bold 10px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const label = "corner"
      const lw = ctx.measureText(label).width + 8
      ctx.fillStyle = "rgba(0,0,0,0.55)"
      ctx.beginPath()
      ctx.roundRect(midX - lw / 2, midY - 9, lw, 18, 4)
      ctx.fill()
      ctx.fillStyle = FOLD_COLOR
      ctx.fillText(label, midX, midY)
      ctx.restore()

      // Face labels
      const frontCx = (pts[0].x + pts[1].x + pts[4].x + pts[5].x) / 4
      const frontCy = (pts[0].y + pts[1].y + pts[4].y + pts[5].y) / 4
      const sideCx = (pts[1].x + pts[2].x + pts[3].x + pts[4].x) / 4
      const sideCy = (pts[1].y + pts[2].y + pts[3].y + pts[4].y) / 4

      ctx.font = "bold 11px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(255,255,255,0.9)"
      ctx.fillText("Front", frontCx, frontCy)
      ctx.fillText("Side", sideCx, sideCy)

      // Handles — muted, non-interactive dots once ratio-locked (the fold and
      // corners are no longer individually draggable; the resize/rotate
      // handles drawn below take over that job).
      const handleColors = [GOLD, FOLD_COLOR, GOLD, GOLD, FOLD_COLOR, GOLD]
      const handleLabels = ["TL", "◆", "TR", "BR", "◆", "BL"]
      pts.forEach((p, i) => {
        if (isLocked) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(255,255,255,0.85)"
          ctx.fill()
          ctx.strokeStyle = LOCK_MUTED
          ctx.lineWidth = 1.5
          ctx.stroke()
          return
        }
        const isActive = isCoarse && i === activeIdx
        const r = isActive ? handleR * 1.25 : handleR
        if (isActive) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = "rgba(255, 215, 64, 0.55)"
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = handleColors[i]
        ctx.lineWidth = 2.5
        ctx.stroke()

        ctx.fillStyle = "#333"
        ctx.font = labelFont
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(handleLabels[i], p.x, p.y)
      })
    } else {
      // Normal 4-point mode
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 215, 64, 0.30)"
      ctx.fill()

      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.stroke()

      const labels = ["TL", "TR", "BR", "BL"]
      pts.forEach((p, i) => {
        if (isLocked) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(255,255,255,0.85)"
          ctx.fill()
          ctx.strokeStyle = LOCK_MUTED
          ctx.lineWidth = 1.5
          ctx.stroke()
          return
        }
        const isActive = isCoarse && i === activeIdx
        const r = isActive ? handleR * 1.25 : handleR
        if (isActive) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = "rgba(255, 215, 64, 0.55)"
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2.5
        ctx.stroke()

        ctx.fillStyle = "#333"
        ctx.font = labelFont
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(labels[i], p.x, p.y)
      })
    }

    // ── Aspect-ratio-locked resize/rotate handles ──
    // Replace free corner-dragging once a real-world ratio is known — the
    // whole reason this exists (see Props.lockedAspectRatio doc comment):
    // the quad can still be resized/rotated/moved, just never independently
    // stretched away from the locked width:height ratio.
    if (isLocked) {
      const rotatePos = rotateHandlePos(pts, corner)
      const stemAnchor = corner ? pts[1] : { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }

      ctx.save()
      ctx.strokeStyle = LOCK_ACCENT
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(stemAnchor.x, stemAnchor.y)
      ctx.lineTo(rotatePos.x, rotatePos.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      const rotR = isCoarse ? ROTATE_HANDLE_CSS_RADIUS * canvasScale(canvas) * 1.3 : ROTATE_HANDLE_CSS_RADIUS
      ctx.beginPath()
      ctx.arc(rotatePos.x, rotatePos.y, rotR, 0, Math.PI * 2)
      ctx.fillStyle = "white"
      ctx.fill()
      ctx.strokeStyle = LOCK_ACCENT
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = LOCK_ACCENT
      ctx.font = `${Math.round(rotR * 1.5)}px system-ui`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("↻", rotatePos.x, rotatePos.y)

      const resizeHalf = isCoarse ? RESIZE_HANDLE_CSS * canvasScale(canvas) * 1.3 : RESIZE_HANDLE_CSS
      const drawResizeHandle = (p: Pt) => {
        ctx.beginPath()
        ctx.roundRect(p.x - resizeHalf, p.y - resizeHalf, resizeHalf * 2, resizeHalf * 2, 3)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = LOCK_ACCENT
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
      if (corner) {
        drawResizeHandle(pts[5]) // BL — front face
        drawResizeHandle(pts[3]) // BR — side face
      } else {
        drawResizeHandle(pts[2]) // BR
      }
    }

    // ── Reference — ruler/measuring-tape treatment, or door/brick sticker quad ──
    const reference = referenceRef.current
    const refPts = reference.map(p => ({ x: p.x * W, y: p.y * H }))
    const refActiveIdx = activeIdx !== null && activeIdx >= quad.length ? activeIdx - quad.length : null
    const isStickerMode = referenceIcon === "door" || referenceIcon === "brick"
    const { pointHandleCount, REF_EDGE_TOP, REF_EDGE_RIGHT, REF_EDGE_BOTTOM, REF_EDGE_LEFT } =
      bodyDragIndices(quad.length, showReference, reference.length)

    if (showReference) {
    if (isStickerMode && refPts.length === 4) {
      // Door/brick sticker: an arbitrary [TL,TR,BR,BL] quad — draw the icon
      // across whatever shape the 4 corners currently form.
      const [tl, tr, br, bl] = refPts
      if (referenceIcon === "door") {
        drawDoorIcon(ctx, tl, tr, br, bl)
      } else {
        drawBrickIcon(ctx, tl, tr, br, bl)
      }

      // Label chip above the top edge, offset away from the shape.
      const topMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }
      const centroid = {
        x: (tl.x + tr.x + br.x + bl.x) / 4,
        y: (tl.y + tr.y + br.y + bl.y) / 4,
      }
      let awayX = topMid.x - centroid.x, awayY = topMid.y - centroid.y
      const awayLen = Math.hypot(awayX, awayY) || 1
      awayX /= awayLen; awayY /= awayLen
      const chipX = topMid.x + awayX * 22
      const chipY = topMid.y + awayY * 22
      ctx.save()
      ctx.font = "bold 10px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const chipText = referenceLabel
      const tw = ctx.measureText(chipText).width + 10
      const th = 18
      ctx.fillStyle = "rgba(0,0,0,0.70)"
      ctx.beginPath()
      ctx.roundRect(chipX - tw / 2, chipY - th / 2, tw, th, 4)
      ctx.fill()
      ctx.fillStyle = REFERENCE_COLOR
      ctx.fillText(chipText, chipX, chipY)
      ctx.restore()

      // Corner dots — same touch-friendly sizing as the quad's own corners,
      // but unlabeled (no TL/TR/BR/BL text) so they don't read as a second,
      // confusing "gold box" and to keep the small icon visually clean.
      const dotColor = referenceIcon === "door" ? "rgba(120,66,18,0.95)" : "rgba(90,30,20,0.95)"
      const refHandleR = isCoarse ? TOUCH_HANDLE_CSS_RADIUS * canvasScale(canvas) * 1.2 : HANDLE_RADIUS + 3
      refPts.forEach((p, i) => {
        const isActive = isCoarse && i === refActiveIdx
        const r = isActive ? refHandleR * 1.25 : refHandleR
        if (isActive) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = dotColor.replace("0.95", "0.4")
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = dotColor
        ctx.lineWidth = 2.5
        ctx.stroke()
      })

      // Edge-midpoint handles — small pill-shaped grips, distinct from the
      // round corner dots, so it's visually clear they do something different
      // (resize one dimension, keep the shape rectangular) rather than
      // reading as a 5th/6th/7th/8th corner.
      const edgeMidpoints: [number, Pt, boolean][] = [
        [REF_EDGE_TOP, { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }, true],
        [REF_EDGE_BOTTOM, { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 }, true],
        [REF_EDGE_LEFT, { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 }, false],
        [REF_EDGE_RIGHT, { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 }, false],
      ]
      const edgeR = (isCoarse ? TOUCH_HANDLE_CSS_RADIUS * canvasScale(canvas) * 1.2 : HANDLE_RADIUS + 3) * 0.8
      edgeMidpoints.forEach(([edgeIdx, p, horizontal]) => {
        const isActive = isCoarse && activeIdx === edgeIdx
        const r = isActive ? edgeR * 1.25 : edgeR
        const w = horizontal ? r * 2.4 : r * 1.3
        const h = horizontal ? r * 1.3 : r * 2.4
        if (isActive) {
          ctx.beginPath()
          ctx.roundRect(p.x - w / 2 - 4, p.y - h / 2 - 4, w + 8, h + 8, Math.min(w, h) / 2 + 4)
          ctx.strokeStyle = dotColor.replace("0.95", "0.4")
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, Math.min(w, h) / 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = dotColor
        ctx.lineWidth = 2
        ctx.stroke()
      })
    } else {
    {
      const ax = refPts[0].x, ay = refPts[0].y
      const bx = refPts[1].x, by = refPts[1].y
      const dx = bx - ax, dy = by - ay
      const len = Math.hypot(dx, dy)

      if (len > 1) {
        const ux = dx / len, uy = dy / len   // unit vector along segment
        const px = -uy, py = ux              // unit perpendicular (rotated 90°)

        {
          const CASING_W = 18
          const BAND_W   = 14
          const ARROW_LEN = 18  // arrowhead length along axis
          const ARROW_W   = 8   // arrowhead half-width
          const TICK_INTERVAL = 24
          const TICK_LONG  = 7   // half-height of long tick (full height = 14px)
          const TICK_SHORT = 4   // half-height of short tick
          const TICK_COLOR = "#00565F"
          const CASING_COLOR = "#00565F"

          // 1. Dark teal casing — drawn first so the cyan band sits on top
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.strokeStyle = CASING_COLOR
          ctx.lineWidth = CASING_W
          ctx.lineCap = "butt"
          ctx.setLineDash([])
          ctx.stroke()

          // 2. Cyan tape band on top
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.strokeStyle = "rgba(0,229,255,0.85)"
          ctx.lineWidth = BAND_W
          ctx.stroke()
          ctx.restore()

          // 3. Tick marks across the band — manual perpendicular approach (no rotate needed)
          ctx.save()
          ctx.strokeStyle = TICK_COLOR
          ctx.lineCap = "butt"
          ctx.setLineDash([])
          let tickIdx = 0
          for (let d = TICK_INTERVAL; d < len - TICK_INTERVAL * 0.5; d += TICK_INTERVAL) {
            const tx = ax + ux * d
            const ty = ay + uy * d
            const isLong = (tickIdx % 2 === 0)
            const halfH = isLong ? TICK_LONG : TICK_SHORT
            ctx.lineWidth = isLong ? 2 : 1.5
            ctx.beginPath()
            ctx.moveTo(tx - px * halfH, ty - py * halfH)
            ctx.lineTo(tx + px * halfH, ty + py * halfH)
            ctx.stroke()
            tickIdx++
          }
          ctx.restore()

          // 4. Arrowheads at both ends (pointing outward along the axis)
          ctx.save()
          ctx.fillStyle = CASING_COLOR
          ctx.strokeStyle = CASING_COLOR
          ctx.setLineDash([])

          // Arrowhead at A (pointing away from B, i.e. in -u direction)
          const arA = [
            { x: ax - ux * ARROW_LEN + px * ARROW_W, y: ay - uy * ARROW_LEN + py * ARROW_W },
            { x: ax,                                   y: ay                                   },
            { x: ax - ux * ARROW_LEN - px * ARROW_W, y: ay - uy * ARROW_LEN - py * ARROW_W },
          ]
          ctx.beginPath()
          ctx.moveTo(arA[0].x, arA[0].y)
          ctx.lineTo(arA[1].x, arA[1].y)
          ctx.lineTo(arA[2].x, arA[2].y)
          ctx.closePath()
          ctx.fill()

          // Arrowhead at B (pointing away from A, i.e. in +u direction)
          const arB = [
            { x: bx + ux * ARROW_LEN + px * ARROW_W, y: by + uy * ARROW_LEN + py * ARROW_W },
            { x: bx,                                   y: by                                   },
            { x: bx + ux * ARROW_LEN - px * ARROW_W, y: by + uy * ARROW_LEN - py * ARROW_W },
          ]
          ctx.beginPath()
          ctx.moveTo(arB[0].x, arB[0].y)
          ctx.lineTo(arB[1].x, arB[1].y)
          ctx.lineTo(arB[2].x, arB[2].y)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        // 5. Label chip at midpoint, offset perpendicular so it doesn't cover the band
        {
          const midX = (ax + bx) / 2
          const midY = (ay + by) / 2
          const CHIP_OFFSET = 22   // perpendicular offset away from band
          const chipX = midX + px * CHIP_OFFSET
          const chipY = midY + py * CHIP_OFFSET

          ctx.save()
          ctx.font = "bold 10px system-ui"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          const chipText = referenceLabel
          const tw = ctx.measureText(chipText).width + 10
          const th = 18
          ctx.fillStyle = "rgba(0,0,0,0.70)"
          ctx.beginPath()
          ctx.roundRect(chipX - tw / 2, chipY - th / 2, tw, th, 4)
          ctx.fill()
          ctx.fillStyle = REFERENCE_COLOR
          ctx.fillText(chipText, chipX, chipY)
          ctx.restore()
        }
      }

      // Ruler mode: classic A/B endpoint circles.
      const refHandleR = isCoarse ? TOUCH_HANDLE_CSS_RADIUS * canvasScale(canvas) * 1.2 : HANDLE_RADIUS + 3
      refPts.forEach((p, i) => {
        const isActive = isCoarse && i === refActiveIdx
        const r = isActive ? refHandleR * 1.25 : refHandleR
        if (isActive) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = "rgba(0, 229, 255, 0.55)"
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = REFERENCE_COLOR
        ctx.lineWidth = 2.5
        ctx.stroke()

        ctx.fillStyle = "#006e7a"
        ctx.font = labelFont
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(i === 0 ? "A" : "B", p.x, p.y)
      })
    }
    }
    }

    // Loupe: individual point handles (quad corners, ruler A/B, sticker
    // corners) and the sticker's edge-resize handles all get it — precise
    // placement benefits from magnification. Never while dragging a whole
    // shape's body, since that's a coarse repositioning move, not a precise
    // point placement.
    const isEdgeIdx = activeIdx === REF_EDGE_TOP || activeIdx === REF_EDGE_RIGHT || activeIdx === REF_EDGE_BOTTOM || activeIdx === REF_EDGE_LEFT
    const showLoupe = isCoarse && activeIdx !== null && (activeIdx < pointHandleCount || isEdgeIdx)
    if (showLoupe) {
      let activePt: { x: number; y: number }
      if (activeIdx! < quad.length) {
        activePt = pts[activeIdx!]
      } else if (isEdgeIdx && refPts.length === 4) {
        const [tl, tr, br, bl] = refPts
        activePt =
          activeIdx === REF_EDGE_TOP ? { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 } :
          activeIdx === REF_EDGE_BOTTOM ? { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 } :
          activeIdx === REF_EDGE_LEFT ? { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 } :
          { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 }
      } else {
        activePt = refPts[activeIdx! - quad.length]
      }
      drawLoupe(ctx, canvas, img, W, H, activePt.x, activePt.y)
    }
  }

  // Perpendicular distance from point to the A–B segment, plus how far along
  // the segment the projection lands (0–1, clamped). Canvas px space.
  function pointToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return { dist: Math.hypot(x - ax, y - ay), t: 0 }
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq))
    return { dist: Math.hypot(x - (ax + dx * t), y - (ay + dy * t)), t }
  }

  // Combined index space (see bodyDragIndices): 0..quad.length-1 are quad
  // corners, then the reference's own points (ruler mode: A, B; door/brick
  // sticker mode: [TL,TR,BR,BL] — genuine point handles, just like the quad's
  // own corners), then REF_BODY ("grab the middle of the door/brick/ruler and
  // move the whole thing") and QUAD_BODY ("grab anywhere inside the gold box
  // and move it") — shared so a single pointer-tracking codepath
  // (findHandle/onDown/onMove/onHover/onUp) drives all of them. Priority:
  // quad corners and reference points first (most specific), then QUAD_BODY
  // (the box is the primary thing on this step, so it wins over REF_BODY
  // where the two shapes overlap), then REF_BODY.
  function findHandle(x: number, y: number, W: number, H: number, canvas: HTMLCanvasElement, coarse: boolean): number | null {
    const quad = quadRef.current
    const reference = referenceRef.current
    const { REF_EDGE_TOP, REF_EDGE_RIGHT, REF_EDGE_BOTTOM, REF_EDGE_LEFT, REF_BODY, QUAD_BODY, QUAD_RESIZE_A, QUAD_RESIZE_B, QUAD_ROTATE } =
      bodyDragIndices(quad.length, showReference, reference.length)

    // Point handles: quad corners, plus (when visible) every reference point
    // — 2 for ruler mode, 4 for door/brick sticker mode. Once ratio-locked,
    // the quad's own corners are excluded (start past quad.length) — they're
    // no longer individually draggable, the lock handles below take over.
    const pointHandles: QuadPoint[] = !showReference
      ? [...quad]
      : [...quad, ...reference]
    const pointHandleStart = isLocked ? quad.length : 0

    let hit: number | null = null
    if (!coarse) {
      for (let i = pointHandleStart; i < pointHandles.length; i++) {
        const dist = Math.hypot(x - pointHandles[i].x * W, y - pointHandles[i].y * H)
        if (dist <= HANDLE_RADIUS * 1.8) { hit = i; break }
      }
    } else {
      const tolerance = TOUCH_HIT_CSS_RADIUS * canvasScale(canvas)
      let nearestDist = Infinity
      for (let i = pointHandleStart; i < pointHandles.length; i++) {
        const p = pointHandles[i]
        const dist = Math.hypot(x - p.x * W, y - p.y * H)
        if (dist <= tolerance && dist < nearestDist) {
          nearestDist = dist
          hit = i
        }
      }
    }
    if (hit !== null) return hit

    if (showReference && reference.length === 4) {
      // Edge-midpoint handles: drag one edge to resize just that dimension
      // (keeping the shape rectangular) instead of dragging a corner (which
      // skews it) — the easier, more predictable option for the common case
      // of a straight-on photo and a straight door.
      const [tl, tr, br, bl] = reference.map(p => ({ x: p.x * W, y: p.y * H }))
      const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const edgeMidpoints: [number, { x: number; y: number }][] = [
        [REF_EDGE_TOP, mid(tl, tr)],
        [REF_EDGE_RIGHT, mid(tr, br)],
        [REF_EDGE_BOTTOM, mid(br, bl)],
        [REF_EDGE_LEFT, mid(bl, tl)],
      ]
      const tolerance = (coarse ? TOUCH_HIT_CSS_RADIUS : HANDLE_RADIUS * 1.8) * (coarse ? canvasScale(canvas) : 1)
      let nearestDist = Infinity
      let edgeHit: number | null = null
      for (const [idx, p] of edgeMidpoints) {
        const dist = Math.hypot(x - p.x, y - p.y)
        if (dist <= tolerance && dist < nearestDist) { nearestDist = dist; edgeHit = idx }
      }
      if (edgeHit !== null) return edgeHit
    }

    // Ratio-locked resize/rotate handles — checked before the whole-quad body
    // test below since they sit at/near the quad's own corners and must win
    // there (dragging the corner should resize, not translate the whole box).
    if (isLocked) {
      const pts = quad.map(p => ({ x: p.x * W, y: p.y * H }))
      const candidates: [number, Pt][] = corner
        ? [[QUAD_RESIZE_A, pts[5]], [QUAD_RESIZE_B, pts[3]], [QUAD_ROTATE, rotateHandlePos(pts, true)]]
        : [[QUAD_RESIZE_A, pts[2]], [QUAD_ROTATE, rotateHandlePos(pts, false)]]
      const tolerance = (coarse ? TOUCH_HIT_CSS_RADIUS : HANDLE_RADIUS * 1.8) * (coarse ? canvasScale(canvas) : 1)
      let nearestDist = Infinity
      let lockHit: number | null = null
      for (const [idx, p] of candidates) {
        const dist = Math.hypot(x - p.x, y - p.y)
        if (dist <= tolerance && dist < nearestDist) { nearestDist = dist; lockHit = idx }
      }
      if (lockHit !== null) return lockHit
    }

    // Whole-quad body drag — grab anywhere inside the gold box to move it.
    const quadPts = quad.map(p => ({ x: p.x * W, y: p.y * H }))
    if (pointInPolygon(x, y, quadPts)) return QUAD_BODY

    if (!showReference) return null

    if (reference.length === 4) {
      // Door/brick sticker: grab anywhere inside its quad to move the whole thing.
      const refPts = reference.map(p => ({ x: p.x * W, y: p.y * H }))
      if (pointInPolygon(x, y, refPts)) return REF_BODY
      return null
    }

    // Ruler mode: grab anywhere along the A–B line to move the whole thing.
    const ax = reference[0].x * W, ay = reference[0].y * H
    const bx = reference[1].x * W, by = reference[1].y * H
    const grabTolerance = Math.max(9, (coarse ? TOUCH_HIT_CSS_RADIUS : 12) * canvasScale(canvas))
    const { dist } = pointToSegment(x, y, ax, ay, bx, by)
    if (dist <= grabTolerance) return REF_BODY
    return null
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onDown(e: PointerEvent) {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)
      const { x, y } = getCanvasCoords(e, canvas)
      const W = canvas.width, H = canvas.height
      const idx = findHandle(x, y, W, H, canvas, isCoarse)
      draggingRef.current = idx
      const { REF_EDGE_TOP, REF_EDGE_RIGHT, REF_EDGE_BOTTOM, REF_EDGE_LEFT, REF_BODY, QUAD_BODY, QUAD_RESIZE_A, QUAD_RESIZE_B, QUAD_ROTATE } =
        bodyDragIndices(quadRef.current.length, showReference, referenceRef.current.length)
      if (idx === QUAD_BODY || idx === REF_BODY || idx === REF_EDGE_TOP || idx === REF_EDGE_RIGHT || idx === REF_EDGE_BOTTOM || idx === REF_EDGE_LEFT) {
        bodyDragLastRef.current = { x: x / canvas.width, y: y / canvas.height }
      }

      // Snapshot the drag-start geometry for the locked resize/rotate
      // handles — onMove rebuilds the quad from this on every subsequent
      // move rather than re-deriving directions from a quad that's actively
      // being mutated mid-drag (see LockDrag doc comment).
      lockDragRef.current = null
      if (isLocked && (idx === QUAD_RESIZE_A || idx === QUAD_RESIZE_B || idx === QUAD_ROTATE)) {
        const pts = quadRef.current.map(p => ({ x: p.x * W, y: p.y * H }))
        if (idx === QUAD_ROTATE) {
          const centroid = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 })
          const startAngle = Math.atan2(y - centroid.y, x - centroid.x)
          lockDragRef.current = { kind: "rotate", centroid, startAngle, snapshot: quadRef.current.map(p => ({ ...p })) }
        } else if (corner) {
          const [, tm, , br, bm, bl] = pts
          const upVec = vecSub(tm, bm), frontVec = vecSub(bl, bm), sideVec = vecSub(br, bm)
          if (vecLen(upVec) >= MIN_LOCK_DIR_PX && vecLen(frontVec) >= MIN_LOCK_DIR_PX && vecLen(sideVec) >= MIN_LOCK_DIR_PX) {
            lockDragRef.current = {
              kind: idx === QUAD_RESIZE_A ? "resize-front" : "resize-side",
              anchor: bm,
              upDir: vecUnit(upVec),
              frontDir: vecUnit(frontVec),
              sideDir: vecUnit(sideVec),
            }
          }
          // else: degenerate hexagon (a fold/face edge collapsed to ~0px) —
          // leave lockDragRef null so onMove's resize branch is a no-op
          // instead of computing a (0,0) direction from it.
        } else {
          const [tl, tr] = pts
          const dirW = vecUnit(vecSub(tr, tl))
          const dirH = { x: -dirW.y, y: dirW.x }
          lockDragRef.current = {
            kind: "resize-flat",
            anchor: tl,
            dirW, dirH,
            baseW: lockedAspectRatio ?? 1,
            baseH: 1,
          }
        }
      }
      draw()
    }

    function onMove(e: PointerEvent) {
      if (draggingRef.current === null) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const { x, y } = getCanvasCoords(e, canvas)
      const W = canvas.width
      const H = canvas.height
      const idx = draggingRef.current
      // Quad corners/body stay clamped to the visible photo. Reference points
      // (door/brick/ruler) are NOT clamped — a real object can sit partially
      // outside a tightly-cropped photo, so the client needs to be able to
      // drag the reference past the edge to match what's actually visible.
      const point = {
        x: Math.max(0, Math.min(1, x / W)),
        y: Math.max(0, Math.min(1, y / H)),
      }
      const rawPoint = { x: x / W, y: y / H }
      const quad = quadRef.current
      const reference = referenceRef.current
      const { REF_EDGE_TOP, REF_EDGE_RIGHT, REF_EDGE_BOTTOM, REF_EDGE_LEFT, REF_BODY, QUAD_BODY, QUAD_RESIZE_A, QUAD_RESIZE_B, QUAD_ROTATE } =
        bodyDragIndices(quad.length, showReference, reference.length)

      // Which two of the reference's [TL,TR,BR,BL] corners move together for
      // each edge handle — moving both by the same delta resizes just that
      // dimension while keeping the shape rectangular, unlike dragging a lone
      // corner (which is a deliberate skew for an angled photo).
      const edgePairs: Record<number, [number, number]> = {
        [REF_EDGE_TOP]: [0, 1],
        [REF_EDGE_RIGHT]: [1, 2],
        [REF_EDGE_BOTTOM]: [2, 3],
        [REF_EDGE_LEFT]: [3, 0],
      }

      if (idx < quad.length) {
        quad[idx] = point
      } else if (idx === QUAD_BODY) {
        // Whole-box drag: translate every corner by the pointer delta, clamped
        // so no corner leaves the image. Reposition the box first, then
        // fine-tune individual corners — much less fiddly on a touchscreen
        // than nudging all 4 corners across the photo one at a time.
        const last = bodyDragLastRef.current
        if (last) {
          let dx = point.x - last.x
          let dy = point.y - last.y
          const minX = Math.min(...quad.map(p => p.x))
          const maxX = Math.max(...quad.map(p => p.x))
          const minY = Math.min(...quad.map(p => p.y))
          const maxY = Math.max(...quad.map(p => p.y))
          dx = Math.max(-minX, Math.min(1 - maxX, dx))
          dy = Math.max(-minY, Math.min(1 - maxY, dy))
          for (let i = 0; i < quad.length; i++) {
            quad[i] = { x: quad[i].x + dx, y: quad[i].y + dy }
          }
          bodyDragLastRef.current = point
        }
      } else if (idx === QUAD_RESIZE_A || idx === QUAD_RESIZE_B) {
        // Ratio-locked resize — rebuilds the whole quad from the drag-start
        // snapshot (LockDrag) so width and height only ever move together
        // along the locked ratio; never clamped to [0,1], same rationale as
        // the reference points (whole-body drag, unaffected, stays clamped).
        const drag = lockDragRef.current
        if (drag && drag.kind === "resize-flat") {
          const p = { x, y }
          const diff = vecSub(p, drag.anchor)
          const localW = vecDot(diff, drag.dirW)
          const localH = vecDot(diff, drag.dirH)
          const denom = drag.baseW * drag.baseW + drag.baseH * drag.baseH
          let s = denom > 0 ? (localW * drag.baseW + localH * drag.baseH) / denom : 0
          s = Math.max(4, s)
          const newW = s * drag.baseW
          const newH = s * drag.baseH
          const tl = drag.anchor
          const tr = vecAdd(tl, vecScale(drag.dirW, newW))
          const br = vecAdd(tr, vecScale(drag.dirH, newH))
          const bl = vecAdd(tl, vecScale(drag.dirH, newH))
          quad[0] = { x: tl.x / W, y: tl.y / H }
          quad[1] = { x: tr.x / W, y: tr.y / H }
          quad[2] = { x: br.x / W, y: br.y / H }
          quad[3] = { x: bl.x / W, y: bl.y / H }
        } else if (drag && (drag.kind === "resize-front" || drag.kind === "resize-side")) {
          const isFront = drag.kind === "resize-front"
          const dir = isFront ? drag.frontDir : drag.sideDir
          const ratio = isFront ? lockedFrontRatio! : lockedSideRatio!
          const otherRatio = isFront ? lockedSideRatio! : lockedFrontRatio!
          const p = { x, y }
          const rawWidth = vecDot(vecSub(p, drag.anchor), dir)
          const newWidth = Math.max(4, rawWidth)
          const newHeight = Math.max(4, newWidth / ratio)
          const newOtherWidth = newHeight * otherRatio
          const bm = drag.anchor
          const tm = vecAdd(bm, vecScale(drag.upDir, newHeight))
          const frontW = isFront ? newWidth : newOtherWidth
          const sideW = isFront ? newOtherWidth : newWidth
          const bl = vecAdd(bm, vecScale(drag.frontDir, frontW))
          const br = vecAdd(bm, vecScale(drag.sideDir, sideW))
          const tl = vecAdd(tm, vecScale(drag.frontDir, frontW))
          const tr = vecAdd(tm, vecScale(drag.sideDir, sideW))
          quad[0] = { x: tl.x / W, y: tl.y / H }
          quad[1] = { x: tm.x / W, y: tm.y / H }
          quad[2] = { x: tr.x / W, y: tr.y / H }
          quad[3] = { x: br.x / W, y: br.y / H }
          quad[4] = { x: bm.x / W, y: bm.y / H }
          quad[5] = { x: bl.x / W, y: bl.y / H }
        }
      } else if (idx === QUAD_ROTATE) {
        const drag = lockDragRef.current
        if (drag && drag.kind === "rotate") {
          const angle = Math.atan2(y - drag.centroid.y, x - drag.centroid.x) - drag.startAngle
          drag.snapshot.forEach((p, i) => {
            const px = p.x * W, py = p.y * H
            const rel = vecRotate({ x: px - drag.centroid.x, y: py - drag.centroid.y }, angle)
            quad[i] = { x: (drag.centroid.x + rel.x) / W, y: (drag.centroid.y + rel.y) / H }
          })
        }
      } else if (idx === REF_BODY) {
        // Whole-reference drag: translate every reference point by the
        // pointer delta. Unclamped — the reference can be moved fully
        // outside the photo if that's where the real object actually is.
        const last = bodyDragLastRef.current
        if (last) {
          const dx = rawPoint.x - last.x
          const dy = rawPoint.y - last.y
          for (let i = 0; i < reference.length; i++) {
            reference[i] = { x: reference[i].x + dx, y: reference[i].y + dy }
          }
          bodyDragLastRef.current = rawPoint
        }
      } else if (idx in edgePairs) {
        // Edge-midpoint drag: move both of that edge's corners by the same
        // delta, so the shape stays rectangular while just one dimension
        // resizes — the easier, predictable option for a straight-on photo
        // of a straight door, vs. dragging a lone corner (which skews it).
        const last = bodyDragLastRef.current
        if (last) {
          const dx = rawPoint.x - last.x
          const dy = rawPoint.y - last.y
          const [i1, i2] = edgePairs[idx]
          reference[i1] = { x: reference[i1].x + dx, y: reference[i1].y + dy }
          reference[i2] = { x: reference[i2].x + dx, y: reference[i2].y + dy }
          bodyDragLastRef.current = rawPoint
        }
      } else {
        // Individual reference point — ruler mode's A/B, or one corner of the
        // door/brick sticker quad. Unclamped, and (sticker mode) fully free
        // to move independently, so the quad can be skewed to match an
        // object photographed at an angle instead of always staying a
        // fixed-ratio rectangle.
        reference[idx - quad.length] = rawPoint
      }
      draw()
    }

    // Cursor affordance on desktop (hover, no drag)
    function onHover(e: PointerEvent) {
      if (draggingRef.current !== null) return
      const canvas = canvasRef.current
      if (!canvas || isCoarse) return
      const { x, y } = getCanvasCoords(e, canvas)
      const idx = findHandle(x, y, canvas.width, canvas.height, canvas, false)
      const quad = quadRef.current
      const { REF_EDGE_TOP, REF_EDGE_RIGHT, REF_EDGE_BOTTOM, REF_EDGE_LEFT, REF_BODY, QUAD_BODY, QUAD_RESIZE_A, QUAD_RESIZE_B, QUAD_ROTATE } =
        bodyDragIndices(quad.length, showReference, referenceRef.current.length)
      if (idx === REF_EDGE_TOP || idx === REF_EDGE_BOTTOM) {
        canvas.style.cursor = "ns-resize"
      } else if (idx === REF_EDGE_LEFT || idx === REF_EDGE_RIGHT) {
        canvas.style.cursor = "ew-resize"
      } else if (idx === QUAD_RESIZE_A || idx === QUAD_RESIZE_B) {
        canvas.style.cursor = "nwse-resize"
      } else if (idx === QUAD_ROTATE) {
        canvas.style.cursor = "grab"
      } else if (idx === REF_BODY || idx === QUAD_BODY) {
        canvas.style.cursor = "move"
      } else if (idx !== null) {
        canvas.style.cursor = "grab"
      } else {
        canvas.style.cursor = "crosshair"
      }
    }

    function onUp() {
      if (draggingRef.current !== null) {
        const idx = draggingRef.current
        const quad = quadRef.current
        const { QUAD_BODY, QUAD_RESIZE_A, QUAD_RESIZE_B, QUAD_ROTATE } =
          bodyDragIndices(quad.length, showReference, referenceRef.current.length)
        if (idx < quad.length || idx === QUAD_BODY || idx === QUAD_RESIZE_A || idx === QUAD_RESIZE_B || idx === QUAD_ROTATE) {
          onChange([...quadRef.current])
        } else {
          onReferenceChange?.([...referenceRef.current])
        }
        forceRender(n => n + 1)
      }
      draggingRef.current = null
      bodyDragLastRef.current = null
      lockDragRef.current = null
      draw()
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointermove", onHover)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)

    return () => {
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointermove", onHover)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [getCanvasCoords, onChange, onReferenceChange, isCoarse, referenceIcon, showReference, isLocked, corner, lockedAspectRatio, lockedFrontRatio, lockedSideRatio])

  useEffect(() => { draw() })

  function resetQuad() {
    quadRef.current = lockedDefaultQuad()
    draw()
    onChange([...quadRef.current])
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="w-full cursor-crosshair touch-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {caption ?? (isLocked
            ? "Drag the green square to resize or the green circle to rotate — the box stays true to your sign's proportions."
            : corner
            ? "Line up the orange ◆ dots with the building's corner, then fit the gold box to each wall."
            : "Drag the corners of the gold box until it covers exactly where the sign will go.")}
        </p>
        <button
          type="button"
          onClick={resetQuad}
          className="py-3.5 pl-3 -mr-3 text-xs text-muted-foreground hover:text-foreground underline flex-shrink-0"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
