// Shared canvas-px-space pointer/vector/loupe helpers for photo-annotation
// components (QuadSelector's quad + reference handles, DoorCornerTap's
// corner pins). Extracted once a second consumer needed them — see
// QuadSelector.tsx's own comment history for why these lived there first.

export type Pt = { x: number; y: number }

// ── Small vector helpers (canvas-px space) ─────────────────────────────────
export function vecSub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, y: a.y - b.y } }
export function vecAdd(a: Pt, b: Pt): Pt { return { x: a.x + b.x, y: a.y + b.y } }
export function vecScale(a: Pt, s: number): Pt { return { x: a.x * s, y: a.y * s } }
export function vecLen(a: Pt): number { return Math.hypot(a.x, a.y) }
export function vecUnit(a: Pt): Pt { const l = vecLen(a) || 1; return { x: a.x / l, y: a.y / l } }
export function vecDot(a: Pt, b: Pt): number { return a.x * b.x + a.y * b.y }
export function vecRotate(a: Pt, angle: number): Pt {
  const c = Math.cos(angle), s = Math.sin(angle)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}

// Point-in-polygon (ray casting) — hit-tests "inside the shape body" for
// whole-shape drag. Works for any simple polygon, including a non-convex hexagon.
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// canvas-space px per 1 css px, given the element's current on-screen size
export function canvasScale(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect()
  return rect.width ? canvas.width / rect.width : 1
}

// Client (pointer event) coordinates -> canvas-px coordinates, accounting for
// CSS scaling between the canvas's backing resolution and its on-screen size.
export function getCanvasCoords(e: PointerEvent, canvas: HTMLCanvasElement): Pt {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

// Touch-only sizing: visible dot stays modest, but the invisible grab zone
// clears Apple's ~44px minimum tap target so fingers don't need pixel accuracy.
export const HANDLE_RADIUS = 10
export const TOUCH_HANDLE_CSS_RADIUS = 14
export const TOUCH_HIT_CSS_RADIUS = 24

// Magnifier loupe (touch only) — shown while dragging so the target point
// isn't hidden under the fingertip.
export const LOUPE_CSS_RADIUS = 60
export const LOUPE_ZOOM = 2.5
export const LOUPE_CSS_OFFSET = 90

export function drawLoupe(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  W: number,
  H: number,
  px: number,
  py: number,
  accentColor = "#FFD740"
) {
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
  ctx.strokeStyle = accentColor
  ctx.lineWidth = 3
  ctx.stroke()
}
