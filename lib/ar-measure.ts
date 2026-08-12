// Pure client-side AR measurement geometry — the correctness core for the
// WebXR "tap 4 corners on a wall" measurement flow.
//
// WHY this file exists as a standalone module: a WebXR AR session can only be
// exercised on a physical Android device (no headless emulator for hit-test
// + camera pose), so it is fundamentally untestable in CI. Every bit of math
// that can be wrong — projecting a tapped 3D point back to the screen,
// ordering 4 taps into a sane quad, converting metres to inches, judging how
// "rectangular" the taps were — is pulled out into plain functions here so
// it can be unit-tested headlessly. The React/WebXR layer that calls this
// module should do nothing but plumb `XRFrame` data in and this module's
// output back onto the screen; if a bug is found here, it reproduces in a
// test, not just on one physical phone.
//
// Mirrors the style of lib/sign-geometry.ts (the AI-preview / reference-photo
// measurement module): exported pure functions, defensive null returns on
// degenerate input (never throw), heavy WHY-comments. Reuses GeoPoint and
// isPlausibleDimension from there rather than redefining them, so the two
// measurement paths (photo-reference vs. AR) agree on what "0-1 normalized"
// and "plausible sign size" mean.

import { type GeoPoint, isPlausibleDimension } from "@/lib/sign-geometry"

export type Vec3 = { x: number; y: number; z: number }

export const METRES_TO_INCHES = 39.3701

// Relative tolerances, not absolute — this module handles two very different
// coordinate scales (normalized 0-1 image space in projectPointsToQuad, and
// metre-scale world space in measureRectangle), so any epsilon compared
// against raw coordinates would be wrong for one of the two scales. Both
// checks below instead compare against a "characteristic size" derived from
// the input itself (average distance from centroid).
const COINCIDENT_REL_EPS = 1e-6 // point-vs-centroid distance, relative to spread
const ZERO_AREA_REL_EPS = 1e-9 // shoelace area, relative to spread^2
const ZERO_SPREAD_ABS_EPS = 1e-9 // all 4 points collapsed to ~one point

function finite(n: number): boolean {
  return Number.isFinite(n)
}

function vecFinite(p: Vec3): boolean {
  return finite(p.x) && finite(p.y) && finite(p.z)
}

// ─── 3D vector helpers ──────────────────────────────────────────────────────

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}
function length(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}
function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}
function normalize(a: Vec3): Vec3 | null {
  const len = length(a)
  if (!(len > 0) || !finite(len)) return null
  return scale(a, 1 / len)
}
function distance3(a: Vec3, b: Vec3): number {
  return length(sub(a, b))
}

// ─── Corner ordering (shared by both exports) ──────────────────────────────
//
// Ordering rule: sort the 4 points by angle around their centroid, then
// rotate the resulting cycle so it starts at whichever point minimizes
// (x + y). This is done in exactly two steps for a reason:
//
//   1. Angle-sorting around the centroid (ascending atan2(dy,dx)) always
//      recovers the correct CYCLIC ADJACENCY of a convex quadrilateral's
//      corners, regardless of which order they were supplied in — it's a
//      property of the angles themselves, not of array order. In a
//      **y-down** coordinate system (image space, and the pseudo-image space
//      built for measureRectangle below), ascending angle order is
//      clockwise: for a rectangle this walks TL -> TR -> BR -> BL -> TL.
//   2. Angle-sorting alone doesn't tell you *which* corner is TL — the cycle
//      could start anywhere depending on where each point's angle happens to
//      fall relative to the atan2 branch cut at +-pi. Rotating the (already
//      correctly-ordered) cycle to start at the point with the smallest
//      (x + y) picks out the point closest to the origin corner — i.e. the
//      top-left one — without disturbing the adjacency established in step 1.
//
// Returns the 4 input indices in [TL,TR,BR,BL] order, or null if the points
// are degenerate: coincident with their own centroid (duplicate/near-duplicate
// points), or the resulting quad has ~zero area (collinear points).
//
// Exported for reuse by lib/sign-homography.ts — the door-corner-tap flow is,
// like this AR flow, a "4 arbitrary-order camera-derived taps" input, and
// should reject degenerate input via the exact same rule.
export function orderQuad(points: GeoPoint[]): number[] | null {
  if (points.length !== 4) return null
  if (!points.every((p) => finite(p.x) && finite(p.y))) return null

  const cx = points.reduce((s, p) => s + p.x, 0) / 4
  const cy = points.reduce((s, p) => s + p.y, 0) / 4

  const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy))
  const spread = radii.reduce((s, r) => s + r, 0) / 4
  if (!(spread > ZERO_SPREAD_ABS_EPS)) return null // all 4 taps landed on ~the same point

  const angles = points.map((p, i) => {
    if (radii[i] < spread * COINCIDENT_REL_EPS) return null // this point ~= centroid; angle undefined
    return Math.atan2(p.y - cy, p.x - cx)
  })
  if (angles.some((a) => a === null)) return null

  const idx = [0, 1, 2, 3].sort((a, b) => (angles[a] as number) - (angles[b] as number))

  // Zero-area check (catches collinear points, which angle-sorting alone
  // does not reject — 4 collinear points still sort into "some" order).
  const ordered = idx.map((i) => points[i])
  let area2 = 0
  for (let k = 0; k < 4; k++) {
    const p = ordered[k]
    const q = ordered[(k + 1) % 4]
    area2 += p.x * q.y - q.x * p.y
  }
  const area = Math.abs(area2) / 2
  if (!(area > ZERO_AREA_REL_EPS * spread * spread)) return null

  // Rotate the cycle so it starts at the point nearest the top-left corner.
  let startPos = 0
  let minSum = Infinity
  for (let k = 0; k < 4; k++) {
    const sum = ordered[k].x + ordered[k].y
    if (sum < minSum) {
      minSum = sum
      startPos = k
    }
  }
  return [0, 1, 2, 3].map((k) => idx[(startPos + k) % 4])
}

// ─── projectPointsToQuad ────────────────────────────────────────────────────
//
// Column-major indexing convention (WebXR's, e.g. XRRigidTransform / gl-matrix
// mat4): a 16-number array laid out as 4 consecutive columns,
//   m[0], m[1], m[2], m[3]      = column 0
//   m[4], m[5], m[6], m[7]      = column 1
//   m[8], m[9], m[10], m[11]    = column 2
//   m[12], m[13], m[14], m[15]  = column 3
// i.e. element (row r, col c) lives at m[c*4 + r]. Multiplying M * [x,y,z,1]ᵀ
// (row r = sum over columns) therefore reads, per output row:
//   out.x = m[0]*x + m[4]*y + m[8]*z  + m[12]
//   out.y = m[1]*x + m[5]*y + m[9]*z  + m[13]
//   out.z = m[2]*x + m[6]*y + m[10]*z + m[14]
//   out.w = m[3]*x + m[7]*y + m[11]*z + m[15]
function transformPoint(m: number[], p: Vec3): Vec3 & { w: number } {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    w: m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15],
  }
}

// Projects 4 tapped world-space points (metres) into normalized 0-1 image
// coordinates using the camera's view-projection matrix at capture time, and
// orders them into the [TL,TR,BR,BL] convention lib/sign-geometry.ts uses —
// see orderQuad above for the exact rule.
export function projectPointsToQuad(points: Vec3[], viewProjection: number[]): GeoPoint[] | null {
  if (!Array.isArray(points) || points.length !== 4) return null
  if (!points.every((p) => p && vecFinite(p))) return null
  if (!Array.isArray(viewProjection) || viewProjection.length !== 16) return null
  if (!viewProjection.every((n) => finite(n))) return null

  const projected: GeoPoint[] = []
  for (const p of points) {
    const clip = transformPoint(viewProjection, p)
    // w <= 0 means the point is behind (or exactly on) the camera's eye
    // plane after projection — perspective divide would be meaningless
    // (or would flip the point to the wrong side of the screen).
    if (!finite(clip.w) || clip.w <= 0) return null
    const ndcX = clip.x / clip.w
    const ndcY = clip.y / clip.w
    if (!finite(ndcX) || !finite(ndcY)) return null
    // NDC is -1..1 with +Y up (WebGL/WebXR convention); image space is
    // 0..1 with +Y down (top of the image = 0) — both axes need remapping,
    // and Y additionally needs flipping.
    const imgX = (ndcX + 1) / 2
    const imgY = (1 - ndcY) / 2
    projected.push({ x: imgX, y: imgY })
  }

  const order = orderQuad(projected)
  if (!order) return null
  return order.map((i) => projected[i])
}

// ─── measureRectangle ───────────────────────────────────────────────────────

// Finds the plane the 4 points roughly lie on, order-independently: the
// covariance-style "best cross product" below considers every one of the 6
// unordered point pairs and keeps the one whose vectors-from-centroid are
// least parallel (largest cross-product magnitude). For 4 points that are
// (as intended) coplanar, ANY two non-parallel in-plane vectors cross to give
// the same normal direction up to sign — so which specific pair "wins" here
// doesn't matter for correctness, only for numerical stability (avoiding a
// near-degenerate pair, e.g. two diagonally-opposite corners, whose vectors
// from the centroid are ~anti-parallel and would give a near-zero cross
// product). Because it's computed from the unordered point *set* (all pairs
// are tried), the result — and everything derived from it below — does not
// depend on the order the user tapped the 4 corners in.
function bestPlaneNormal(centered: Vec3[]): Vec3 | null {
  let best: Vec3 | null = null
  let bestMag = 0
  for (let i = 0; i < centered.length; i++) {
    for (let j = i + 1; j < centered.length; j++) {
      const c = cross(centered[i], centered[j])
      const mag = length(c)
      if (mag > bestMag) {
        bestMag = mag
        best = c
      }
    }
  }
  if (!best || !(bestMag > 0)) return null // all 4 points collinear
  return normalize(best)
}

// Relative threshold (against |worldUp|) for treating worldUp as "parallel
// to the plane's normal" — i.e. a horizontal surface (floor/ceiling) where
// world-up has (near) zero component within the wall's own plane, so there
// is no meaningful width/height distinction to derive from it.
const UP_PARALLEL_REL_EPS = 1e-6

// Builds the in-plane (axisRight, axisUp) basis used to separate "width"
// from "height" in measureRectangle. Orienting against a real-world up
// vector (rather than an arbitrary in-plane direction) is what makes width
// and height come out correctly for non-square rectangles — see the
// world-up bug note on measureRectangle below for why an orientation-free
// basis is NOT sufficient here, unlike orderQuad's adjacency-only ordering.
//
// Falls back to an arbitrary-but-order-independent in-plane basis (the
// previous behaviour of this module, before world-up was threaded through)
// when worldUp doesn't usefully constrain the plane — i.e. a horizontal
// surface, where worldUp is (near) parallel to normal and projects to ~0
// within the plane. In that case there is no real "which edge is width"
// answer, so we report *a* consistent pairing rather than failing a
// perfectly valid (if unusual) horizontal measurement.
function inPlaneAxes(
  normal: Vec3,
  worldUp: Vec3,
  centered: Vec3[]
): { axisRight: Vec3; axisUp: Vec3 } | null {
  const worldUpLen = length(worldUp)
  const rawUp = sub(worldUp, scale(normal, dot(worldUp, normal)))
  const upLen = length(rawUp)

  if (upLen > worldUpLen * UP_PARALLEL_REL_EPS) {
    const axisUp = normalize(rawUp)
    if (!axisUp) return null
    const axisRight = normalize(cross(normal, axisUp))
    if (!axisRight) return null
    return { axisRight, axisUp }
  }

  // Horizontal-surface fallback: pick the in-plane direction of whichever
  // centered point is furthest from the centroid (numerically the most
  // stable choice), then complete a right-handed in-plane frame. This
  // matches the arbitrary-basis approach this module used before world-up
  // was introduced — order-independent, but "axisUp" here carries no real
  // up/down meaning, only a consistent pairing.
  let axis1: Vec3 | null = null
  let bestLen = 0
  for (const c of centered) {
    const rejected = sub(c, scale(normal, dot(c, normal)))
    const len = length(rejected)
    if (len > bestLen) {
      bestLen = len
      axis1 = normalize(rejected)
    }
  }
  if (!axis1 || !(bestLen > 0)) return null
  const axis2 = normalize(cross(normal, axis1))
  if (!axis2) return null
  return { axisRight: axis1, axisUp: axis2 }
}

// Real-world size of the tapped rectangle. Width/height come from averaging
// opposite-edge 3D distances between the ordered corners — the exact same
// approach quadPixelDimensions in lib/sign-geometry.ts takes in pixel space,
// just in metres here since there's no photo to project into first.
//
// `worldUp` tells this function which in-plane direction is "up" so it can
// correctly label one edge pair as height and the other as width — WebXR
// reference spaces are Y-up, hence the default. This is NOT optional the way
// projectPointsToQuad's/orderQuad's ordering choice is: orderQuad only needs
// to get the 4 points' CYCLIC ADJACENCY right (which edges border which),
// and that's genuinely orientation-free — swapping or reflecting the basis
// used to sort them still produces the correct set of 4 edges. But
// measureRectangle then has to decide which of those two edge-pairs to call
// "width" and which to call "height", and *that* decision is only correct
// if the basis is oriented against a real-world reference (worldUp) — an
// arbitrary in-plane basis has a 50/50 chance of aligning its "axisUp" with
// the rectangle's short side instead of its long side, silently swapping
// width and height for any non-square sign. (A square input can't reveal
// this bug — width and height are numerically identical either way — which
// is exactly how an earlier version of this function shipped it.)
export function measureRectangle(
  points: Vec3[],
  worldUp: Vec3 = { x: 0, y: 1, z: 0 } // WebXR reference spaces are Y-up
): { widthInches: number; heightInches: number; squareness: number } | null {
  if (!Array.isArray(points) || points.length !== 4) return null
  if (!points.every((p) => p && vecFinite(p))) return null

  const centroid: Vec3 = {
    x: points.reduce((s, p) => s + p.x, 0) / 4,
    y: points.reduce((s, p) => s + p.y, 0) / 4,
    z: points.reduce((s, p) => s + p.z, 0) / 4,
  }
  const centered = points.map((p) => sub(p, centroid))

  const normal = bestPlaneNormal(centered)
  if (!normal) return null // collinear (or all-coincident) points

  // Malformed/degenerate worldUp (non-finite, or ~zero length) falls back to
  // the WebXR-standard Y-up default rather than propagating garbage into
  // the basis math below.
  const resolvedUp: Vec3 = vecFinite(worldUp) && length(worldUp) > 1e-9 ? worldUp : { x: 0, y: 1, z: 0 }

  const axes = inPlaneAxes(normal, resolvedUp, centered)
  if (!axes) return null

  // y is negated: axisUp points toward real-world "up", but orderQuad
  // (shared with projectPointsToQuad) expects image-style coordinates where
  // smaller y is "up" — so a point further along axisUp must get a SMALLER
  // y2 here to land in the same top/bottom sense orderQuad already assumes.
  const projected2D: GeoPoint[] = centered.map((c) => ({
    x: dot(c, axes.axisRight),
    y: -dot(c, axes.axisUp),
  }))
  const order = orderQuad(projected2D)
  if (!order) return null // collinear / zero-area in-plane projection

  const [c0, c1, c2, c3] = order.map((i) => points[i])

  const topLen = distance3(c0, c1)
  const rightLen = distance3(c1, c2)
  const bottomLen = distance3(c2, c3)
  const leftLen = distance3(c3, c0)

  const widthMetres = (topLen + bottomLen) / 2
  const heightMetres = (leftLen + rightLen) / 2
  const widthInches = widthMetres * METRES_TO_INCHES
  const heightInches = heightMetres * METRES_TO_INCHES

  if (!isPlausibleDimension(widthInches) || !isPlausibleDimension(heightInches)) return null

  return {
    widthInches: round1(widthInches),
    heightInches: round1(heightInches),
    squareness: computeSquareness([c0, c1, c2, c3], { topLen, rightLen, bottomLen, leftLen }),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// squareness = angleScore * edgeScore, both in [0,1] and both 1.0 exactly
// for a perfect rectangle:
//
//   angleScore — at each of the 4 corners, the interior angle between the
//   two edges meeting there should be 90 degrees for a rectangle. We take
//   the average absolute deviation from 90 degrees across all 4 corners and
//   normalize it against the worst possible average deviation (90 degrees,
//   i.e. pi/2 radians — corners that are flat lines or fully folded back).
//   angleScore = 1 - avgDeviation / (pi/2), clamped to [0,1].
//
//   edgeScore — a rectangle also needs its two pairs of opposite edges to
//   match in length (a non-rectangular parallelogram can have all 4 corner
//   angles wrong in a way that partially cancels in the angle metric, but a
//   trapezoid — unequal opposite edges — needs this second signal). For each
//   pair we take |difference| / average (a fractional deviation, same shape
//   as edgesDiverge in lib/sign-geometry.ts), average the width-pair and
//   height-pair deviations, then edgeScore = 1 - avgEdgeDeviation, clamped
//   to [0,1].
//
// Multiplying the two scores means either kind of distortion alone (a
// skewed parallelogram with equal sides, or a "square-cornered" trapezoid)
// pulls squareness down, and the two compound when both are present. This
// number is advisory only (drives a UI warning), never a hard block.
function computeSquareness(
  corners: [Vec3, Vec3, Vec3, Vec3],
  edges: { topLen: number; rightLen: number; bottomLen: number; leftLen: number }
): number {
  const [c0, c1, c2, c3] = corners
  const cornerAngleDeviation = (prev: Vec3, at: Vec3, next: Vec3): number => {
    const v1 = sub(prev, at)
    const v2 = sub(next, at)
    const l1 = length(v1)
    const l2 = length(v2)
    if (!(l1 > 0) || !(l2 > 0)) return Math.PI / 2 // degenerate corner = worst-case deviation
    const cos = Math.min(1, Math.max(-1, dot(v1, v2) / (l1 * l2)))
    return Math.abs(Math.acos(cos) - Math.PI / 2)
  }

  const avgAngleDev =
    (cornerAngleDeviation(c3, c0, c1) +
      cornerAngleDeviation(c0, c1, c2) +
      cornerAngleDeviation(c1, c2, c3) +
      cornerAngleDeviation(c2, c3, c0)) /
    4
  const angleScore = clamp01(1 - avgAngleDev / (Math.PI / 2))

  const { topLen, rightLen, bottomLen, leftLen } = edges
  const widthAvg = (topLen + bottomLen) / 2
  const heightAvg = (leftLen + rightLen) / 2
  const widthDev = widthAvg > 0 ? Math.abs(topLen - bottomLen) / widthAvg : 0
  const heightDev = heightAvg > 0 ? Math.abs(leftLen - rightLen) / heightAvg : 0
  const edgeScore = clamp01(1 - (widthDev + heightDev) / 2)

  return clamp01(angleScore * edgeScore)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
