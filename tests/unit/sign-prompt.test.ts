import { describe, it, expect } from "vitest"
import { buildSignPrompt, type SignPromptParams } from "@/lib/sign-prompt"

const baseParams: SignPromptParams = {
  businessName: "Joe's Pizza",
  brandMode: "text-only",
  hasLogo: false,
  referenceId: "front-lid",
  illuminated: true,
  hasBackground: false,
}

describe("buildSignPrompt — lighting style plumbing (6-value fix)", () => {
  const STYLES = ["front", "back", "both", "front_back", "front_side", "back_side", "side", "full"] as const

  it("produces a distinct lighting sentence for each style, except the two legacy alias pairs", () => {
    const prompts = STYLES.map((lightingType) => buildSignPrompt({ ...baseParams, lightingType }))
    const unique = new Set(prompts)
    // "both" is a legacy alias for "front_back", and "back_side" a legacy alias
    // for "side" (kept for old queued preview_jobs rows) — everything else must
    // produce a genuinely different prompt.
    expect(unique.size).toBe(STYLES.length - 2)
  })

  it("back_side and side produce byte-identical output (side-lit only, no back-lit halo)", () => {
    const sideOut = buildSignPrompt({ ...baseParams, lightingType: "side" })
    const backSideOut = buildSignPrompt({ ...baseParams, lightingType: "back_side" })
    expect(sideOut).toBe(backSideOut)
    // Despite the legacy name, "back_side" must NOT combine back-lit + side-lit —
    // it means side-lit only. See lib/sign-prompt.ts's LIGHTING_SENTENCES note.
    expect(sideOut).toContain("side-lit only")
    expect(sideOut).not.toContain("back-lit")
  })

  it("only mentions the side-lit edge accent for front_side / back_side / side / full", () => {
    for (const style of ["front_side", "back_side", "side", "full"] as const) {
      expect(buildSignPrompt({ ...baseParams, lightingType: style })).toContain("side-lit")
    }
    for (const style of ["front", "back", "front_back", "both"] as const) {
      expect(buildSignPrompt({ ...baseParams, lightingType: style })).not.toContain("side-lit")
    }
  })

  it("mentions all three techniques together only for the full style", () => {
    expect(buildSignPrompt({ ...baseParams, lightingType: "full" })).toContain("front-lit + back-lit + side-lit together")
    expect(buildSignPrompt({ ...baseParams, lightingType: "front_back" })).not.toContain("together")
  })
})

describe("buildSignPrompt — prompt-injection mitigation", () => {
  it("strips control characters and caps businessName at 120 chars", () => {
    const dirty = "A\x00B\nC" + "x".repeat(200)
    const prompt = buildSignPrompt({ ...baseParams, businessName: dirty })
    expect(prompt).not.toContain("\x00")
    expect(prompt).not.toContain("\n")
    const nameMatch = prompt.match(/text '([^']*)'/)
    expect(nameMatch?.[1]).toBeDefined()
    expect(nameMatch!.length ? nameMatch![1]!.length : 0).toBe(120)
  })

  it("appends custom prompt text wrapped with an injection-safety preamble", () => {
    const prompt = buildSignPrompt({ ...baseParams, customPrompt: "make it look vintage" })
    expect(prompt).toContain("ADDITIONAL CLIENT STYLING PREFERENCES")
    expect(prompt).toContain("make it look vintage")
  })

  it("omits the custom-prompt section entirely when none is given", () => {
    const prompt = buildSignPrompt({ ...baseParams })
    expect(prompt).not.toContain("ADDITIONAL CLIENT STYLING PREFERENCES")
  })
})

describe("buildSignPrompt — logo fidelity clause carve-out", () => {
  it("does not duplicate the generic logo-fidelity clause for logo-only + no backer panel", () => {
    const prompt = buildSignPrompt({
      ...baseParams,
      hasLogo: true,
      brandMode: "logo-only",
      hasBackground: false,
      referenceId: "no-light-outdoor",
      illuminated: false,
    })
    expect(prompt).not.toContain("LOGO FIDELITY")
  })

  it("includes the generic logo-fidelity clause for other logo cases", () => {
    const prompt = buildSignPrompt({
      ...baseParams,
      hasLogo: true,
      brandMode: "logo-and-text",
      hasBackground: true,
      panelBg: { name: "White", code: "DB-03", hex: "#FFFFFF" },
    })
    expect(prompt).toContain("LOGO FIDELITY")
  })
})
