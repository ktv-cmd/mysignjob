import { describe, it, expect } from "vitest"
import { computeSignDimensions, type GeoPoint } from "@/lib/sign-geometry"

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
