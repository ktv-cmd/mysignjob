# Touch / Finger-Ergonomics Fix Plan (for Sonnet)

_Audit 2026-07-14, measured live at 390×844. **This is a plan — do not treat any measurement as already fixed.** Target: every interactive element ≥ 44×44 CSS px (Apple HIG) with ≥ 8px spacing between adjacent targets. Verify by re-measuring at 390px after each change._

## Ground rules for the implementer
- **Read `node_modules/next/dist/docs/` before writing code** (per AGENTS.md — this Next.js has breaking changes).
- Don't shrink anything already ≥44px. The list of "already good, do not touch" is at the bottom.
- Tailwind v4 + the project's utility conventions. Prefer `min-h-[44px]` + `inline-flex items-center` for text links, and padding bumps for inputs. Keep visual weight — enlarge the *hit area*, not necessarily the visible ink.
- After each task, re-measure with the preview tools at 390px and confirm `height >= 44 && width >= 44`.

---

## Task 1 — Nav links too short (client + SC) `[P1]`
**Files:** `components/client/ClientNav.tsx:18-40`, `components/sc/SCNav.tsx:24-38`
**Problem:** "Orders"/"Account" and all SC links render ~20px tall inside a 56px header. Fingers miss them.
**Change:** give each text `<Link>` an inline-flex 44px tap area:
```
className="inline-flex items-center min-h-[44px] text-sm font-medium ..."
```
The header is `h-14` (56px) so a 44px target fits. Keep the visible text the same.
**Acceptance:** each nav link ≥44px tall; still vertically centered; header height unchanged.

## Task 2 — SC nav overflows horizontally on mobile `[P1]`
**File:** `components/sc/SCNav.tsx:17-41`
**Problem:** brand + 4 links on one row clip past 390px ("Payouts" cut off, "· SC Portal" wraps).
**Change:** make the nav responsive. Simplest robust option: horizontal-scroll the link row on small screens —
```
<nav className="flex items-center gap-6 overflow-x-auto no-scrollbar -mx-1 px-1 max-w-full">
```
and hide the "· SC Portal" suffix under `sm` (`hidden sm:inline`). If a scroll row feels cheap, add a hamburger/menu under `sm` instead. Coordinate with Task 8 (double header).
**Acceptance:** at 390px no horizontal clipping; all four links reachable; brand not wrapping.

## Task 3 — "Use a different photo" link `[P1]`
**File:** `components/order/PhotoUpload.tsx:58-64`
**Problem:** 16px-tall `text-xs underline` link — hard to hit, and it's the only way to undo a wrong photo.
**Change:** `inline-flex items-center min-h-[44px]` and bump to `text-sm`. Keep it left-aligned under the preview.
**Acceptance:** ≥44px tall tap area.

## Task 4 — "Reset" control on the sign-marking step `[P1]`
**File:** `components/order/QuadSelector.tsx:905-911`
**Problem:** 16×32px `text-xs` link sitting right next to the draggable canvas — easy to hit by accident *or* miss on purpose. Resets the box the user just placed.
**Change:** give it a real button hit area: `inline-flex items-center min-h-[44px] px-3 text-sm`. Keep it visually secondary (muted), but ensure it's separated from the canvas by ≥8px (it already sits in the caption row below — verify spacing).
**Acceptance:** ≥44px tall; ≥8px gap from canvas and from the caption text.

## Task 5 — Night-photo (🌙/☀️) toggle on picture tiles `[P1]`
**File:** `components/order/PictureChoice.tsx:75-85`
**Problem:** `w-6 h-6` (24px) overlay button — this is the day/night switch on the mount-type and lighting tiles, and it lives inside a larger tile, so a mis-tap selects the tile instead.
**Change:** enlarge to `w-11 h-11` (44px) — or at minimum `w-9 h-9` with the emoji centered. It already `stopPropagation`s, so a bigger target won't trigger tile selection. Keep the semi-transparent pill background so it stays legible over photos.
**Acceptance:** toggle ≥44×44 (or justify ≥36 if 44 crowds the tile); tapping it never selects the tile.

## Task 6 — "Copy prompt" / "Full prompt" disclosure `[P2]`
**File:** `app/(client)/order/new/page.tsx:1548-1560` (the prompt-preview block)
**Problem:** "Copy" (16×30px) and the "Full prompt we send to the AI" toggle (16px) are tiny.
**Change:** wrap each in `inline-flex items-center min-h-[44px] px-2`; keep `text-xs` visible label if desired but expand the clickable area. If "Copy" is an icon-only-ish button, ensure 44×44.
**Acceptance:** both ≥44px tall.

## Task 7 — Single-line inputs & selects are 38px `[P2, broad]`
**Files:** `app/(client)/order/new/page.tsx` inputs at lines **815, 829, 852, 864, 877, 892, 904, 1048** and reference `<select>`; guest-modal inputs (1886–1916 are already `py-2.5` — leave); plus SC onboarding forms (`app/(sc)/sc/onboarding/business/*`) and auth fields (`components/auth/AuthUI.tsx`).
**Problem:** `px-3 py-2 text-sm` → ~38px. Tapping into a field is more forgiving than a button, so this is P2, but bumping to 44 is trivial and consistent.
**Change:** standardize form inputs to `py-2.5` (→ ~44px) — ideally define one shared input class/component so this isn't set in 15 places. Textareas (`resize-none`, line 1524) are already tall — leave.
**Acceptance:** single-line inputs/selects ≥44px; no layout breakage in the wizard or onboarding.

## Task 8 — Double header on SC onboarding `[P1, from UX audit P1-3]`
**Files:** `app/(sc)/sc/layout.tsx` + `app/(sc)/sc/onboarding/layout.tsx`
**Problem:** SCNav ("· SC Portal") and the onboarding header ("· Partner Application") stack — wastes above-the-fold space on mobile.
**Change:** during onboarding, render only one. Simplest: don't render `SCNav` inside the onboarding route (or hide the onboarding sub-brand). Confirm which layout owns which header before deleting.
**Acceptance:** one brand header on `/sc/onboarding/*`; SCNav still present on dashboard/quotes/jobs.

## Task 9 — Step-indicator chips are 24px & clickable `[P2]`
**File:** `app/(client)/order/new/page.tsx:683-706`
**Problem:** the numbered step buttons (Photo/Mark/…/Submit) are ~24px tall tap targets used for back-navigation via `goTo()`.
**Change:** either (a) give each `min-h-[44px]` if they're meant to be tapped, or (b) if they're primarily a progress indicator, keep them small but ensure the *primary* back-nav is the 44px "← Back" button (it already is). Recommend (a) with a comfortable tap area since `goTo` is a real shortcut.
**Acceptance:** if kept interactive, ≥44px; otherwise documented as display-only.

## Task 10 — Sign-type/style tiles are clickable `<div>`s `[A11y, not size]`
**File:** `app/(client)/order/new/page.tsx` (sign-type + style tile blocks) and any `PictureChoice` wrappers
**Problem:** large (212px — great for fingers) but they're `<div class="cursor-pointer">` with no keyboard focus/role. Not a touch issue; it's keyboard/AT access.
**Change:** convert to `<button type="button">` (or add `role="button" tabIndex={0}` + Enter/Space handlers). Preserve the tile styling.
**Acceptance:** tiles focusable and operable by keyboard; visual unchanged.

## Task 11 — Sticky action bar on long wizard steps `[Enhancement]`
**File:** `app/(client)/order/new/page.tsx` (Back/Continue rows per step)
**Problem:** on the customize step the primary "Continue" sits ~1400px down; the user scrolls a long way to advance.
**Change (optional, do last):** on mobile, make the per-step Back/Continue row a sticky bottom bar (`sticky bottom-0` with a safe-area-aware `pb-[env(safe-area-inset-bottom)]` and a solid/blurred background). Keep it in normal flow on `sm+`. Ensure it doesn't cover the last field (add bottom padding to the scroll area).
**Acceptance:** primary action reachable without long scroll on mobile; nothing obscured; respects iOS home-indicator inset.

---

## Global acceptance / regression check
1. Re-measure every touched element at **390px**: `getBoundingClientRect()` → `h>=44 && w>=44` (inputs/selects ≥44 tall).
2. Spot-check **desktop 1440px** for no regressions (nav, header).
3. No visual overflow at 360px, 390px, 414px.
4. Tap the night toggle 5× — never selects the parent tile.

## Already good — DO NOT shrink or "fix"
- `QuadSelector` touch handles / loupe / `touch-none` — the finger-critical interaction, already ≥44px hit zones.
- Primary CTAs (Continue/Back) — 42–48px.
- Checkbox **cards** ("I already know…", "Corner sign") — 76px label hit-area wrapping a tiny native checkbox. Good pattern; replicate it elsewhere.
- Sign-type tiles (212px), mount tiles, logo upload (64px), "Advanced AI settings" summary (44px), guest-modal inputs (`py-2.5`).

## Related (separate) — not part of this touch pass
The P0 order-submit dead-end and landing-grid overflow are in `docs/UX-AUDIT.md`. Fix P0-1 first regardless; it blocks the same known-size path a mobile user is most likely to take.
