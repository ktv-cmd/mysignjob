import { describe, it, expect } from "vitest"
import { projectPointsToQuad, measureRectangle, METRES_TO_INCHES, type Vec3 } from "@/lib/ar-measure"
import { MAX_SIGN_DIMENSION_INCHES, type GeoPoint } from "@/lib/sign-geometry"

// Column-major identity matrix (WebXR convention): passes x/y/z straight
// through as clip coordinates and always sets w = 1, so
// ndc == input (x, y) exactly and every point is always "in front of the
// camera" (w > 0) regardless of z. Lets test fixtures specify NDC directly
// via world-space x/y in [-1, 1].
const IDENTITY_VP = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

// Column-major matrix that passes x/y through unchanged but sets w = -z
// (mimicking a real perspective projection's w-from-depth behavior): a point
// with z < 0 has w > 0 ("in front"), a point with z > 0 has w <= 0 ("behind
// the camera").
const W_FROM_NEG_Z_VP = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, -1,
  0, 0, 0, 0,
]

describe("projectPointsToQuad", () => {
  it("projects a known axis-aligned rectangle through an identity-ish projection to a predictable quad", () => {
    // NDC corners at the four extremes: (-1,1)=top-left in NDC (+Y up),
    // (1,1)=top-right, (1,-1)=bottom-right, (-1,-1)=bottom-left.
    // imgX = (ndcX+1)/2, imgY = (1-ndcY)/2 (Y flipped):
    //   (-1, 1) -> (0, 0)   (1, 1) -> (1, 0)
    //   (1, -1) -> (1, 1)   (-1,-1) -> (0, 1)
    const points: Vec3[] = [
      { x: -1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: -1, y: -1, z: 0 },
    ]
    const quad = projectPointsToQuad(points, IDENTITY_VP)
    expect(quad).not.toBeNull()
    const [tl, tr, br, bl] = quad as GeoPoint[]
    expect(tl.x).toBeCloseTo(0, 6)
    expect(tl.y).toBeCloseTo(0, 6)
    expect(tr.x).toBeCloseTo(1, 6)
    expect(tr.y).toBeCloseTo(0, 6)
    expect(br.x).toBeCloseTo(1, 6)
    expect(br.y).toBeCloseTo(1, 6)
    expect(bl.x).toBeCloseTo(0, 6)
    expect(bl.y).toBeCloseTo(1, 6)
  })

  it("orders taps into the same [TL,TR,BR,BL] output regardless of tap order", () => {
    const tl: Vec3 = { x: -1, y: 1, z: 0 }
    const tr: Vec3 = { x: 1, y: 1, z: 0 }
    const br: Vec3 = { x: 1, y: -1, z: 0 }
    const bl: Vec3 = { x: -1, y: -1, z: 0 }

    const inOrder = projectPointsToQuad([tl, tr, br, bl], IDENTITY_VP)
    const shuffled1 = projectPointsToQuad([br, tl, bl, tr], IDENTITY_VP)
    const shuffled2 = projectPointsToQuad([bl, br, tr, tl], IDENTITY_VP)

    expect(inOrder).not.toBeNull()
    expect(shuffled1).toEqual(inOrder)
    expect(shuffled2).toEqual(inOrder)
  })

  it("orders a non-square, wider-than-tall quad so TL/TR form the long (top) edge", () => {
    // NDC: x spans the full -1..1 (wide), y spans only -0.2..0.2 (short).
    //   TL_ndc(-1, 0.2) -> img(0, 0.4)   TR_ndc(1, 0.2)  -> img(1, 0.4)
    //   BR_ndc(1, -0.2) -> img(1, 0.6)   BL_ndc(-1,-0.2) -> img(0, 0.6)
    // Top edge (TL->TR) spans the full image width (1.0); left edge
    // (TL->BL) spans only 0.2 — this directly confirms orderQuad puts the
    // long edge on top/bottom, not left/right, for a wide quad. Unlike
    // measureRectangle's in-plane basis (which is derived and can be
    // arbitrarily oriented), projectPointsToQuad's x/y ARE the real image
    // axes produced by the projection math itself, so there is no
    // orientation ambiguity to get wrong here — "top-left" always means
    // small-x/small-y in genuine image space, not a basis choice.
    const tlWorld: Vec3 = { x: -1, y: 0.2, z: 0 }
    const trWorld: Vec3 = { x: 1, y: 0.2, z: 0 }
    const brWorld: Vec3 = { x: 1, y: -0.2, z: 0 }
    const blWorld: Vec3 = { x: -1, y: -0.2, z: 0 }

    const quad = projectPointsToQuad([brWorld, tlWorld, blWorld, trWorld], IDENTITY_VP)
    expect(quad).not.toBeNull()
    const [tl, tr, br, bl] = quad as GeoPoint[]
    expect(tl.x).toBeCloseTo(0, 6)
    expect(tl.y).toBeCloseTo(0.4, 6)
    expect(tr.x).toBeCloseTo(1, 6)
    expect(tr.y).toBeCloseTo(0.4, 6)
    expect(br.x).toBeCloseTo(1, 6)
    expect(br.y).toBeCloseTo(0.6, 6)
    expect(bl.x).toBeCloseTo(0, 6)
    expect(bl.y).toBeCloseTo(0.6, 6)

    const topEdgeLen = Math.hypot(tr.x - tl.x, tr.y - tl.y)
    const leftEdgeLen = Math.hypot(bl.x - tl.x, bl.y - tl.y)
    expect(topEdgeLen).toBeCloseTo(1, 6) // full image width
    expect(leftEdgeLen).toBeCloseTo(0.2, 6) // short side
    expect(topEdgeLen).toBeGreaterThan(leftEdgeLen)
  })

  it("returns null when a tapped point is behind the camera (w <= 0)", () => {
    const points: Vec3[] = [
      { x: -1, y: 1, z: -5 },  // w = 5, fine
      { x: 1, y: 1, z: -5 },   // w = 5, fine
      { x: 1, y: -1, z: -5 },  // w = 5, fine
      { x: -1, y: -1, z: 5 },  // w = -5, behind camera
    ]
    expect(projectPointsToQuad(points, W_FROM_NEG_Z_VP)).toBeNull()
  })

  it("returns null for malformed input instead of throwing", () => {
    const validPoints: Vec3[] = [
      { x: -1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: -1, y: -1, z: 0 },
    ]
    // wrong point count
    expect(projectPointsToQuad(validPoints.slice(0, 3), IDENTITY_VP)).toBeNull()
    expect(projectPointsToQuad([...validPoints, { x: 0, y: 0, z: 0 }], IDENTITY_VP)).toBeNull()
    // NaN / Infinity in a point
    expect(
      projectPointsToQuad(
        [{ x: NaN, y: 1, z: 0 }, validPoints[1], validPoints[2], validPoints[3]],
        IDENTITY_VP
      )
    ).toBeNull()
    expect(
      projectPointsToQuad(
        [{ x: Infinity, y: 1, z: 0 }, validPoints[1], validPoints[2], validPoints[3]],
        IDENTITY_VP
      )
    ).toBeNull()
    // collinear points (all on the line y=1)
    expect(
      projectPointsToQuad(
        [
          { x: -1, y: 1, z: 0 },
          { x: -0.5, y: 1, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0.5, y: 1, z: 0 },
        ],
        IDENTITY_VP
      )
    ).toBeNull()
    // duplicate/coincident points -> zero area
    expect(
      projectPointsToQuad(
        [validPoints[0], validPoints[0], validPoints[1], validPoints[1]],
        IDENTITY_VP
      )
    ).toBeNull()
    // malformed matrix: wrong length
    expect(projectPointsToQuad(validPoints, IDENTITY_VP.slice(0, 15))).toBeNull()
    // malformed matrix: NaN entry
    const nanMatrix = [...IDENTITY_VP]
    nanMatrix[5] = NaN
    expect(projectPointsToQuad(validPoints, nanMatrix)).toBeNull()
  })
})

describe("measureRectangle", () => {
  it("measures a 1m x 1m square as 39.37in x 39.37in with squareness ~1.0", () => {
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    // 1m * METRES_TO_INCHES (39.3701) = 39.3701in, rounded to 1 decimal.
    expect(result!.widthInches).toBeCloseTo(Math.round(1 * METRES_TO_INCHES * 10) / 10, 1)
    expect(result!.heightInches).toBeCloseTo(Math.round(1 * METRES_TO_INCHES * 10) / 10, 1)
    expect(result!.widthInches).toBeCloseTo(39.4, 1)
    expect(result!.heightInches).toBeCloseTo(39.4, 1)
    expect(result!.squareness).toBeCloseTo(1, 5)
  })

  it("measures a 2m x 1m rectangle correctly", () => {
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    expect(result!.widthInches).toBeCloseTo(Math.round(2 * METRES_TO_INCHES * 10) / 10, 1)
    expect(result!.heightInches).toBeCloseTo(Math.round(1 * METRES_TO_INCHES * 10) / 10, 1)
    expect(result!.squareness).toBeCloseTo(1, 5)
  })

  it("produces identical width/height/squareness regardless of tap order", () => {
    const a: Vec3 = { x: 0, y: 0, z: 0 }
    const b: Vec3 = { x: 2, y: 0, z: 0 }
    const c: Vec3 = { x: 2, y: 1, z: 0 }
    const d: Vec3 = { x: 0, y: 1, z: 0 }

    const r1 = measureRectangle([a, b, c, d])
    const r2 = measureRectangle([c, a, d, b])
    const r3 = measureRectangle([d, c, b, a])

    expect(r1).not.toBeNull()
    expect(r2).toEqual(r1)
    expect(r3).toEqual(r1)
  })

  it("gives a skewed parallelogram a squareness clearly below 1", () => {
    // A parallelogram sheared from a 1x1 square: (0,0) (1,0) (1.5,1) (0.5,1).
    // Opposite sides are exactly equal in length (a property of any
    // parallelogram: bottom = top = 1, left = right = sqrt(1.25)), so
    // edgeScore = 1 and squareness is driven entirely by angleScore,
    // isolating the angle-deviation term for a clean hand-computed check.
    //
    // Corner (0,0,0)'s two edges go to (1,0,0) [v1] and (0.5,1,0) [v2]:
    //   cos(theta) = (v1.v2)/(|v1||v2|) = 0.5 / (1 * sqrt(1.25)) = 1/sqrt(5) = 0.4472136
    //   theta = acos(0.4472136) = 1.1071487 rad (63.4349 deg)
    //   deviation from 90 deg (pi/2 = 1.5707963 rad) = 0.4636476 rad
    // By parallelogram symmetry (opposite angles equal, adjacent angles
    // supplementary), all 4 corners have this same |deviation| = 0.4636476 rad.
    //   angleScore = 1 - 0.4636476 / (pi/2) = 1 - 0.2951672 = 0.7048328
    //   squareness = angleScore * edgeScore = 0.7048328 * 1 = 0.7048328
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1.5, y: 1, z: 0 },
      { x: 0.5, y: 1, z: 0 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    expect(result!.squareness).toBeCloseTo(0.7048328, 4)
    expect(result!.squareness).toBeLessThan(0.8)
  })

  // ─── worldUp orientation (regression coverage) ──────────────────────────
  //
  // A square input can't reveal a width/height swap (both numbers are
  // identical either way), and neither can an order-independence check by
  // itself (a consistently-swapped answer is still "order independent").
  // These tests use non-square rectangles with a known real-world
  // orientation (worldUp defaults to +Y, matching WebXR reference spaces)
  // so a swap is directly observable.

  it("measures a 2m-wide x 1m-tall wall as 78.7in x 39.4in (wide case)", () => {
    // X-Y plane (normal +-Z), width along world X (2m), height along world Y (1m).
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    // 2m * 39.3701 = 78.7402in -> 78.7; 1m * 39.3701 = 39.3701in -> 39.4.
    expect(result!.widthInches).toBeCloseTo(78.7, 1)
    expect(result!.heightInches).toBeCloseTo(39.4, 1)
  })

  it("REGRESSION: measures a 1m-wide x 2m-tall wall as 39.4in x 78.7in, not swapped", () => {
    // Same wall, same plane, but rotated 90deg: width along world X (1m),
    // height along world Y (2m). This is the coordinator's exact repro of
    // the width/height-swap bug: the old arbitrary (non-worldUp-oriented)
    // in-plane basis reported { widthInches: 78.7, heightInches: 39.4 } —
    // the LONGER dimension labelled "width" regardless of true orientation.
    // Confirmed against a standalone port of the pre-fix logic: it produces
    // exactly that swapped answer on these points, while the fixed
    // worldUp-oriented measureRectangle below produces the correct one.
    const points: Vec3[] = [
      { x: -0.5, y: 1, z: 0 },
      { x: 0.5, y: 1, z: 0 },
      { x: 0.5, y: -1, z: 0 },
      { x: -0.5, y: -1, z: 0 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    // 1m * 39.3701 = 39.3701in -> 39.4; 2m * 39.3701 = 78.7402in -> 78.7.
    expect(result!.widthInches).toBeCloseTo(39.4, 1)
    expect(result!.heightInches).toBeCloseTo(78.7, 1)
  })

  it("both wide and tall cases stay order-independent under the worldUp-oriented basis", () => {
    const wide: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    const wideShuffled: Vec3[] = [wide[2], wide[0], wide[3], wide[1]]
    expect(measureRectangle(wideShuffled)).toEqual(measureRectangle(wide))

    const tall: Vec3[] = [
      { x: -0.5, y: 1, z: 0 },
      { x: 0.5, y: 1, z: 0 },
      { x: 0.5, y: -1, z: 0 },
      { x: -0.5, y: -1, z: 0 },
    ]
    const tallShuffled: Vec3[] = [tall[3], tall[1], tall[0], tall[2]]
    expect(measureRectangle(tallShuffled)).toEqual(measureRectangle(tall))
  })

  it("separates width from height correctly on a wall whose normal is not axis-aligned", () => {
    // A "storefront at 30 degrees to the world axes": a vertical wall (its
    // in-plane up is still exactly world +Y) whose in-plane "right" direction
    // is rotated 30deg off the world X axis, within the X-Z ground plane.
    // Width (2m) runs along r = (cos30, 0, sin30); height (1m) runs along
    // world +Y exactly. Rotation preserves lengths and angles, so this must
    // still report 78.7in x 39.4in and squareness ~1 despite the tilt.
    const theta = Math.PI / 6 // 30 degrees
    const r: Vec3 = { x: Math.cos(theta), y: 0, z: Math.sin(theta) }
    const halfWidth = 1 // 2m wide
    const halfHeight = 0.5 // 1m tall
    const corner = (wSign: number, hSign: number): Vec3 => ({
      x: r.x * halfWidth * wSign,
      y: halfHeight * hSign,
      z: r.z * halfWidth * wSign,
    })
    const points: Vec3[] = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    expect(result!.widthInches).toBeCloseTo(78.7, 1)
    expect(result!.heightInches).toBeCloseTo(39.4, 1)
    expect(result!.squareness).toBeCloseTo(1, 5)
  })

  it("falls back gracefully on a horizontal plane (worldUp parallel to the normal), without crashing or returning null", () => {
    // A 2m x 1m rectangle lying flat on the ground: constant y=0, so its
    // normal is +-Y — exactly parallel to the default worldUp (0,1,0).
    // There's no real "which way is up" on a horizontal surface, so this
    // exercises the documented arbitrary-basis fallback rather than the
    // worldUp-oriented path. It must still return a valid, non-null
    // measurement (not force-fail a legitimate horizontal sign area).
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
    ]
    const result = measureRectangle(points)
    expect(result).not.toBeNull()
    // The true edge lengths are forced to be {2m, 1m} regardless of which
    // in-plane direction the fallback basis happens to call "up" — only the
    // width/height LABELING is basis-dependent here, not the measured
    // lengths themselves — so assert the pair matches {39.4, 78.7} in
    // whichever order the fallback assigns them.
    const pair = [result!.widthInches, result!.heightInches].sort((a, b) => a - b)
    expect(pair[0]).toBeCloseTo(39.4, 1)
    expect(pair[1]).toBeCloseTo(78.7, 1)
    expect(result!.squareness).toBeCloseTo(1, 5)
  })

  it("falls back to the default Y-up when worldUp is malformed (non-finite or zero-length)", () => {
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    const zeroUp = measureRectangle(points, { x: 0, y: 0, z: 0 })
    const nanUp = measureRectangle(points, { x: NaN, y: 1, z: 0 })
    const defaultResult = measureRectangle(points)
    expect(zeroUp).toEqual(defaultResult)
    expect(nanUp).toEqual(defaultResult)
  })

  it("rejects an implausibly large measured rectangle", () => {
    // 1000m -> 1000 * 39.3701 = 39370.1in, way past MAX_SIGN_DIMENSION_INCHES.
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 0 },
      { x: 1000, y: 1000, z: 0 },
      { x: 0, y: 1000, z: 0 },
    ]
    expect(1000 * METRES_TO_INCHES).toBeGreaterThan(MAX_SIGN_DIMENSION_INCHES)
    expect(measureRectangle(points)).toBeNull()
  })

  it("returns null for malformed input instead of throwing", () => {
    const validPoints: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]
    // wrong point count
    expect(measureRectangle(validPoints.slice(0, 3))).toBeNull()
    expect(measureRectangle([...validPoints, { x: 2, y: 2, z: 0 }])).toBeNull()
    // NaN / Infinity in a point
    expect(
      measureRectangle([{ x: NaN, y: 0, z: 0 }, validPoints[1], validPoints[2], validPoints[3]])
    ).toBeNull()
    expect(
      measureRectangle([{ x: Infinity, y: 0, z: 0 }, validPoints[1], validPoints[2], validPoints[3]])
    ).toBeNull()
    // collinear points
    expect(
      measureRectangle([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ])
    ).toBeNull()
    // zero area (duplicate/coincident points)
    expect(measureRectangle([validPoints[0], validPoints[0], validPoints[1], validPoints[1]])).toBeNull()
    // all 4 points coincident
    expect(measureRectangle([validPoints[0], validPoints[0], validPoints[0], validPoints[0]])).toBeNull()
  })
})
