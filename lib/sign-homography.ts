// Pure client-side homography measurement — the door-corner-tap flow.
//
// The existing reference-photo method (lib/sign-geometry.ts) applies ONE
// global pixels-per-inch scalar to the whole photo, which is only exact when
// the camera happens to be perpendicular to the wall. This module replaces
// that scalar, for the door-corner-tap capture path specifically, with a
// proper 4-point planar homography: given the door's known real-world
// rectangle and the 4 corners as tapped in the photo, it solves the
// projective transform between "the door's plane, in inches" and "the
// photo's normalized image space," then uses that transform's inverse to map
// the sign quad's own corners (drawn separately, same photo) into real-world
// inches — correcting perspective distortion mathematically, for any camera
// angle, as long as the door and the sign area are genuinely coplanar.
//
// Mirrors the style of lib/sign-geometry.ts and lib/ar-measure.ts: exported
// pure functions, defensive null returns on degenerate input (never throw),
// heavy WHY-comments. Reuses GeoPoint/ImgDims/SignDimensions,
// quadPixelDimensions, isPlausibleDimension, computeConfidence, and the two
// max-dimension constants from sign-geometry.ts, and orderQuad from
// ar-measure.ts, rather than redefining any of them — door-corner-tap and AR
// are both "4 arbitrary-order camera-derived taps" inputs and should agree on
// what counts as degenerate.

import {
  type GeoPoint,
  type ImgDims,
  type SignDimensions,
  quadPixelDimensions,
  isPlausibleDimension,
  computeConfidence,
  MAX_REFERENCE_INCHES,
} from "@/lib/sign-geometry"
import { orderQuad } from "@/lib/ar-measure"

// Standard exterior single-door slab. Unlike the old scalar method (which
// only ever needed the reference's HEIGHT, a single length ratio), a
// homography calibrates horizontal and vertical scale independently from the
// source rectangle's two dimensions — so an assumed width is a genuinely new
// source of error the old method didn't have. Kept fixed/non-editable: the
// existing `referenceAssumed` flag and the mandatory pricing-estimate
// disclosure already cover this residual risk, and a second always-assumed
// number wouldn't change that story, only add a second input to maintain.
export const ASSUMED_DOOR_WIDTH_INCHES = 36

const REFERENCES_USED = ["door_homography"]

// A row-major 3x3 matrix, flattened: [a,b,c, d,e,f, g,h,i].
export type Mat3 = [number, number, number, number, number, number, number, number, number]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── Linear solve ───────────────────────────────────────────────────────────

// Gauss-Jordan elimination with partial pivoting on an 8x8 system Ax = b.
// No external matrix library needed for a fixed, small, known size. Returns
// both the solution and the smallest-to-largest pivot ratio encountered
// during elimination — a scale-independent signal of how well-conditioned
// the system was (see MIN_PIVOT_RATIO_* below), since an absolute epsilon
// would be meaningless here: the 4 tapped door corners can span any real
// on-screen pixel range depending on how close the client stood.
function solve8x8(A: number[][], b: number[]): { x: number[]; pivotRatio: number } | null {
  const n = 8
  const M = A.map((row, i) => [...row, b[i]])
  let minPivot = Infinity
  let maxPivot = 0

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    let maxAbs = Math.abs(M[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col])
      if (v > maxAbs) { maxAbs = v; pivotRow = r }
    }
    if (!(maxAbs > 0) || !Number.isFinite(maxAbs)) return null
    if (pivotRow !== col) { const tmp = M[col]; M[col] = M[pivotRow]; M[pivotRow] = tmp }

    const pivot = M[col][col]
    minPivot = Math.min(minPivot, Math.abs(pivot))
    maxPivot = Math.max(maxPivot, Math.abs(pivot))

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col] / pivot
      if (factor === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }

  const x = M.map((row, i) => row[n] / row[i])
  if (!x.every(Number.isFinite)) return null
  return { x, pivotRatio: maxPivot > 0 ? minPivot / maxPivot : 0 }
}

// ─── Homography solve + apply ───────────────────────────────────────────────

// Solves H such that H * [source.x, source.y, 1] ~ [target.x, target.y, 1]
// (projective, fixed scale h9=1) from exactly 4 point correspondences —
// standard DLT: 8 unknowns, 2 linear equations per correspondence.
export function solveHomography(
  source: GeoPoint[],
  target: GeoPoint[]
): { matrix: Mat3; pivotRatio: number } | null {
  if (source.length !== 4 || target.length !== 4) return null

  const A: number[][] = []
  const b: number[] = []
  for (let k = 0; k < 4; k++) {
    const { x: X, y: Y } = source[k]
    const { x, y } = target[k]
    if (![X, Y, x, y].every(Number.isFinite)) return null
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x)
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y)
  }

  const solved = solve8x8(A, b)
  if (!solved) return null
  const [h0, h1, h2, h3, h4, h5, h6, h7] = solved.x
  return { matrix: [h0, h1, h2, h3, h4, h5, h6, h7, 1], pivotRatio: solved.pivotRatio }
}

// Closed-form 3x3 inverse (adjugate / determinant). Rejects when the
// determinant is vanishingly small RELATIVE to the matrix's own entries —
// an absolute epsilon would be wrong here since a homography's g/h entries
// (image-normalized-per-inch) and c/f entries (image-normalized) naturally
// live at very different scales depending on how far the door is from the
// camera and how large the assumed door size is.
export function invert3x3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (!Number.isFinite(det)) return null

  const maxAbs = Math.max(...m.map(Math.abs))
  const scale3 = maxAbs > 0 ? maxAbs ** 3 : 1
  if (Math.abs(det) < 1e-9 * scale3) return null

  const invDet = 1 / det
  const result: Mat3 = [
    (e * i - f * h) * invDet, -(b * i - c * h) * invDet, (b * f - c * e) * invDet,
    -(d * i - f * g) * invDet, (a * i - c * g) * invDet, -(a * f - c * d) * invDet,
    (d * h - e * g) * invDet, -(a * h - b * g) * invDet, (a * e - b * d) * invDet,
  ]
  return result.every(Number.isFinite) ? result : null
}

// Applies a homogeneous 3x3 transform to a 2D point, with perspective divide.
// Works in either direction (door-inches -> image, or the inverse) — which
// direction depends only on which matrix is passed in. `w <= 0` (or ~0) means
// the transform sends this point behind/onto the plane at infinity, which for
// a physically sane photo of a physically sane sign should never happen; it
// signals a bad tap or a wildly implausible geometry, not a valid answer.
export function applyHomography(m: Mat3, p: GeoPoint): GeoPoint | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const w = g * p.x + h * p.y + i
  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null
  const x = (a * p.x + b * p.y + c) / w
  const y = (d * p.x + e * p.y + f) / w
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

// ─── Confidence thresholds ──────────────────────────────────────────────────

// Below this pivot ratio the DLT solve is numerically unstable enough that
// the result cannot be trusted at all — reject outright rather than report a
// number. Above it but below MIN_PIVOT_RATIO_SOFT, the solve is trustworthy
// but shaky (the 4 tapped door corners were close to collinear/degenerate),
// so a small tap error gets amplified — confidence is capped at "low" instead
// of rejecting, since the geometry may still be the client's only shot at a
// storefront that's hard to photograph square-on.
const MIN_PIVOT_RATIO_HARD = 1e-6
const MIN_PIVOT_RATIO_SOFT = 1e-3

// ─── Public entry point ─────────────────────────────────────────────────────

// `doorCorners`: the 4 tapped door corners, image-normalized (0-1), any tap
// order (canonicalized internally via orderQuad, same rule the AR flow
// uses). `signQuad`: the sign area, already in the [TL,TR,BR,BL] (flat) or
// [TL,TM,TR,BR,BM,BL] (corner) convention QuadSelector emits — NOT
// reordered, since it's not user-tapped raw input. `doorHeightInches` is the
// (assumed-or-typed) real door height; `referenceAssumed` mirrors the
// existing flag from lib/sign-geometry.ts.
export function computeDoorHomographyDimensions(
  signQuad: GeoPoint[] | null,
  doorCorners: GeoPoint[] | null,
  doorHeightInches: number,
  imgDims: ImgDims | null,
  referenceAssumed = false,
  doorWidthInches: number = ASSUMED_DOOR_WIDTH_INCHES
): SignDimensions | null {
  if (!signQuad || !doorCorners || !imgDims) return null
  if (!(signQuad.length === 4 || signQuad.length === 6)) return null
  if (doorCorners.length !== 4) return null
  if (!isPlausibleDimension(doorHeightInches, MAX_REFERENCE_INCHES)) return null
  if (!isPlausibleDimension(doorWidthInches, MAX_REFERENCE_INCHES)) return null

  const order = orderQuad(doorCorners)
  if (!order) return null // collinear / coincident / zero-area taps
  const orderedDoor = order.map(i => doorCorners[i]) // [TL,TR,BR,BL], image space

  // Source rectangle: the door's own real-world plane, in inches, same
  // [TL,TR,BR,BL] convention as everywhere else in this codebase.
  const source: GeoPoint[] = [
    { x: 0, y: 0 },
    { x: doorWidthInches, y: 0 },
    { x: doorWidthInches, y: doorHeightInches },
    { x: 0, y: doorHeightInches },
  ]

  const solved = solveHomography(source, orderedDoor)
  if (!solved) return null
  if (solved.pivotRatio < MIN_PIVOT_RATIO_HARD) return null

  const inverse = invert3x3(solved.matrix)
  if (!inverse) return null

  const mappedPts: GeoPoint[] = []
  for (const p of signQuad) {
    const mapped = applyHomography(inverse, p)
    if (!mapped) return null
    mappedPts.push(mapped)
  }

  const isCorner = signQuad.length === 6
  // Mapped points are already in real-world inches (the source rectangle's
  // own units) — passing identity {w:1,h:1} dims makes quadPixelDimensions'
  // internal pixel-distance math return those inches directly, unmodified.
  const qpd = quadPixelDimensions(mappedPts, { w: 1, h: 1 }, isCorner)
  if (!(qpd.heightPx > 0)) return null

  let widthInches: number
  let heightInches: number
  let frontWidthInches: number | undefined
  let sideWidthInches: number | undefined

  if (isCorner) {
    frontWidthInches = qpd.frontWidthPx!
    sideWidthInches = qpd.sideWidthPx!
    widthInches = frontWidthInches + sideWidthInches
    heightInches = qpd.heightPx
  } else {
    widthInches = qpd.widthPx
    heightInches = qpd.heightPx
  }

  if (!isPlausibleDimension(widthInches) || !isPlausibleDimension(heightInches)) return null
  if (isCorner && (!isPlausibleDimension(frontWidthInches!) || !isPlausibleDimension(sideWidthInches!))) return null

  // Same geometric confidence signal the old scalar door path used (the
  // tapped door's own on-screen pixel height + whether its edges look
  // distorted) and the same referenceAssumed rule, via the shared
  // computeConfidence — plus one homography-specific override: a
  // shaky-but-solvable system caps confidence at "low" regardless of how
  // clean the rest of the geometry looks, since a poorly-conditioned solve
  // amplifies small tap errors into large real-world error (see
  // MIN_PIVOT_RATIO_SOFT above).
  const doorPxDims = quadPixelDimensions(orderedDoor, imgDims, false)
  const angleWarning = qpd.angleWarning || doorPxDims.angleWarning
  let confidence = computeConfidence(doorPxDims.heightPx, angleWarning, referenceAssumed)
  if (solved.pivotRatio < MIN_PIVOT_RATIO_SOFT) confidence = "low"

  return {
    widthInches: round1(widthInches),
    heightInches: round1(heightInches),
    ...(isCorner && {
      frontWidthInches: round1(frontWidthInches!),
      sideWidthInches: round1(sideWidthInches!),
    }),
    isCorner,
    confidence,
    angleWarning,
    referencesUsed: REFERENCES_USED,
  }
}
