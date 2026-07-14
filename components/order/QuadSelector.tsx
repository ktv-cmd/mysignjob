"use client"

import { useRef, useEffect, useState, useCallback } from "react"

export type QuadPoint = { x: number; y: number } // normalized 0–1

interface Props {
  imageDataUrl: string
  onChange: (quad: QuadPoint[]) => void // [TL,TR,BR,BL] flat | [TL,TM,TR,BR,BM,BL] corner
  corner?: boolean
  onReferenceChange?: (points: QuadPoint[]) => void // [A,B] — 2-point reference line
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void
  referenceLabel?: string // Label chip text shown at midpoint — never a number
  referenceIcon?: "door" | "brick" | "ruler" // visual overlay for the reference object — icon to place on top of the real object, instead of a plain ruler
  showReference?: boolean // when false, hides the reference overlay entirely and excludes it from hit-testing (client already knows the sign's exact size)
}

const HANDLE_RADIUS = 10
const GOLD = "#FFD740"
const FOLD_COLOR = "#FF8C42"  // orange — fold handles are visually distinct
const REFERENCE_COLOR = "#00E5FF" // cyan — reference line, distinct from quad/fold

// Touch-only sizing: visible dot stays modest, but the invisible grab zone
// clears Apple's ~44px minimum tap target so fingers don't need pixel accuracy.
const TOUCH_HANDLE_CSS_RADIUS = 14
const TOUCH_HIT_CSS_RADIUS = 24

// Magnifier loupe (touch only) — shown while dragging so the target point
// isn't hidden under the fingertip.
const LOUPE_CSS_RADIUS = 60
const LOUPE_ZOOM = 2.5
const LOUPE_CSS_OFFSET = 90

// Minimum length (in CSS px) for the door/brick reference to prevent collapse
const MIN_REF_LEN_CSS_PX = 24

// Resize grip dimensions (CSS px) for door/brick sticker mode
const GRIP_W_CSS = 44
const GRIP_H_CSS = 22

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

// Short vertical segment near the bottom of the frame — away from the default
// quad box (which sits in the y 0.15–0.43 band) so the two don't overlap.
function defaultReference(): QuadPoint[] {
  return [
    { x: 0.5, y: 0.75 },
    { x: 0.5, y: 0.9 },
  ]
}

// canvas-space px per 1 css px, given the element's current on-screen size
function canvasScale(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  return rect.width ? canvas.width / rect.width : 1
}

function drawLoupe(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, W: number, H: number, px: number, py: number) {
  const scale = canvasScale(canvas)
  const loupeRadius = LOUPE_CSS_RADIUS * scale
  const srcRadius = loupeRadius / LOUPE_ZOOM
  const vOffset = LOUPE_CSS_OFFSET * scale

  let cx = Math.max(loupeRadius, Math.min(W - loupeRadius, px))
  let cy = py - vOffset
  if (cy - loupeRadius < 0) cy = py + vOffset
  cy = Math.max(loupeRadius, Math.min(H - loupeRadius, cy))

  const sw = srcRadius * 2
  const sh = srcRadius * 2
  const sx = Math.max(0, Math.min(W - sw, px - srcRadius))
  const sy = Math.max(0, Math.min(H - sh, py - srcRadius))

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, loupeRadius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = "#111"
  ctx.fillRect(cx - loupeRadius, cy - loupeRadius, loupeRadius * 2, loupeRadius * 2)
  // Canvas-as-source: cheap way to magnify what's already rendered (photo + quad overlay).
  ctx.drawImage(canvas, sx, sy, sw, sh, cx - loupeRadius, cy - loupeRadius, loupeRadius * 2, loupeRadius * 2)

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

// Semi-transparent door silhouette (rounded slab + knob) drawn along the A→B
// reference line so the client can drag it to sit on top of a real door.
function drawDoorIcon(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  const width = len * 0.45 // standard door ~36" wide against an 80" height reference

  const corners = [
    { x: ax + px * width / 2, y: ay + py * width / 2 },
    { x: ax - px * width / 2, y: ay - py * width / 2 },
    { x: bx - px * width / 2, y: by - py * width / 2 },
    { x: bx + px * width / 2, y: by + py * width / 2 },
  ]

  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.6)"
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(corners[0].x, corners[0].y)
  corners.slice(1).forEach(c => ctx.lineTo(c.x, c.y))
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
    const w = width * 0.56
    const p1x = ax + ux * len * fromT, p1y = ay + uy * len * fromT
    const p2x = ax + ux * len * toT, p2y = ay + uy * len * toT
    ctx.beginPath()
    ctx.moveTo(p1x + px * w / 2, p1y + py * w / 2)
    ctx.lineTo(p1x - px * w / 2, p1y - py * w / 2)
    ctx.lineTo(p2x - px * w / 2, p2y - py * w / 2)
    ctx.lineTo(p2x + px * w / 2, p2y + py * w / 2)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(120,66,18,0.8)"
  ctx.lineWidth = 2
  panel(0.12, 0.44)
  panel(0.56, 0.88)

  // Knob, roughly waist-height on the handle side
  const knobX = ax + ux * len * 0.5 + px * width * 0.38
  const knobY = ay + uy * len * 0.5 + py * width * 0.38
  ctx.beginPath()
  ctx.arc(knobX, knobY, Math.max(4, width * 0.07), 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.fill()
  ctx.strokeStyle = "rgba(60,40,20,0.9)"
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

// Semi-transparent brick silhouette (single course + mortar joint) drawn
// along the A→B reference line so the client can drag it onto a real brick.
function drawBrickIcon(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  const width = len * 2 // standard brick ~16" long against an 8" course-height reference

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(ax + px * width / 2, ay + py * width / 2)
  ctx.lineTo(ax - px * width / 2, ay - py * width / 2)
  ctx.lineTo(bx - px * width / 2, by - py * width / 2)
  ctx.lineTo(bx + px * width / 2, by + py * width / 2)
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

  // Mortar joint down the middle of the brick face
  const midX = (ax + bx) / 2, midY = (ay + by) / 2
  ctx.beginPath()
  ctx.moveTo(midX + px * width / 2, midY + py * width / 2)
  ctx.lineTo(midX - px * width / 2, midY - py * width / 2)
  ctx.strokeStyle = "rgba(255,255,255,0.6)"
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

// Draw the resize grip pill at point B (canvas px coords) for door/brick sticker mode.
// Returns the pill rect (canvas px) so hit-testing can reuse it.
function drawResizeGrip(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  scale: number,
  coarse: boolean,
): { left: number; top: number; right: number; bottom: number } {
  const gripW = GRIP_W_CSS * scale
  const gripH = GRIP_H_CSS * scale
  const rx = gripW / 2 // pill corner radius

  const left = bx - gripW / 2
  const top = by - gripH / 2
  const right = bx + gripW / 2
  const bottom = by + gripH / 2

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(left, top, gripW, gripH, rx)
  ctx.fillStyle = "white"
  ctx.fill()
  ctx.strokeStyle = "rgba(120,66,18,0.95)"
  ctx.lineWidth = 2.5
  ctx.stroke()

  // ↕ glyph centered in pill
  ctx.fillStyle = "rgba(120,66,18,0.95)"
  ctx.font = `bold ${Math.round(gripH * 0.65)}px system-ui`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("↕", bx, by)
  ctx.restore()

  // return slightly expanded rect for hit-testing when coarse
  const expand = coarse ? TOUCH_HIT_CSS_RADIUS * scale : 0
  return {
    left: left - expand,
    top: top - expand,
    right: right + expand,
    bottom: bottom + expand,
  }
}

export default function QuadSelector({ imageDataUrl, onChange, corner = false, onReferenceChange, onImageLoad, referenceLabel = "reference", referenceIcon = "ruler", showReference = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const quadRef = useRef<QuadPoint[]>(defaultQuad(corner))
  const referenceRef = useRef<QuadPoint[]>(defaultReference())
  const draggingRef = useRef<number | null>(null)
  // Last pointer position (normalized) while dragging the whole reference icon body
  const bodyDragLastRef = useRef<{ x: number; y: number } | null>(null)
  const prevCornerRef = useRef(corner)
  // Cached grip rect in canvas px (updated each draw, used by findHandle)
  const gripRectRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null)
  const [, forceRender] = useState(0)
  const [isCoarse, setIsCoarse] = useState(false)

  // Detect touch/coarse-pointer devices so mobile affordances stay off desktop.
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const update = () => setIsCoarse(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // When referenceIcon changes to door/brick, snap any non-vertical reference
  // so B.x === A.x (keeps the normalized length, only zeroes horizontal offset).
  useEffect(() => {
    if (referenceIcon === "door" || referenceIcon === "brick") {
      const ref = referenceRef.current
      if (ref[1].x !== ref[0].x) {
        referenceRef.current = [
          { ...ref[0] },
          { x: ref[0].x, y: ref[1].y },
        ]
        onReferenceChange?.([...referenceRef.current])
        draw()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceIcon])

  // Reset quad when corner mode toggles
  useEffect(() => {
    if (prevCornerRef.current !== corner) {
      quadRef.current = defaultQuad(corner)
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

      // Handles
      const handleColors = [GOLD, FOLD_COLOR, GOLD, GOLD, FOLD_COLOR, GOLD]
      const handleLabels = ["TL", "◆", "TR", "BR", "◆", "BL"]
      pts.forEach((p, i) => {
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

    // ── Reference line — ruler/measuring-tape treatment ──
    const reference = referenceRef.current
    const refPts = reference.map(p => ({ x: p.x * W, y: p.y * H }))
    const refActiveIdx = activeIdx !== null && activeIdx >= quad.length ? activeIdx - quad.length : null
    const isStickerMode = referenceIcon === "door" || referenceIcon === "brick"

    if (showReference) {
    {
      const ax = refPts[0].x, ay = refPts[0].y
      const bx = refPts[1].x, by = refPts[1].y
      const dx = bx - ax, dy = by - ay
      const len = Math.hypot(dx, dy)

      if (len > 1) {
        const ux = dx / len, uy = dy / len   // unit vector along segment
        const px = -uy, py = ux              // unit perpendicular (rotated 90°)

        if (referenceIcon === "door") {
          drawDoorIcon(ctx, ax, ay, bx, by)
        } else if (referenceIcon === "brick") {
          drawBrickIcon(ctx, ax, ay, bx, by)
        } else {
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
    }

    if (isStickerMode) {
      // Sticker mode: render only the resize grip at B; no A/B endpoint circles.
      const scale = canvasScale(canvas)
      const bx = refPts[1].x, by = refPts[1].y
      const rect = drawResizeGrip(ctx, bx, by, scale, isCoarse)
      gripRectRef.current = rect
    } else {
      // Ruler mode: render classic A/B endpoint circles.
      gripRectRef.current = null
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
    } else {
      gripRectRef.current = null
    }

    // Loupe: show for touch drags, but NOT for reference indices in sticker mode.
    const showLoupe = isCoarse && activeIdx !== null && activeIdx < quad.length + 2
    const suppressLoupeForSticker = isStickerMode && activeIdx !== null && activeIdx >= quad.length
    if (showLoupe && !suppressLoupeForSticker) {
      const activePt = activeIdx! < quad.length ? pts[activeIdx!] : refPts[activeIdx! - quad.length]
      drawLoupe(ctx, canvas, W, H, activePt.x, activePt.y)
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

  // Combined index space: 0..quad.length-1 are quad handles, quad.length and
  // quad.length+1 are the reference-line endpoints, quad.length+2 means "the
  // whole reference icon body" (grab anywhere on the door/brick and move it) —
  // shared so a single pointer-tracking codepath (findHandle/onMove/onUp)
  // drives all of them.
  function findHandle(x: number, y: number, W: number, H: number, canvas: HTMLCanvasElement, coarse: boolean): number | null {
    const quad = quadRef.current
    const reference = referenceRef.current
    const isStickerMode = referenceIcon === "door" || referenceIcon === "brick"

    // In sticker mode: only quad handles are in the allPoints array (no A/B circles).
    // In ruler mode: all points including A and B are hit-testable.
    // When showReference is false, the reference is invisible — never include
    // it in hit-testing so users can't accidentally interact with it.
    const allPoints = (!showReference || isStickerMode) ? [...quad] : [...quad, ...reference]

    let hit: number | null = null
    if (!coarse) {
      for (let i = 0; i < allPoints.length; i++) {
        const dist = Math.hypot(x - allPoints[i].x * W, y - allPoints[i].y * H)
        if (dist <= HANDLE_RADIUS * 1.8) { hit = i; break }
      }
    } else {
      const tolerance = TOUCH_HIT_CSS_RADIUS * canvasScale(canvas)
      let nearestDist = Infinity
      allPoints.forEach((p, i) => {
        const dist = Math.hypot(x - p.x * W, y - p.y * H)
        if (dist <= tolerance && dist < nearestDist) {
          nearestDist = dist
          hit = i
        }
      })
    }
    if (hit !== null) return hit

    if (!showReference) return null

    if (isStickerMode) {
      // Sticker mode: check resize grip BEFORE body drag, so the grip wins.
      const grip = gripRectRef.current
      if (grip && x >= grip.left && x <= grip.right && y >= grip.top && y <= grip.bottom) {
        return quad.length + 1 // B (resize grip)
      }
    }

    // Body drag hit-test — check the reference icon silhouette.
    const ax = reference[0].x * W, ay = reference[0].y * H
    const bx = reference[1].x * W, by = reference[1].y * H
    const len = Math.hypot(bx - ax, by - ay)
    const halfWidth =
      referenceIcon === "door" ? (len * 0.45) / 2 :
      referenceIcon === "brick" ? len : // brick is drawn 2× the segment length wide
      9 // ruler band half-width
    const grabTolerance = Math.max(halfWidth, (coarse ? TOUCH_HIT_CSS_RADIUS : 12) * canvasScale(canvas))
    const { dist } = pointToSegment(x, y, ax, ay, bx, by)
    if (dist <= grabTolerance) return quad.length + 2
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
      draggingRef.current = findHandle(x, y, canvas.width, canvas.height, canvas, isCoarse)
      if (draggingRef.current === quadRef.current.length + 2) {
        bodyDragLastRef.current = { x: x / canvas.width, y: y / canvas.height }
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
      const point = {
        x: Math.max(0, Math.min(1, x / W)),
        y: Math.max(0, Math.min(1, y / H)),
      }
      const quad = quadRef.current
      const isStickerMode = referenceIcon === "door" || referenceIcon === "brick"

      if (idx < quad.length) {
        quad[idx] = point
      } else if (idx === quad.length + 2) {
        // Whole-icon drag: translate both reference endpoints by the pointer
        // delta, clamped so neither endpoint leaves the image.
        const last = bodyDragLastRef.current
        if (last) {
          const ref = referenceRef.current
          let dx = point.x - last.x
          let dy = point.y - last.y
          const minX = Math.min(ref[0].x, ref[1].x)
          const maxX = Math.max(ref[0].x, ref[1].x)
          const minY = Math.min(ref[0].y, ref[1].y)
          const maxY = Math.max(ref[0].y, ref[1].y)
          dx = Math.max(-minX, Math.min(1 - maxX, dx))
          dy = Math.max(-minY, Math.min(1 - maxY, dy))
          ref[0] = { x: ref[0].x + dx, y: ref[0].y + dy }
          ref[1] = { x: ref[1].x + dx, y: ref[1].y + dy }
          bodyDragLastRef.current = point
        }
      } else if (idx === quad.length + 1 && isStickerMode) {
        // Resize grip drag (sticker mode): B.y only; B.x locked to A.x; enforce min length.
        const ref = referenceRef.current
        const minLenNorm = MIN_REF_LEN_CSS_PX / H
        const newByY = Math.max(0, Math.min(1, point.y))
        const clampedY = Math.max(ref[0].y + minLenNorm, newByY)
        referenceRef.current[1] = { x: ref[0].x, y: clampedY }
      } else {
        // Ruler mode: A or B endpoint free drag
        referenceRef.current[idx - quad.length] = point
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
      const isStickerMode = referenceIcon === "door" || referenceIcon === "brick"
      const quad = quadRef.current
      if (idx === quad.length + 1 && isStickerMode) {
        canvas.style.cursor = "ns-resize"
      } else if (idx === quad.length + 2) {
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
        if (idx < quadRef.current.length) {
          onChange([...quadRef.current])
        } else {
          onReferenceChange?.([...referenceRef.current])
        }
        forceRender(n => n + 1)
      }
      draggingRef.current = null
      bodyDragLastRef.current = null
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
  }, [getCanvasCoords, onChange, onReferenceChange, isCoarse, referenceIcon, showReference])

  useEffect(() => { draw() })

  function resetQuad() {
    quadRef.current = defaultQuad(corner)
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
          {corner
            ? "Line up the orange ◆ dots with the building's corner, then fit the gold box to each wall."
            : "Drag the corners of the gold box until it covers exactly where the sign will go."}
        </p>
        <button
          type="button"
          onClick={resetQuad}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
