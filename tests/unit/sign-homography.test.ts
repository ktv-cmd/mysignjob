import { describe, it, expect } from "vitest"
import {
  computeDoorHomographyDimensions,
  solveHomography,
  applyHomography,
  ASSUMED_DOOR_WIDTH_INCHES,
  type Mat3,
} from "@/lib/sign-homography"
import type { GeoPoint } from "@/lib/sign-geometry"

// A dead-on (perpendicular, no perspective) door: a simple per-axis affine
// mapping from door-plane inches to normalized image space — image =
// origin + inches * scale, same scale on both axes. Door is 36x80" per
// ASSUMED_DOOR_WIDTH_INCHES; the sign sits directly above it on the same
// wall (negative Y = further up, since Y=0 is the door's own top edge).
const DEAD_ON_DOOR: GeoPoint[] = [
  { x: 0.3, y: 0.5 },   // TL
  { x: 0.408, y: 0.5 }, // TR
  { x: 0.408, y: 0.74 }, // BR
  { x: 0.3, y: 0.74 },  // BL
]
// A 60"x24" flat sign, same dead-on scale, positioned above the door.
const DEAD_ON_SIGN: GeoPoint[] = [
  { x: 0.264, y: 0.35 },
  { x: 0.444, y: 0.35 },
  { x: 0.444, y: 0.422 },
  { x: 0.264, y: 0.422 },
]
const IMG: { w: number; h: number } = { w: 1000, h: 1000 }

describe("computeDoorHomographyDimensions", () => {
  it("recovers a known sign size from a dead-on (perpendicular) door photo", () => {
    const result = computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, 80, IMG, false)
    expect(result).not.toBeNull()
    expect(result!.widthInches).toBeCloseTo(60, 1)
    expect(result!.heightInches).toBeCloseTo(24, 1)
    expect(result!.isCorner).toBe(false)
    expect(result!.angleWarning).toBe(false)
    expect(result!.confidence).toBe("high")
    expect(result!.referencesUsed).toEqual(["door_homography"])
  })

  it("recovers a known sign size through an arbitrary steep-angle homography (forward-project, then solve back)", () => {
    // An arbitrary, genuinely projective (g,h != 0) transform representing a
    // steeply angled shot — door corners span w ~= 1.0..1.19 across the
    // rectangle, sign corners w ~= 0.91..1.12, real perspective distortion,
    // not just an affine tilt.
    const H_true: Mat3 = [0.01, 0.001, 0.2, 0.0005, 0.006, 0.3, 0.003, 0.001, 1]
    const doorWidthInches = ASSUMED_DOOR_WIDTH_INCHES
    const doorHeightInches = 80
    const doorSourceInches: GeoPoint[] = [
      { x: 0, y: 0 },
      { x: doorWidthInches, y: 0 },
      { x: doorWidthInches, y: doorHeightInches },
      { x: 0, y: doorHeightInches },
    ]
    // A 60"x24" sign, positioned on the same door plane, above the door.
    const signSourceInches: GeoPoint[] = [
      { x: -12, y: -50 },
      { x: 48, y: -50 },
      { x: 48, y: -26 },
      { x: -12, y: -26 },
    ]
    const project = (p: GeoPoint) => applyHomography(H_true, p)
    const doorCorners = doorSourceInches.map(project)
    const signQuad = signSourceInches.map(project)
    expect(doorCorners.every((p): p is GeoPoint => p !== null)).toBe(true)
    expect(signQuad.every((p): p is GeoPoint => p !== null)).toBe(true)

    const result = computeDoorHomographyDimensions(
      signQuad as GeoPoint[], doorCorners as GeoPoint[], doorHeightInches, IMG, false
    )
    expect(result).not.toBeNull()
    // This is the rigorous round-trip check: the solver never saw H_true,
    // only the tapped/photographed points it produced — recovering the
    // original real-world size confirms the DLT solve + inversion is
    // mathematically correct, independent of any implementation internals.
    expect(result!.widthInches).toBeCloseTo(60, 1)
    expect(result!.heightInches).toBeCloseTo(24, 1)
  })

  it("orders door taps supplied in arbitrary order the same way (shuffled == unshuffled)", () => {
    const [tl, tr, br, bl] = DEAD_ON_DOOR
    const inOrder = computeDoorHomographyDimensions(DEAD_ON_SIGN, [tl, tr, br, bl], 80, IMG, false)
    const shuffled = computeDoorHomographyDimensions(DEAD_ON_SIGN, [br, tl, bl, tr], 80, IMG, false)
    expect(inOrder).not.toBeNull()
    expect(shuffled).toEqual(inOrder)
  })

  it("reports frontWidthInches + sideWidthInches summing to widthInches for a corner sign", () => {
    // A corner sign wrapping the building corner: front face 40" wide, side
    // face 20" wide, 24" tall, fold line (TM/BM) at door-plane inches x=0.
    const cornerSignQuad: GeoPoint[] = [
      { x: 0.18, y: 0.35 },  // TL
      { x: 0.3, y: 0.35 },   // TM (fold)
      { x: 0.36, y: 0.35 },  // TR
      { x: 0.36, y: 0.422 }, // BR
      { x: 0.3, y: 0.422 },  // BM (fold)
      { x: 0.18, y: 0.422 }, // BL
    ]
    const result = computeDoorHomographyDimensions(cornerSignQuad, DEAD_ON_DOOR, 80, IMG, false)
    expect(result).not.toBeNull()
    expect(result!.isCorner).toBe(true)
    expect(result!.frontWidthInches).toBeCloseTo(40, 1)
    expect(result!.sideWidthInches).toBeCloseTo(20, 1)
    expect(result!.frontWidthInches! + result!.sideWidthInches!).toBeCloseTo(result!.widthInches, 6)
  })

  it("caps confidence at medium when referenceAssumed is true, vs high when false", () => {
    const assumed = computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, 80, IMG, true)
    const measured = computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, 80, IMG, false)
    expect(assumed?.confidence).toBe("medium")
    expect(measured?.confidence).toBe("high")
  })

  it("downgrades confidence to low (without rejecting) for a shaky-but-solvable near-singular door tap", () => {
    // A door tapped almost perfectly flat (1e-3 normalized units tall) —
    // solvable (pivot ratio ~4.5e-4, above the hard-reject floor) but poorly
    // conditioned enough that small tap error would translate into large
    // real-world error. The sign quad is sized to stay within plausible
    // bounds under the resulting (extreme) per-inch scale.
    const sliverDoor: GeoPoint[] = [
      { x: 0.3, y: 0.6 }, { x: 0.4, y: 0.6 }, { x: 0.4, y: 0.601 }, { x: 0.3, y: 0.601 },
    ]
    const nearbySign: GeoPoint[] = [
      { x: 0.266, y: 0.5997 }, { x: 0.433, y: 0.5997 }, { x: 0.433, y: 0.6 }, { x: 0.266, y: 0.6 },
    ]
    const result = computeDoorHomographyDimensions(nearbySign, sliverDoor, 80, IMG, false)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe("low")
  })

  it("rejects (returns null, never throws) on degenerate or implausible input", () => {
    const collinearDoor: GeoPoint[] = [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.4, y: 0.5 }]
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, collinearDoor, 80, IMG, false)).toBeNull()

    const coincidentDoor: GeoPoint[] = [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }]
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, coincidentDoor, 80, IMG, false)).toBeNull()

    const zeroAreaSign: GeoPoint[] = [{ x: 0.35, y: 0.4 }, { x: 0.35, y: 0.4 }, { x: 0.35, y: 0.4 }, { x: 0.35, y: 0.4 }]
    expect(computeDoorHomographyDimensions(zeroAreaSign, DEAD_ON_DOOR, 80, IMG, false)).toBeNull()

    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, 0, IMG, false)).toBeNull()
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, -80, IMG, false)).toBeNull()
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, NaN, IMG, false)).toBeNull()

    // Malformed shapes
    expect(computeDoorHomographyDimensions(null, DEAD_ON_DOOR, 80, IMG, false)).toBeNull()
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, null, 80, IMG, false)).toBeNull()
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR, 80, null, false)).toBeNull()
    expect(computeDoorHomographyDimensions(DEAD_ON_SIGN, DEAD_ON_DOOR.slice(0, 3), 80, IMG, false)).toBeNull()
    expect(computeDoorHomographyDimensions([{ x: 0, y: 0 }], DEAD_ON_DOOR, 80, IMG, false)).toBeNull()
  })
})

describe("solveHomography", () => {
  it("returns null for non-4-point input", () => {
    expect(solveHomography([{ x: 0, y: 0 }], DEAD_ON_DOOR)).toBeNull()
  })
})
