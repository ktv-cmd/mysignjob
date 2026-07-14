// Pure client-side sign-size geometry — the "app ruler" pattern.
//
// The client marks a 2-point reference line on a known object (door, window,
// brick course, or a custom-length object) in the same photo as the sign
// quad. Because both the quad and the reference line live in the same
// normalized image space, we can convert the quad's pixel dimensions to
// real-world inches using the reference line's known length — no AI call,
// no depth model.
//
// Known v1 limitation: the angle-divergence heuristic below catches
// quad-shape distortion (the quad itself being non-rectangular in the photo)
// but does NOT detect a reference line marked in a differently-foreshortened
// region of the same photo than the sign quad (e.g. reference on a wall
// facing the camera, sign quad on a wall angled away). We mitigate this with
// UI copy asking the client to pick a reference object near the sign, not
// with additional math.

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

export function computeSignDimensions(
  quad: GeoPoint[] | null,
  reference: GeoPoint[] | null,
  referenceInches: number,
  imgDims: ImgDims | null
): SignDimensions | null {
  if (!quad || !reference || reference.length !== 2 || !imgDims) return null
  if (!(quad.length === 4 || quad.length === 6)) return null
  if (!referenceInches || referenceInches <= 0) return null

  const refPx = dist(reference[0], reference[1], imgDims)
  if (refPx < MIN_REFERENCE_PX) return null // too short to trust — caller shows inline error

  const pixelsPerInch = refPx / referenceInches
  const isCorner = quad.length === 6

  let widthInches: number
  let heightInches: number
  let frontWidthInches: number | undefined
  let sideWidthInches: number | undefined
  let angleWarning: boolean

  if (isCorner) {
    // [TL(0), TM(1), TR(2), BR(3), BM(4), BL(5)]
    const [tl, tm, tr, br, bm, bl] = quad

    const frontWidthPx = (dist(tl, tm, imgDims) + dist(bl, bm, imgDims)) / 2
    const sideWidthPx = (dist(tm, tr, imgDims) + dist(bm, br, imgDims)) / 2
    const frontHeightPx = (dist(tl, bl, imgDims) + dist(tm, bm, imgDims)) / 2
    const sideHeightPx = (dist(tm, bm, imgDims) + dist(tr, br, imgDims)) / 2
    const heightPx = (frontHeightPx + sideHeightPx) / 2

    frontWidthInches = frontWidthPx / pixelsPerInch
    sideWidthInches = sideWidthPx / pixelsPerInch
    widthInches = frontWidthInches + sideWidthInches
    heightInches = heightPx / pixelsPerInch

    angleWarning =
      edgesDiverge(dist(tl, tm, imgDims), dist(bl, bm, imgDims)) ||
      edgesDiverge(dist(tm, tr, imgDims), dist(bm, br, imgDims)) ||
      edgesDiverge(dist(tl, bl, imgDims), dist(tm, bm, imgDims)) ||
      edgesDiverge(dist(tm, bm, imgDims), dist(tr, br, imgDims))
  } else {
    // [TL(0), TR(1), BR(2), BL(3)]
    const [tl, tr, br, bl] = quad

    const topPx = dist(tl, tr, imgDims)
    const bottomPx = dist(bl, br, imgDims)
    const leftPx = dist(tl, bl, imgDims)
    const rightPx = dist(tr, br, imgDims)

    const widthPx = (topPx + bottomPx) / 2
    const heightPx = (leftPx + rightPx) / 2

    widthInches = widthPx / pixelsPerInch
    heightInches = heightPx / pixelsPerInch

    angleWarning = edgesDiverge(topPx, bottomPx) || edgesDiverge(leftPx, rightPx)
  }

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
    referencesUsed: [],
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
