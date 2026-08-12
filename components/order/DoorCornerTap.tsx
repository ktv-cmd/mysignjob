"use client"

import { useRef, useEffect, useState } from "react"
import {
  type Pt,
  getCanvasCoords, canvasScale, drawLoupe,
  TOUCH_HANDLE_CSS_RADIUS, TOUCH_HIT_CSS_RADIUS,
} from "@/lib/canvas-touch"
import {
  type RefParams,
  MAX_YAW, MIN_REF_H, MAX_REF_H, MIN_REF_W,
  defaultRefParams, refQuadFromParams, stemHandlePos, drawDoorIcon,
} from "@/lib/door-outline-shape"

export type QuadPoint = { x: number; y: number } // normalized 0–1

interface Props {
  imageDataUrl: string
  // The photo's real pixel dimensions, as already known by the parent (set
  // when the photo was first captured/uploaded) — driving the canvas's own
  // aspect ratio from this prop, rather than re-reading naturalWidth/Height
  // off this component's own <img> load, keeps a single source of truth
  // instead of two loads of the same photo that could in principle disagree.
  imgDims: { w: number; h: number }
  // Fires whenever a drag settles (pointer up) — never mid-drag — with the 4
  // corners already in [TL,TR,BR,BL] order by construction (the outline is a
  // parametric rectangle, never raw free-tapped points, so there's nothing
  // to canonicalize the way ARMeasureCapture's taps need orderQuad).
  onCorners: (corners: QuadPoint[]) => void
  onCancel?: () => void
}

const ACCENT = "#00E5FF" // cyan — matches QuadSelector's reference-element convention
const CANVAS_W = 960

const CORNER_GRIP_CSS = 9
const STEM_HANDLE_CSS_RADIUS = 9
const STEM_CSS_LEN = 30

type DragKind = "scale" | "yaw" | "body"
type DragState = { kind: DragKind; start: RefParams; startDist: number; startAngle: number }

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator
}

// Native "Scan Documents"-style capture, constrained the same way
// QuadSelector's own door-reference outline is (see lib/door-outline-shape.ts):
// move, uniform zoom, and yaw — never a free 4-corner skew, so the shape is
// always a genuine rectangle seen from some real camera position, which is
// what the homography solve (lib/sign-homography.ts) assumes it's getting.
// No in-plane rotate handle here (unlike QuadSelector's own door-reference
// mode, which keeps one) — a phone held slightly tilted barely affects the
// homography solve, so it wasn't worth a second handle; yaw (fitting a door
// photographed at an angle) is the one that matters.
//
// The yaw drag is angle-based, not a linear left-right slide: you drag in an
// arc around the outline's own center, same gesture math QuadSelector's
// rotate handle uses, so it reads as physically swinging the door around a
// vertical line rather than sliding a flat control.
//
// A magnifier loupe shows while dragging on touch, and a haptic tick fires
// when yaw settles back near 0 ("you've straightened it out"). Disclosure
// copy (pricing-estimate-only, assumed-height messaging) is intentionally
// NOT rendered here — it lives in the parent, matching the existing pattern
// where ARMeasureCapture is similarly "dumb".
export default function DoorCornerTap({ imageDataUrl, imgDims, onCorners, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const paramsRef = useRef<RefParams>(defaultRefParams())
  const dragRef = useRef<DragState | null>(null)
  const bodyDragLastRef = useRef<Pt | null>(null)
  const activeKindRef = useRef<DragKind | null>(null)
  const wasNearStraightRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const reportedInitialRef = useRef(false)
  const [imgReady, setImgReady] = useState(false)
  // Read up front (a plain browser-global check, not deferred into an
  // effect) so the initial render already reflects the real pointer type —
  // a synchronous setState from inside a mount effect is a React footgun
  // (cascading extra render pass). The effect below only subscribes to
  // later changes (e.g. a touch device with a mouse plugged in).
  const [isCoarse, setIsCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  )

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const onChange = () => setIsCoarse(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  function emitCorners() {
    const W = canvasRef.current?.width ?? 1, H = canvasRef.current?.height ?? 1
    onCorners(refQuadFromParams(paramsRef.current, W, H))
  }

  function draw(loupeAt: Pt | null) {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext("2d")!
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)

    const p = paramsRef.current
    const pts = refQuadFromParams(p, W, H).map(pt => ({ x: pt.x * W, y: pt.y * H }))
    const [tl, tr, br, bl] = pts
    drawDoorIcon(ctx, tl, tr, br, bl)

    const centroid = { x: (tl.x + tr.x + br.x + bl.x) / 4, y: (tl.y + tr.y + br.y + bl.y) / 4 }
    const bottomMid = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 }

    const scale = isCoarse ? canvasScale(canvas) : 1
    const active = activeKindRef.current

    // Corner grips — square, all four scale the whole outline uniformly
    // about its center (proportions kept), rather than dragging one corner
    // free. Four big, identical targets for the single most common
    // adjustment beats one, especially on a phone.
    const gripR = (active === "scale" ? CORNER_GRIP_CSS * 1.25 : CORNER_GRIP_CSS) * scale
    pts.forEach(pt => {
      if (active === "scale") {
        ctx.beginPath()
        ctx.roundRect(pt.x - gripR - 4, pt.y - gripR - 4, gripR * 2 + 8, gripR * 2 + 8, 5)
        ctx.strokeStyle = "rgba(0,229,255,0.55)"
        ctx.lineWidth = 3
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.roundRect(pt.x - gripR, pt.y - gripR, gripR * 2, gripR * 2, 3)
      ctx.fillStyle = "#ffffff"
      ctx.fill()
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 2.5
      ctx.stroke()
    })

    // Yaw (⇆), on a dashed stem below the outline — dragged in an arc around
    // the centroid (see onMove), not slid left-right, so the gesture itself
    // reads as swinging the door around a vertical line.
    const stemLen = STEM_CSS_LEN * scale
    const stemR = (isCoarse ? STEM_HANDLE_CSS_RADIUS * 1.3 : STEM_HANDLE_CSS_RADIUS) * scale
    const stemMargin = stemR + 2
    const yawPos = stemHandlePos(bottomMid, centroid, stemLen, W, H, stemMargin)
    ctx.save()
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(bottomMid.x, bottomMid.y)
    ctx.lineTo(yawPos.x, yawPos.y)
    ctx.stroke()
    ctx.restore()
    const yawR = active === "yaw" ? stemR * 1.25 : stemR
    ctx.beginPath()
    ctx.arc(yawPos.x, yawPos.y, yawR, 0, Math.PI * 2)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.fillStyle = "#00565F"
    ctx.font = `${Math.round(yawR * 1.3)}px system-ui`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("⇆", yawPos.x, yawPos.y)

    if (loupeAt) drawLoupe(ctx, canvas, img, W, H, loupeAt.x, loupeAt.y, ACCENT)
  }

  // Load the photo once. Canvas backing resolution is driven by the imgDims
  // prop's aspect ratio (960 wide, same convention QuadSelector uses),
  // never re-derived from this <img>'s own naturalWidth/Height.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = CANVAS_W
        canvas.height = Math.round(CANVAS_W * (imgDims.h / imgDims.w))
      }
      setImgReady(true)
    }
    img.src = imageDataUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl])

  useEffect(() => {
    if (imgReady) draw(null)
  }, [imgReady, isCoarse])

  // Report the default outline once on mount — mirrors QuadSelector's
  // "parent state is never left null" convention.
  useEffect(() => {
    if (reportedInitialRef.current) return
    reportedInitialRef.current = true
    emitCorners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function findKind(x: number, y: number): DragKind | null {
      const W = canvas!.width, H = canvas!.height
      const scale = canvasScale(canvas!)
      const hitR = isCoarse ? TOUCH_HIT_CSS_RADIUS * scale : TOUCH_HANDLE_CSS_RADIUS * scale * 0.6
      const p = paramsRef.current
      const pts = refQuadFromParams(p, W, H).map(pt => ({ x: pt.x * W, y: pt.y * H }))
      const [tl, tr, br, bl] = pts
      const centroid = { x: (tl.x + tr.x + br.x + bl.x) / 4, y: (tl.y + tr.y + br.y + bl.y) / 4 }
      const bottomMid = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 }
      const stemLen = STEM_CSS_LEN * (isCoarse ? scale : 1)
      const stemR = (isCoarse ? STEM_HANDLE_CSS_RADIUS * 1.3 : STEM_HANDLE_CSS_RADIUS) * (isCoarse ? scale : 1)
      const stemMargin = stemR + 2
      const yawPos = stemHandlePos(bottomMid, centroid, stemLen, W, H, stemMargin)

      if (Math.hypot(x - yawPos.x, y - yawPos.y) <= hitR) return "yaw"
      for (const pt of pts) {
        if (Math.hypot(x - pt.x, y - pt.y) <= hitR) return "scale"
      }
      // Point-in-polygon (ray casting) against the 4 projected corners.
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j]
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
      }
      return inside ? "body" : null
    }

    function checkHaptic() {
      const nearStraight = Math.abs(paramsRef.current.yaw) < 0.03
      if (nearStraight && !wasNearStraightRef.current && canVibrate()) navigator.vibrate(10)
      wasNearStraightRef.current = nearStraight
    }

    function onDown(e: PointerEvent) {
      const { x, y } = getCanvasCoords(e, canvas!)
      const kind = findKind(x, y)
      if (!kind) return
      activeKindRef.current = kind
      const p = paramsRef.current
      const center = { x: p.cx * canvas!.width, y: p.cy * canvas!.height }
      const offset = { x: x - center.x, y: y - center.y }
      if (kind === "body") {
        bodyDragLastRef.current = { x: x / canvas!.width, y: y / canvas!.height }
        dragRef.current = null
      } else {
        dragRef.current = {
          kind,
          start: { ...p },
          startDist: Math.max(Math.hypot(offset.x, offset.y), 1),
          startAngle: Math.atan2(offset.y, offset.x),
        }
      }
      wasNearStraightRef.current = false
      try { canvas!.setPointerCapture(e.pointerId) } catch { /* not every environment supports capture */ }
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(null) })
    }

    function onMove(e: PointerEvent) {
      if (!activeKindRef.current) return
      const { x, y } = getCanvasCoords(e, canvas!)
      const W = canvas!.width, H = canvas!.height

      const drag = dragRef.current
      if (drag) {
        const s = drag.start
        const center = { x: s.cx * W, y: s.cy * H }
        const offset = { x: x - center.x, y: y - center.y }
        const next = { ...s }
        if (drag.kind === "scale") {
          const factor = Math.hypot(offset.x, offset.y) / drag.startDist
          next.h = Math.min(MAX_REF_H, Math.max(MIN_REF_H, s.h * factor))
          next.w = Math.max(MIN_REF_W, s.w * (next.h / s.h))
        } else if (drag.kind === "yaw") {
          // Angle-based, not a linear slide: dragging in an arc around the
          // outline's own center swings it, the same gesture math the
          // (now-removed) rotate handle used — but the result still only
          // ever updates `yaw`, never `rot`, so the outline stays a genuine
          // rectangle-from-some-angle rather than tilting in-plane.
          const angleDelta = Math.atan2(offset.y, offset.x) - drag.startAngle
          next.yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, s.yaw + angleDelta))
        }
        paramsRef.current = next
      } else if (bodyDragLastRef.current) {
        const rawPoint = { x: x / W, y: y / H }
        const last = bodyDragLastRef.current
        const p = paramsRef.current
        paramsRef.current = { ...p, cx: p.cx + (rawPoint.x - last.x), cy: p.cy + (rawPoint.y - last.y) }
        bodyDragLastRef.current = rawPoint
      }

      checkHaptic()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        draw(isCoarse ? { x, y } : null)
      })
    }

    function onUp() {
      if (!activeKindRef.current) return
      activeKindRef.current = null
      dragRef.current = null
      bodyDragLastRef.current = null
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(null) })
      emitCorners()
    }

    canvas.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      canvas.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoarse, onCorners])

  function reset() {
    paramsRef.current = defaultRefParams()
    draw(null)
    emitCorners()
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border">
        <canvas ref={canvasRef} width={960} height={540} className="w-full touch-none cursor-grab" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Move, resize, and swing (⇆) the door outline to match your real door.
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" onClick={reset} className="py-3.5 pl-3 -mr-1 text-xs text-muted-foreground hover:text-foreground underline">
            Reset
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground underline">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
