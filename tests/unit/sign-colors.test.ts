import { describe, it, expect } from "vitest"
import { colorDistance, nearestColor } from "@/lib/sign-colors"

describe("colorDistance", () => {
  it("is 0 for identical colors", () => {
    expect(colorDistance("#1C1C1C", "#1C1C1C")).toBe(0)
  })

  it("is symmetric", () => {
    expect(colorDistance("#000000", "#ABCDEF")).toBe(colorDistance("#ABCDEF", "#000000"))
  })

  it("is 195075 for black vs white (max squared RGB distance)", () => {
    expect(colorDistance("#000000", "#FFFFFF")).toBe(195075)
  })
})

describe("nearestColor", () => {
  const palette = [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#000000" },
    { name: "Red", hex: "#FF0000" },
  ]

  it("returns the exact match when present in the list", () => {
    expect(nearestColor("#000000", palette).name).toBe("Black")
  })

  it("returns the closest swatch for an unlisted color", () => {
    // near-black, should still match Black over White or Red
    expect(nearestColor("#101010", palette).name).toBe("Black")
    // near-red
    expect(nearestColor("#EE1111", palette).name).toBe("Red")
  })
})
