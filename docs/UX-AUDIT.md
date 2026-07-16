# My Sign Job — UX & Functional Audit

_Live walkthrough, 2026-07-14. Method: real dev server driven at **mobile 390×844** and **desktop 1440×900**, guest client order flow end-to-end + SC login/onboarding + client dashboard, cross-checked against source. Test accounts provisioned: `test-client@mysignjob.test` / `test-sc@mysignjob.test` (pw `TestPass123!`)._

## Scorecard

| Journey | Works? | Notes |
|---|---|---|
| Landing → order flow entry | ✅ | Guest anon flow starts with no login. |
| Step 1 Photo | ✅ | Clean, great guidance copy. |
| Step 2 Mark Sign Area (measure path) | ✅ | Excellent touch handling. |
| Step 2 → "I already know my size" path | ⚠️ | Advances, but poisons the rest of the flow — see **P0-1**. |
| Step 3 Sign Details | ✅ | Works; one state-coupling smell (**P2-1**). |
| Step 4 AI Preview | ❌ (in known-size path) | Silent no-op — **P0-1**. |
| Step 5 Review → Submit | ❌ (in known-size path) | Submit button does nothing — **P0-1**. |
| SC login → onboarding (agreement/business/insurance) | ✅ | Functionally solid; nav is not responsive — **P1-2**. |
| Client login → dashboard | ✅ | Clean empty state. |

---

## P0 — Blocking / broken

### P0-1 · The "I already know my sign's exact size" path dead-ends the entire order
**Screens:** Step 2 → Step 4 (AI Preview) and Step 5 (Submit) · **both viewports** · reproduced live.

**What happens:** If a client ticks **"I already know my sign's exact size"** on Step 2, types their dimensions, and continues *without* dragging the gold box, then:
- **Step 4 AI Preview renders completely empty** — no preview, no "generating…" spinner, no guest-capture modal, no error. `runPreview()` returns instantly and silently.
- **Step 5 "Submit for Quotes →" is enabled but does nothing** — no navigation, no error, no "Submitting…". The order can never be placed.

**Why:** `quad` state initializes to `null` ([page.tsx:212](app/(client)/order/new/page.tsx:212)) and `QuadSelector` only emits `onChange` **on drag / reset / corner-toggle — never on mount** ([QuadSelector.tsx](components/order/QuadSelector.tsx)). So a user who accepts the default box position never writes `quad` to state. Both gates then trip on it:
- `runPreview()`: `if (!photoDataUrl || !quad) return` ([page.tsx:509](app/(client)/order/new/page.tsx:509))
- `handleSubmit()`: guard includes `!quad` ([page.tsx:597](app/(client)/order/new/page.tsx:597))

Note `signDimensions` is satisfied by the typed numbers, so the **Continue/Submit buttons look enabled** — the failure is invisible. This directly breaks Product Promise #1.

**Fix (smallest correct):** have `QuadSelector` emit the default quad once the image loads (call `onChange([...quadRef.current])` inside the image `onload`, and/or on mount). That commits the default box even when the user never drags. Belt-and-suspenders: in `runPreview`/`handleSubmit`, when there's no `quad`, either fall back to the default quad or surface an explicit error instead of returning silently. **No user-facing button should ever be enabled-but-inert.**

---

## P1 — Major friction

### P1-1 · Landing feature cards overflow the screen on mobile
**Screen:** `/` · **mobile only** · reproduced live.
The three "how it works" cards use `grid-cols-3` with no responsive breakpoint ([app/page.tsx:64](app/page.tsx:64)). At 390px the third card ("Get competitive quotes") is clipped off the right edge and body text is unreadable. Desktop is fine.
**Fix:** `grid-cols-1 sm:grid-cols-3` (or `grid-cols-1 md:grid-cols-3`).

### P1-2 · SC portal top nav overflows on mobile
**Screens:** all `/sc/*` · **mobile only** · reproduced live.
The SC nav (Dashboard · Quotes · Jobs · Payouts) is a single horizontal row that overflows at 390px — "Payouts" is clipped and "SC Portal" wraps under the wordmark. The client nav (fewer items) fits fine, so this is SC-specific. ([components/sc/SCNav.tsx](components/sc/SCNav.tsx))
**Fix:** responsive nav — collapse to a menu/scroll container under `sm`, or shrink/stack the brand + links.

### P1-3 · Double header on SC onboarding
**Screens:** `/sc/onboarding/*` · both viewports · reproduced live.
Two stacked brand headers render: the SCNav ("My Sign Job · SC Portal") and the onboarding layout header ("My Sign Job · Partner Application"). Redundant, and on mobile it eats scarce vertical space above the fold.
**Fix:** during onboarding, suppress the app SCNav (or the onboarding sub-header) so there's one header.

---

## P2 — Polish

### P2-1 · Sign type appears pre-selected as "Light Box (blade sign)" on Step 3
Entering Sign Details with the mount left at the default "Flat on the wall," the sign type showed **Light Box (blade sign)** selected with copy "To change back and switch to flat." Worth confirming the mount-type ↔ sign-type coupling is intentional; if not, it starts users on the wrong type. (Observed on mobile; verify against `signCategory`/`lightBoxType` defaults.)

### P2-2 · Canvas sign-marking has no keyboard / screen-reader path
`QuadSelector` is `<canvas>` + pointer events only — no keyboard handlers, no ARIA, invisible to assistive tech. The intended fallback is the "I already know my size" checkbox… which is exactly the path broken by **P0-1**. So today there is **no** accessible way to complete an order. Fixing P0-1 restores the fallback; longer-term, expose the typed-dimensions path more prominently for a11y.

### P2-3 · "Continue" disabled with no reason on the measure path
On Step 2, before a valid measurement exists, "Continue → Sign Details" is correctly `disabled` — good — but the only cue is a faint opacity change. The `referenceTooShort` helper copy ("stretch the door outline…") exists but only fires once both quad and reference are set. Consider always showing a one-line "why you can't continue yet" hint next to the disabled button.

### P2-4 · Logged-in users still see `/login`
Visiting `/login` while already authenticated renders the form instead of redirecting to the role dashboard. Minor, but a quick guard would be tidier.

---

## What's genuinely good (keep it)

- **Touch engineering on `QuadSelector` is excellent** — unified pointer events, `touch-none`, `pointer: coarse` detection, ~44px hit targets, and a **magnifier loupe** so the target isn't hidden under the fingertip. This is the hard part and it's done well.
- **Guest-first flow works** — anonymous order creation with a well-placed lead-capture modal (name/phone) at the preview gate.
- **Guidance copy** on the photo step (door, tilt, lighting, full-width) is concrete and reduces bad inputs.
- **Step gating is mostly correct** — buttons disable on missing prerequisites (the P0 is the one place a gate is satisfied by the wrong signal).
- **Empty states** (client dashboard "No orders yet" + CTA) and **best-effort AI preview** ("companies can still quote") show mature product thinking.
- **Preview generation is async + polled** with sensible timeouts and network-error tolerance — avoids serverless timeouts.

---

## Suggested fix order (quick wins first)

1. **P0-1** — emit default quad on image load (unblocks preview **and** submit for the known-size path). _One-to-few lines; highest impact._
2. **P1-1** — responsive class on landing cards. _One line._
3. **P1-2 / P1-3** — SC nav responsiveness + de-duplicate onboarding header.
4. **P2-3** — reason text next to disabled Continue.
5. **P2-1** — confirm/adjust the mount→type default.

_AI preview generation and Stripe payout onboarding were intentionally **not** triggered live (real API cost / external redirect); both were validated by walking up to their trigger points and reading the source._
