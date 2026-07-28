// Pure client-side sign-size geometry — the "app ruler" pattern.
//
// The client marks a reference on a known object (door, window, brick
// course, or a custom-length object) in the same photo as the sign quad —
// either a straight 2-point A→B line (ruler mode, arbitrary custom object)
// or a 4-point [TL,TR,BR,BL] quad (door/brick sticker mode), the same
// convention as the sign quad itself, so a reference photographed at an
// angle is measured the same way an angled sign quad already is (its own
// left/right edge lengths averaged, not a single straight-line distance).
// Because both the quad and the reference live in the same normalized image
// space, we can convert the quad's pixel dimensions to real-world inches
// using the reference's known length — no AI call, no depth model.
//
// Known v1 limitation: the angle-divergence heuristic below now catches both
// the sign quad's own distortion AND a 4-point reference's own distortion,
// but still does NOT detect a reference marked in a differently-foreshortened
// region of the same photo than the sign quad (e.g. reference on a wall
// facing the camera, sign quad on a wall angled away) — that mismatch is
// mitigated with UI copy asking the client to pick a reference near the
// sign, not with additional math.

export type GeoPoint = { x: number; y: number } // normalized 0–1
export type ImgDims = { w: number; h: number }

export interface SignDimensions {
  widthInches: number
  heightInches: number
  frontWidthInches?: number
  sideWidthInches?: number
  isCorner: boolean
  confidence: "high" | "medium" | "low"
  angleWarning: boolean
  referencesUsed: string[]
}

// Hard minimum: below this many reference pixels, drag-precision error on a
// 960px-wide canvas dominates the measurement and the result isn't trustworthy.
const MIN_REFERENCE_PX = 40
// Above this many reference pixels, the reference line itself is long enough
// on-screen that drag imprecision is a small fraction of its length.
const HIGH_CONFIDENCE_REFERENCE_PX = 150
// Opposite-edge pixel-length ratio divergence beyond this suggests the photo
// (or the marked quad) is angled enough to introduce meaningful error.
const ANGLE_WARNING_THRESHOLD = 0.15

// Sanity ceiling for any single sign dimension — generous enough to cover the
// largest realistic sign (50 ft) while catching garbage input (e.g. a
// fat-fingered "9999") that would otherwise flow straight into sign_spec with
// nothing downstream ever checking it.
export const MAX_SIGN_DIMENSION_INCHES = 600
// Same idea for a reference object's claimed real-world length.
export const MAX_REFERENCE_INCHES = 1000

export function isPlausibleDimension(inches: number, max = MAX_SIGN_DIMENSION_INCHES): boolean {
  return Number.isFinite(inches) && inches > 0 && inches <= max
}

function dist(a: GeoPoint, b: GeoPoint, imgDims: ImgDims): number {
  const ax = a.x * imgDims.w, ay = a.y * imgDims.h
  const bx = b.x * imgDims.w, by = b.y * imgDims.h
  return Math.hypot(ax - bx, ay - by)
}

// true if the two edge lengths diverge by more than the threshold fraction
// of their average — used to flag likely photo/quad angle distortion.
function edgesDiverge(len1: number, len2: number): boolean {
  const avg = (len1 + len2) / 2
  if (avg <= 0) return false
  return Math.abs(len1 - len2) / avg > ANGLE_WARNING_THRESHOLD
}

export interface QuadPixelDimensions {
  widthPx: number   // flat: the quad's own width. corner: frontWidthPx + sideWidthPx.
  heightPx: number
  frontWidthPx?: number  // corner only
  sideWidthPx?: number   // corner only
  angleWarning: boolean
}

// Pixel-space width/height of a quad, given the image's own pixel dimensions
// (or any {w,h} with the same aspect ratio — only the w:h ratio matters, see
// pseudoImgDims below). Extracted from computeSignDimensions so the
// aspect-ratio lock helpers (validateQuadMatchesRatio, fitQuadToRatio) can
// reuse the exact same shape math without a reference/scale, instead of
// re-deriving it and risking the two falling out of sync.
export function quadPixelDimensions(quad: GeoPoint[], imgDims: ImgDims, isCorner: boolean): QuadPixelDimensions {
  if (isCorner) {
    // [TL(0), TM(1), TR(2), BR(3), BM(4), BL(5)]
    const [tl, tm, tr, br, bm, bl] = quad

    const frontWidthPx = (dist(tl, tm, imgDims) + dist(bl, bm, imgDims)) / 2
    const sideWidthPx = (dist(tm, tr, imgDims) + dist(bm, br, imgDims)) / 2
    // Average all three measured columns equally — the fold column (tm/bm) must not
    // be double-counted by averaging it into both a "front" and "side" height first.
    const heightPx = (dist(tl, bl, imgDims) + dist(tm, bm, imgDims) + dist(tr, br, imgDims)) / 3

    const angleWarning =
      edgesDiverge(dist(tl, tm, imgDims), dist(bl, bm, imgDims)) ||
      edgesDiverge(dist(tm, tr, imgDims), dist(bm, br, imgDims)) ||
      edgesDiverge(dist(tl, bl, imgDims), dist(tm, bm, imgDims)) ||
      edgesDiverge(dist(tm, bm, imgDims), dist(tr, br, imgDims))

    return { widthPx: frontWidthPx + sideWidthPx, heightPx, frontWidthPx, sideWidthPx, angleWarning }
  }

  // [TL(0), TR(1), BR(2), BL(3)]
  const [tl, tr, br, bl] = quad

  const topPx = dist(tl, tr, imgDims)
  const bottomPx = dist(bl, br, imgDims)
  const leftPx = dist(tl, bl, imgDims)
  const rightPx = dist(tr, br, imgDims)

  const widthPx = (topPx + bottomPx) / 2
  const heightPx = (leftPx + rightPx) / 2
  const angleWarning = edgesDiverge(topPx, bottomPx) || edgesDiverge(leftPx, rightPx)

  return { widthPx, heightPx, angleWarning }
}

// A {w,h} pair carrying only an aspect ratio (no absolute pixel size) — valid
// input to dist()/quadPixelDimensions() because both only ever use w and h as
// a relative x/y scale factor, never their absolute magnitude. Lets the
// aspect-ratio helpers below work from just `image_aspect_ratio` (a single
// number stored in SignSpec) instead of needing the original photo's actual
// pixel dimensions.
function pseudoImgDims(aspectRatio: number): ImgDims {
  return { w: aspectRatio, h: 1 }
}

export function computeSignDimensions(
  quad: GeoPoint[] | null,
  reference: GeoPoint[] | null,
  referenceInches: number,
  imgDims: ImgDims | null,
  referenceType?: string
): SignDimensions | null {
  if (!quad || !reference || !imgDims) return null
  if (!(reference.length === 2 || reference.length === 4)) return null
  if (!(quad.length === 4 || quad.length === 6)) return null
  if (!referenceInches || referenceInches <= 0) return null

  // Ruler mode: a straight 2-point A→B measurement. Door/brick sticker mode:
  // a 4-point [TL,TR,BR,BL] quad, same convention as the sign quad itself —
  // average the left/right edge lengths instead of a single straight-line
  // distance, so a reference photographed at an angle is measured the same
  // way an angled sign quad already is (closing part of the "known v1
  // limitation" noted above, where only the sign quad's own angle was caught).
  let refPx: number
  let refAngleWarning = false
  if (reference.length === 2) {
    refPx = dist(reference[0], reference[1], imgDims)
  } else {
    const [refTl, refTr, refBr, refBl] = reference
    const leftPx = dist(refTl, refBl, imgDims)
    const rightPx = dist(refTr, refBr, imgDims)
    refPx = (leftPx + rightPx) / 2
    refAngleWarning = edgesDiverge(leftPx, rightPx)
  }
  if (refPx < MIN_REFERENCE_PX) return null // too short to trust — caller shows inline error

  const pixelsPerInch = refPx / referenceInches
  const isCorner = quad.length === 6

  const qpd = quadPixelDimensions(quad, imgDims, isCorner)

  let widthInches: number
  let heightInches: number
  let frontWidthInches: number | undefined
  let sideWidthInches: number | undefined

  if (isCorner) {
    frontWidthInches = qpd.frontWidthPx! / pixelsPerInch
    sideWidthInches = qpd.sideWidthPx! / pixelsPerInch
    widthInches = frontWidthInches + sideWidthInches
    heightInches = qpd.heightPx / pixelsPerInch
  } else {
    widthInches = qpd.widthPx / pixelsPerInch
    heightInches = qpd.heightPx / pixelsPerInch
  }
  const angleWarning = qpd.angleWarning || refAngleWarning

  const confidence: "high" | "medium" | "low" =
    refPx > HIGH_CONFIDENCE_REFERENCE_PX && !angleWarning
      ? "high"
      : refPx > HIGH_CONFIDENCE_REFERENCE_PX || !angleWarning
      ? "medium"
      : "low"

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
    referencesUsed: referenceType ? [referenceType] : [],
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── Aspect-ratio lock ──────────────────────────────────────────────────────
//
// The sign quad drawn on QuadSelector and the numeric width/height (typed,
// reference-calibrated, or Maps-derived) are two independent inputs that
// nothing used to reconcile — a client could drag the quad into any skewed
// shape regardless of the real door's proportions, and since the quad (not
// the numeric inches) is what the AI preview renders into, that skew became
// a visibly stretched sign. These two helpers close that gap:
// validateQuadMatchesRatio is the defensive server-side check, fitQuadToRatio
// is what snaps an already-drawn quad onto the correct ratio once real
// dimensions become known.

const RATIO_TOLERANCE_FRACTION = 0.08

// True if the quad's own drawn width:height ratio (per face, for corner
// signs) is within `toleranceFraction` of the target real-world ratio.
// `imgAspectRatio` is the photo's width/height at the time the quad was
// drawn — required to interpret the quad's normalized (0–1) coordinates as
// real proportions (a "square" quad in normalized space isn't square unless
// the photo itself is square).
export function validateQuadMatchesRatio(
  quad: GeoPoint[] | null | undefined,
  imgAspectRatio: number | null | undefined,
  targetWidthInches: number,
  targetHeightInches: number,
  isCorner: boolean,
  frontWidthInches?: number,
  sideWidthInches?: number,
  toleranceFraction = RATIO_TOLERANCE_FRACTION
): boolean {
  if (!quad || !imgAspectRatio || imgAspectRatio <= 0) return false
  if (!(isCorner ? quad.length === 6 : quad.length === 4)) return false
  if (!(targetWidthInches > 0) || !(targetHeightInches > 0)) return false

  const qpd = quadPixelDimensions(quad, pseudoImgDims(imgAspectRatio), isCorner)
  if (!(qpd.heightPx > 0)) return false

  // Compares one face's width:height ratio against its target — shared by
  // both the flat case (one face) and each face of a corner sign.
  const ratioClose = (drawnWidthPx: number | undefined, targetInches: number | undefined): boolean => {
    if (!(drawnWidthPx! > 0) || !(targetInches! > 0)) return false
    const drawnRatio = drawnWidthPx! / qpd.heightPx
    const targetRatio = targetInches! / targetHeightInches
    return Math.abs(drawnRatio - targetRatio) / targetRatio <= toleranceFraction
  }

  if (isCorner) {
    return ratioClose(qpd.frontWidthPx, frontWidthInches) && ratioClose(qpd.sideWidthPx, sideWidthInches)
  }
  return ratioClose(qpd.widthPx, targetWidthInches)
}

// Extends `from` toward `towards` (pseudo-pixel space) to exactly `len`,
// keeping the current direction between the two points.
function extendTo(from: GeoPoint, towards: GeoPoint, len: number): GeoPoint {
  const dx = towards.x - from.x, dy = towards.y - from.y
  const curLen = Math.hypot(dx, dy) || 1
  return { x: from.x + (dx / curLen) * len, y: from.y + (dy / curLen) * len }
}

// Snaps an existing (possibly off-ratio) quad onto the nearest quad matching
// the target real-world width:height ratio, disturbing the current drawing
// as little as possible:
//  - flat quad: preserves centroid, orientation (the top edge's current
//    angle), and area — only reshapes the rectangle's width:height split.
//  - corner quad: preserves the fold line (TM/BM) exactly — it's the one
//    point that's physically meaningful to keep fixed, the real building
//    corner — and each face's current direction, only rescaling each face's
//    width along that direction so front/side each hit their own target
//    ratio against the (unchanged) shared height.
// Pure geometry — does not clamp results into [0,1]; a wildly different
// target ratio than what's currently drawn can push points outside the
// photo, same as any other quad edit the caller is responsible for handling.
export function fitQuadToRatio(
  quad: GeoPoint[],
  imgAspectRatio: number,
  targetWidthInches: number,
  targetHeightInches: number,
  isCorner: boolean,
  frontWidthInches?: number,
  sideWidthInches?: number
): GeoPoint[] {
  if (!quad || !imgAspectRatio || imgAspectRatio <= 0) return quad
  if (!(targetWidthInches > 0) || !(targetHeightInches > 0)) return quad

  const toPx = (p: GeoPoint): GeoPoint => ({ x: p.x * imgAspectRatio, y: p.y })
  const fromPx = (p: GeoPoint): GeoPoint => ({ x: p.x / imgAspectRatio, y: p.y })

  if (isCorner) {
    if (quad.length !== 6 || !(frontWidthInches! > 0) || !(sideWidthInches! > 0)) return quad
    const [tlN, tmN, trN, brN, bmN, blN] = quad
    const [tl, tm, tr, br, bm, bl] = [tlN, tmN, trN, brN, bmN, blN].map(toPx)

    const heightPx = quadPixelDimensions(quad, pseudoImgDims(imgAspectRatio), true).heightPx
    if (!(heightPx > 0)) return quad

    const newFrontWidthPx = heightPx * (frontWidthInches! / targetHeightInches)
    const newSideWidthPx = heightPx * (sideWidthInches! / targetHeightInches)

    const newTl = extendTo(tm, tl, newFrontWidthPx)
    const newBl = extendTo(bm, bl, newFrontWidthPx)
    const newTr = extendTo(tm, tr, newSideWidthPx)
    const newBr = extendTo(bm, br, newSideWidthPx)

    return [newTl, tm, newTr, newBr, bm, newBl].map(fromPx)
  }

  if (quad.length !== 4) return quad
  const [tl, tr, br, bl] = quad.map(toPx)
  const centroid = {
    x: (tl.x + tr.x + br.x + bl.x) / 4,
    y: (tl.y + tr.y + br.y + bl.y) / 4,
  }

  const { widthPx, heightPx } = quadPixelDimensions(quad, pseudoImgDims(imgAspectRatio), false)
  if (!(widthPx > 0) || !(heightPx > 0)) return quad

  // Preserve area (the drawn box's overall "size") and re-split it into the
  // target width:height ratio, rather than biasing toward keeping width or
  // height fixed.
  const area = widthPx * heightPx
  const targetRatio = targetWidthInches / targetHeightInches
  const newHeight = Math.sqrt(area / targetRatio)
  const newWidth = area / newHeight

  const theta = Math.atan2(tr.y - tl.y, tr.x - tl.x)
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const halfW = newWidth / 2, halfH = newHeight / 2
  const local = [
    { x: -halfW, y: -halfH }, // TL
    { x: halfW, y: -halfH },  // TR
    { x: halfW, y: halfH },   // BR
    { x: -halfW, y: halfH },  // BL
  ]

  return local
    .map(p => ({
      x: p.x * cosT - p.y * sinT + centroid.x,
      y: p.x * sinT + p.y * cosT + centroid.y,
    }))
    .map(fromPx)
}
