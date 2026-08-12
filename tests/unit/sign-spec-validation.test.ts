import { describe, it, expect } from "vitest"
import {
  validateSignSpecDimensions,
  validateSignSpecQuadRatio,
  validateDataUrl,
} from "@/lib/sign-spec-validation"
import { MAX_REFERENCE_INCHES } from "@/lib/sign-geometry"
import type { SignSpec } from "@/types"

// A 1x1 white JPEG data URL — small, real, valid image bytes (not just a
// well-formed-looking string), so validateDataUrl's format/mime/size checks
// all run against genuine JPEG data.
const TINY_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="

// Minimal valid flat-sign SignSpec, matching the client's typed-dimensions
// path (no reference, no quad). Individual tests override fields.
function baseSpec(overrides: Partial<SignSpec> = {}): SignSpec {
  return {
    sign_type: "flat_cut",
    width_inches: 48,
    height_inches: 24,
    width_confidence: "high",
    business_name: "Joe's Pizza",
    primary_color: "#ff0000",
    secondary_color: null,
    material: "aluminum",
    illumination: "none",
    custom_notes: null,
    estimation_references: [],
    estimation_angle_warning: false,
    selection_quad: [],
    ...overrides,
  }
}

describe("validateSignSpecDimensions", () => {
  it("accepts a normal door-reference spec (the existing happy path)", () => {
    const spec = baseSpec({
      width_inches: 400,
      height_inches: 80,
      estimation_references: ["door"],
      reference_type: "door",
      reference_inches: 80,
      reference_line: [
        { x: 0, y: 0 },
        { x: 0, y: 0.2 },
      ],
    })
    expect(validateSignSpecDimensions(spec)).toBeNull()
  })

  // THE key new case: an AR measurement (WebXR, tap 4 corners) has no
  // reference object at all — no reference_type, reference_inches, or
  // reference_line. reference_inches is guarded with `!= null`, so omitting
  // it entirely should skip that check rather than fail it.
  it("accepts an AR-style spec with no reference_type, reference_inches, or reference_line", () => {
    const spec = baseSpec({
      width_inches: 60,
      height_inches: 36,
      estimation_references: [],
      // reference_type, reference_inches, reference_line: intentionally absent
    })
    expect(spec.reference_type).toBeUndefined()
    expect(spec.reference_inches).toBeUndefined()
    expect(spec.reference_line).toBeUndefined()
    expect(validateSignSpecDimensions(spec)).toBeNull()
  })

  it("rejects reference_inches out of range even though it's optional", () => {
    const tooLarge = baseSpec({ reference_inches: MAX_REFERENCE_INCHES + 1 })
    expect(validateSignSpecDimensions(tooLarge)).toBe("Reference length is missing or out of range.")

    const zero = baseSpec({ reference_inches: 0 })
    expect(validateSignSpecDimensions(zero)).toBe("Reference length is missing or out of range.")

    const negative = baseSpec({ reference_inches: -10 })
    expect(validateSignSpecDimensions(negative)).toBe("Reference length is missing or out of range.")
  })

  it("accepts reference_inches at the top of its valid range", () => {
    const spec = baseSpec({ reference_inches: MAX_REFERENCE_INCHES })
    expect(validateSignSpecDimensions(spec)).toBeNull()
  })

  it("rejects missing, zero, or negative width", () => {
    expect(validateSignSpecDimensions(baseSpec({ width_inches: 0 }))).toBe("Sign width is missing or out of range.")
    expect(validateSignSpecDimensions(baseSpec({ width_inches: -5 }))).toBe("Sign width is missing or out of range.")
    expect(validateSignSpecDimensions(baseSpec({ width_inches: NaN }))).toBe("Sign width is missing or out of range.")
  })

  it("rejects missing, zero, or negative height", () => {
    expect(validateSignSpecDimensions(baseSpec({ height_inches: 0 }))).toBe("Sign height is missing or out of range.")
    expect(validateSignSpecDimensions(baseSpec({ height_inches: -5 }))).toBe("Sign height is missing or out of range.")
    expect(validateSignSpecDimensions(baseSpec({ height_inches: NaN }))).toBe("Sign height is missing or out of range.")
  })

  it("rejects a corner sign whose front + side widths don't sum to width_inches", () => {
    const spec = baseSpec({
      is_corner: true,
      width_inches: 100,
      front_width_inches: 40,
      side_width_inches: 40, // sums to 80, off by 20 — well past the 0.5" tolerance
    })
    expect(validateSignSpecDimensions(spec)).toBe("Sign width doesn't match the front and side widths combined.")
  })

  it("accepts a corner sign whose front + side widths sum to width_inches within float tolerance", () => {
    const spec = baseSpec({
      is_corner: true,
      width_inches: 100,
      front_width_inches: 60,
      side_width_inches: 40.2, // sums to 100.2, within the 0.5" tolerance
    })
    expect(validateSignSpecDimensions(spec)).toBeNull()
  })

  it("rejects a corner sign missing front_width_inches or side_width_inches", () => {
    expect(
      validateSignSpecDimensions(baseSpec({ is_corner: true, width_inches: 100, side_width_inches: 40 }))
    ).toBe("Front width is missing or out of range.")
    expect(
      validateSignSpecDimensions(baseSpec({ is_corner: true, width_inches: 100, front_width_inches: 60 }))
    ).toBe("Side width is missing or out of range.")
  })
})

describe("validateSignSpecQuadRatio", () => {
  it("passes when no quad is present at all (e.g. AR flow with no photo overlay)", () => {
    const spec = baseSpec({ selection_quad: [] })
    expect(validateSignSpecQuadRatio(spec)).toBeNull()
  })

  it("rejects a quad present without image_aspect_ratio", () => {
    const spec = baseSpec({
      width_inches: 400,
      height_inches: 80,
      selection_quad: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.2 },
        { x: 0, y: 0.2 },
      ],
      // image_aspect_ratio intentionally omitted
    })
    expect(validateSignSpecQuadRatio(spec)).toBe(
      "Missing photo proportions needed to validate the sign area. Please go back and re-confirm your photo."
    )
  })

  it("rejects a quad whose drawn proportions contradict the stated width/height", () => {
    const spec = baseSpec({
      width_inches: 400,
      height_inches: 80, // target ratio 5:1
      image_aspect_ratio: 1,
      selection_quad: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.5 }, // drawn ratio 1:0.5 = 2:1, far from 5:1
        { x: 0, y: 0.5 },
      ],
    })
    expect(validateSignSpecQuadRatio(spec)).toBe(
      "The marked sign area doesn't match your sign's proportions. Please go back and adjust the box on your photo."
    )
  })

  it("accepts a quad whose drawn proportions match the stated width/height", () => {
    const spec = baseSpec({
      width_inches: 400,
      height_inches: 80, // target ratio 5:1
      image_aspect_ratio: 1,
      selection_quad: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.2 }, // drawn ratio 1:0.2 = 5:1, matches
        { x: 0, y: 0.2 },
      ],
    })
    expect(validateSignSpecQuadRatio(spec)).toBeNull()
  })
})

describe("validateDataUrl", () => {
  it("rejects a non-image data URL", () => {
    const err = validateDataUrl("data:text/plain;base64,aGVsbG8=", "Photo")
    expect(err).toBe("Photo: invalid data URL format.")
  })

  it("rejects a plain string that isn't a data URL at all", () => {
    const err = validateDataUrl("not-a-data-url", "Photo")
    expect(err).toBe("Photo: invalid data URL format.")
  })

  it("rejects a disallowed image mime type", () => {
    const err = validateDataUrl("data:image/gif;base64,aGVsbG8=", "Photo")
    expect(err).toBe('Photo: unsupported image type "image/gif". Only JPEG, PNG, and WebP are allowed.')
  })

  it("rejects an oversized payload", () => {
    // ~10MB decoded requires ~13.7M base64 chars; build a payload comfortably over the 10MB limit.
    const hugeBase64 = "A".repeat(15 * 1024 * 1024)
    const err = validateDataUrl(`data:image/jpeg;base64,${hugeBase64}`, "Photo")
    expect(err).toBe("Photo: image exceeds the 10 MB limit.")
  })

  it("accepts a valid small JPEG data URL", () => {
    const err = validateDataUrl(TINY_JPEG_DATA_URL, "Photo")
    expect(err).toBeNull()
  })

  it("accepts valid PNG and WebP mime types", () => {
    expect(validateDataUrl("data:image/png;base64,aGVsbG8=", "Logo")).toBeNull()
    expect(validateDataUrl("data:image/webp;base64,aGVsbG8=", "Logo")).toBeNull()
  })
})
