import { describe, it, expect } from "vitest"
import {
  computeSignDimensions, isPlausibleDimension, MAX_SIGN_DIMENSION_INCHES,
  quadPixelDimensions, validateQuadMatchesRatio, fitQuadToRatio,
  type GeoPoint,
} from "@/lib/sign-geometry"

const IMG: { w: number; h: number } = { w: 1000, h: 1000 }

describe("computeSignDimensions — 4-point (flat) quad", () => {
  const quad: GeoPoint[] = [
    { x: 0, y: 0 },     // TL
    { x: 1, y: 0 },     // TR
    { x: 1, y: 0.2 },   // BR
    { x: 0, y: 0.2 },   // BL
  ]
  const reference: GeoPoint[] = [{ x: 0, y: 0 }, { x: 0, y: 0.2 }] // 200px ruler

  it("computes width/height from a perfectly rectangular quad", () => {
    const result = computeSignDimensions(quad, reference, 80, IMG)
    expect(result).not.toBeNull()
    expect(result!.widthInches).toBeCloseTo(400, 1)
    expect(result!.heightInches).toBeCloseTo(80, 1)
    expect(result!.isCorner).toBe(false)
    expect(result!.angleWarning).toBe(false)
    expect(result!.confidence).toBe("high")
  })

  it("returns null when the reference line is too short to trust", () => {
    const tinyReference: GeoPoint[] = [{ x: 0, y: 0 }, { x: 0, y: 0.01 }] // 10px << MIN_REFERENCE_PX
    const result = computeSignDimensions(quad, tinyReference, 80, IMG)
    expect(result).toBeNull()
  })

  it("returns null for malformed inputs", () => {
    expect(computeSignDimensions(null, reference, 80, IMG)).toBeNull()
    expect(computeSignDimensions(quad, null, 80, IMG)).toBeNull()
    expect(computeSignDimensions(quad, reference, 0, IMG)).toBeNull()
    expect(computeSignDimensions(quad, reference, 80, null)).toBeNull()
  })

  it("records the passed referenceType in referencesUsed", () => {
    const result = computeSignDimensions(quad, reference, 80, IMG, "door")
    expect(result!.referencesUsed).toEqual(["door"])
  })

  it("defaults referencesUsed to [] when no referenceType is passed", () => {
    const result = computeSignDimensions(quad, reference, 80, IMG)
    expect(result!.referencesUsed).toEqual([])
  })
})

describe("computeSignDimensions — 6-point (corner) quad height averaging", () => {
  // [TL(0), TM(1), TR(2), BR(3), BM(4), BL(5)] — the fold column (TM/BM) is
  // deliberately much taller than the front (TL/BL) and side (TR/BR) columns,
  // isolating the double-weighting bug: the old formula averaged the fold
  // column into both a "front" and "side" height before combining them, so it
  // counted twice as much as either outer column.
  const quad: GeoPoint[] = [
    { x: 0, y: 0 },     // TL (0)
    { x: 0.5, y: 0 },   // TM (1)
    { x: 1, y: 0 },     // TR (2)
    { x: 1, y: 0.1 },   // BR (3) — front/side height column = 100px
    { x: 0.5, y: 0.5 }, // BM (4) — fold column height = 500px
    { x: 0, y: 0.1 },   // BL (5) — front/side height column = 100px
  ]
  const reference: GeoPoint[] = [{ x: 0, y: 0 }, { x: 0, y: 0.2 }] // 200px ruler, 80in door

  it("averages all three measured columns equally, not double-weighting the fold column", () => {
    const result = computeSignDimensions(quad, reference, 80, IMG)
    expect(result).not.toBeNull()
    expect(result!.isCorner).toBe(true)

    // Correct: (100 + 500 + 100) / 3 = 233.33px -> /2.5 px-per-inch = 93.33in
    // Buggy (pre-fix) formula produced (100+500)/2 averaged with (500+100)/2
    // = 300px -> 120in — assert we do NOT get that stale, biased value.
    expect(result!.heightInches).toBeCloseTo(93.3, 1)
    expect(result!.heightInches).not.toBeCloseTo(120, 1)
  })
})

describe("isPlausibleDimension", () => {
  it("rejects zero, negative, non-finite, and out-of-range values", () => {
    expect(isPlausibleDimension(0)).toBe(false)
    expect(isPlausibleDimension(-5)).toBe(false)
    expect(isPlausibleDimension(NaN)).toBe(false)
    expect(isPlausibleDimension(Infinity)).toBe(false)
    expect(isPlausibleDimension(MAX_SIGN_DIMENSION_INCHES + 1)).toBe(false)
    expect(isPlausibleDimension(999999)).toBe(false)
  })

  it("accepts values within (0, max]", () => {
    expect(isPlausibleDimension(1)).toBe(true)
    expect(isPlausibleDimension(60)).toBe(true)
    expect(isPlausibleDimension(MAX_SIGN_DIMENSION_INCHES)).toBe(true)
  })

  it("honors a custom max", () => {
    expect(isPlausibleDimension(500, 400)).toBe(false)
    expect(isPlausibleDimension(400, 400)).toBe(true)
  })
})

describe("quadPixelDimensions — regression vs. the pre-extraction inline math", () => {
  it("matches computeSignDimensions' flat-quad width/height (up to the reference scale)", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 },
    ]
    const result = quadPixelDimensions(quad, IMG, false)
    expect(result.widthPx).toBeCloseTo(1000, 1)
    expect(result.heightPx).toBeCloseTo(200, 1)
    expect(result.angleWarning).toBe(false)
  })

  it("matches computeSignDimensions' corner-quad height averaging", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.1 },
    ]
    const result = quadPixelDimensions(quad, IMG, true)
    // Same fixture as the "double-weighting" test above: (100+500+100)/3 = 233.33
    expect(result.heightPx).toBeCloseTo(233.3, 1)
  })

  it("computes symmetric corner front/side widths", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0, y: 0.1 },
    ]
    const result = quadPixelDimensions(quad, IMG, true)
    expect(result.frontWidthPx).toBeCloseTo(500, 1)
    expect(result.sideWidthPx).toBeCloseTo(500, 1)
    expect(result.heightPx).toBeCloseTo(100, 1)
    expect(result.widthPx).toBeCloseTo(1000, 1)
  })
})

describe("validateQuadMatchesRatio", () => {
  const squarePhotoAspect = 1 // IMG above is 1000x1000

  it("accepts a flat quad whose drawn ratio matches the target", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 },
    ] // drawn ratio 1:0.2 = 5:1
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 400, 80, false)).toBe(true) // 400:80 = 5:1
  })

  it("rejects a flat quad stretched away from the target ratio", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.1 }, { x: 0, y: 0.1 },
    ] // drawn ratio 1:0.1 = 10:1 — twice as wide relative to height as the target
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 400, 80, false)).toBe(false)
  })

  it("accepts a ratio within tolerance and rejects one just outside it", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.205 }, { x: 0, y: 0.205 },
    ] // ~2.4% off target ratio
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 400, 80, false)).toBe(true)
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 400, 80, false, undefined, undefined, 0.01)).toBe(false)
  })

  it("validates each face independently for corner signs", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0, y: 0.1 },
    ] // front 500px, side 500px, height 100px -> both faces ratio 5:1
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 1000, 200, true, 60, 40)).toBe(false) // front target ratio 0.3, side 0.2 — neither matches drawn 5:1
    expect(validateQuadMatchesRatio(quad, squarePhotoAspect, 2000, 200, true, 1000, 1000)).toBe(true) // both faces target ratio 5:1, matches drawn
  })

  it("rejects malformed input instead of throwing", () => {
    expect(validateQuadMatchesRatio(null, 1, 400, 80, false)).toBe(false)
    expect(validateQuadMatchesRatio([{ x: 0, y: 0 }], 1, 400, 80, false)).toBe(false)
    expect(validateQuadMatchesRatio([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 }], 0, 400, 80, false)).toBe(false)
  })
})

describe("fitQuadToRatio", () => {
  it("snaps a stretched flat quad onto the target ratio, preserving area and centroid", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.1 }, { x: 0, y: 0.1 },
    ] // ratio 10:1, target is 5:1
    const fitted = fitQuadToRatio(quad, 1, 400, 80, false)
    expect(validateQuadMatchesRatio(fitted, 1, 400, 80, false)).toBe(true)

    const before = quadPixelDimensions(quad, { w: 1, h: 1 }, false)
    const after = quadPixelDimensions(fitted, { w: 1, h: 1 }, false)
    expect(after.widthPx * after.heightPx).toBeCloseTo(before.widthPx * before.heightPx, 3) // area preserved

    const centroidOf = (q: GeoPoint[]) => ({
      x: q.reduce((s, p) => s + p.x, 0) / q.length,
      y: q.reduce((s, p) => s + p.y, 0) / q.length,
    })
    const c1 = centroidOf(quad), c2 = centroidOf(fitted)
    expect(c2.x).toBeCloseTo(c1.x, 3)
    expect(c2.y).toBeCloseTo(c1.y, 3)
  })

  it("is idempotent — fitting an already-correct quad leaves its ratio unchanged", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 },
    ]
    const fitted = fitQuadToRatio(quad, 1, 400, 80, false)
    expect(validateQuadMatchesRatio(fitted, 1, 400, 80, false)).toBe(true)
  })

  it("corner mode: preserves the fold line (TM/BM) exactly and fits each face independently", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0, y: 0.1 },
    ]
    const fitted = fitQuadToRatio(quad, 1, 100, 20, true, 60, 40)
    // TM (index 1) and BM (index 4) — the building corner — must not move.
    expect(fitted[1]).toEqual(quad[1])
    expect(fitted[4]).toEqual(quad[4])
    expect(validateQuadMatchesRatio(fitted, 1, 100, 20, true, 60, 40)).toBe(true)
  })

  it("returns the input unchanged on malformed target dimensions", () => {
    const quad: GeoPoint[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 },
    ]
    expect(fitQuadToRatio(quad, 1, 0, 80, false)).toBe(quad)
    expect(fitQuadToRatio(quad, 0, 400, 80, false)).toBe(quad)
  })
})
