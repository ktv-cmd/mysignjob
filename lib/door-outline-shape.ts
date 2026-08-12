// The constrained "door outline" shape model — move / uniform-zoom / rotate /
// yaw, never a free 4-corner skew. Shared by QuadSelector.tsx's own
// door-reference mode and components/order/DoorCornerTap.tsx's dedicated
// capture screen, so both speak the exact same parametric rectangle.
//
// Why constrained at all, instead of letting the client drag each corner
// independently: an unconstrained quad can be dragged into a shape no real
// rectangle ever projects to, which matters beyond looks — the outline's
// shape is what a homography solve (lib/sign-homography.ts) treats as "the
// door," so an impossible shape silently corrupts the measurement. Every
// shape this model can produce is a genuine rectangle seen from some real
// camera position: `yaw` alone is enough to fit a door photographed at an
// angle (the two side edges taper asymmetrically), without ever letting the
// outline become a non-rectangle.

import type { Pt } from "@/lib/canvas-touch"

export type RefParams = {
  cx: number   // center, fraction of canvas width
  cy: number   // center, fraction of canvas height
  h: number    // un-swung height, fraction of canvas height
  w: number    // un-swung width — also a fraction of canvas HEIGHT, so w/h is a true on-screen ratio
  rot: number  // in-plane rotation (radians) — a crooked or tilted phone
  yaw: number  // swing about the object's own vertical axis — storefront shot from off to one side
}

// A 36x80" door — the common storefront case. Purely a visual starting
// point; only h and yaw end up mattering to the homography solve, which
// reads the outline's actual projected corners, not this nominal ratio.
export const DOOR_ASPECT = 0.45

// Half-width ÷ distance-to-camera. Fixing this lets `yaw` alone drive the
// perspective taper; a second "how far back were you standing" control would
// be more faithful but isn't worth the interaction cost.
export const YAW_PERSPECTIVE = 0.28
export const MAX_YAW = Math.PI / 3
export const MIN_REF_H = 0.03
export const MAX_REF_H = 4
export const MIN_REF_W = 0.01

export function defaultRefParams(): RefParams {
  const h = 0.15
  return { cx: 0.5, cy: 0.825, h, w: h * DOOR_ASPECT, rot: 0, yaw: 0 }
}

// Project the parameterized rectangle down to the four normalized
// [TL,TR,BR,BL] points the rest of the pipeline speaks — always in this
// exact order by construction, so callers never need to re-canonicalize
// (unlike raw free-tapped corners, which can arrive in any order).
export function refQuadFromParams(p: RefParams, W: number, H: number): Pt[] {
  const hPx = p.h * H
  const halfW = Math.max((p.w * H) / 2, 1)
  const depth = halfW / YAW_PERSPECTIVE
  const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw)
  // Pinhole projection of the two vertical edges: the edge swung toward the
  // camera is nearer, so it lands both taller and further from center.
  const edge = (u: number) => {
    const k = depth / Math.max(depth + u * sinY, depth * 0.2)
    return { x: u * cosY * k, half: (hPx / 2) * k }
  }
  const left = edge(-halfW), right = edge(halfW)
  const cosR = Math.cos(p.rot), sinR = Math.sin(p.rot)
  const place = (x: number, y: number): Pt => ({
    x: (p.cx * W + x * cosR - y * sinR) / W,
    y: (p.cy * H + x * sinR + y * cosR) / H,
  })
  return [
    place(left.x, -left.half),
    place(right.x, -right.half),
    place(right.x, right.half),
    place(left.x, left.half),
  ]
}

// A grip parked on a short stem outside the shape, pointing away from its
// center — keeps the rotate/swing handles clear of the outline itself, and
// of each other, however the shape is currently oriented. Clamped into the
// canvas because the common case puts the shape near the bottom of the
// frame, where an unclamped swing stem would hang off the edge and simply
// couldn't be grabbed.
export function stemHandlePos(from: Pt, centroid: Pt, len: number, W: number, H: number, margin: number): Pt {
  const dx = from.x - centroid.x, dy = from.y - centroid.y
  const dist = Math.hypot(dx, dy)
  const pos = dist < 0.001 ? from : { x: from.x + (dx / dist) * len, y: from.y + (dy / dist) * len }
  return {
    x: Math.max(margin, Math.min(W - margin, pos.x)),
    y: Math.max(margin, Math.min(H - margin, pos.y)),
  }
}

// Bilinear interpolation across an arbitrary quad [TL,TR,BR,BL] — s=0..1
// left→right, t=0..1 top→bottom. Lets the door's decorative details
// (panels, knob) sit at the same relative position regardless of the
// outline's current rotation/yaw/scale.
export function bilerpQuad(tl: Pt, tr: Pt, br: Pt, bl: Pt, s: number, t: number): Pt {
  const top = { x: tl.x + (tr.x - tl.x) * s, y: tl.y + (tr.y - tl.y) * s }
  const bottom = { x: bl.x + (br.x - bl.x) * s, y: bl.y + (br.y - bl.y) * s }
  return { x: top.x + (bottom.x - top.x) * t, y: top.y + (bottom.y - top.y) * t }
}

// Semi-transparent door silhouette (rounded slab + panels + knob) drawn
// across the [TL,TR,BR,BL] quad — reads as "door" at a glance instead of an
// abstract shape, at any rotation/yaw/scale the outline is currently at.
export function drawDoorIcon(ctx: CanvasRenderingContext2D, tl: Pt, tr: Pt, br: Pt, bl: Pt) {
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
