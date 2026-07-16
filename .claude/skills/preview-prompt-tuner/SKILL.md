---
name: preview-prompt-tuner
description: Use this skill whenever the task touches the AI sign-preview pipeline in my-sign-job — adding or adjusting a sign case (new sign type, mount variant, lighting mode, material), debugging why a Gemini-generated preview doesn't match the prompt (logo redrawn instead of copied, backer panel shrunk/rebuilt, gold mask bleeding through, wrong depth/material), or touching lib/sign-prompt.ts, lib/ai/preview.ts, or the preview/start → preview/status → preview/run job routes. Trigger this even if the user just says "the preview looks wrong" or "add a new awning style" without naming the files.
---

# Preview Prompt Tuner

Helps you work on the AI sign-preview pipeline: the code that turns an order's
sign spec (type, material, lighting, logo, colors) into a Gemini prompt, and
the async job that runs the generation and composites the result back onto
the client's storefront photo.

## Where things live

| Concern | File |
|---|---|
| Free-form prompt text, organized by CASE (channel letters / light box / awning / logo-only-no-panel) | [lib/sign-prompt.ts](../../../lib/sign-prompt.ts) — `buildSignPrompt()` |
| Big system instruction (physics rules, CASE A1/A2/B/C definitions, mask-erasure protocol) sent on every call | [lib/ai/preview.ts](../../../lib/ai/preview.ts) — `SIGN_SYSTEM_INSTRUCTION` |
| Image compositing: quad → mask, panel pre-paint, logo recoloring, Gemini call + retry, mask-blended composite | [lib/ai/preview.ts](../../../lib/ai/preview.ts) — `generatePreviewDataUrls()`, `generateOne()`, `recolorLogoOnWhite()` |
| Async job lifecycle | `app/api/order/preview/start/route.ts` (creates job, rate-limits, returns fast) → `preview/status/route.ts` (polls) → `preview/run/route.ts` (worker, protected by `PREVIEW_WORKER_SECRET`, replaced by a Netlify background function in prod) |
| Background-job data contract | `preview_jobs` table: `status` (`processing`/`done`/`error`), `params` (the `PreviewJobParams`), `result_urls` |

Read the specific file before editing — this SKILL.md is a map, not a copy of
the logic. `lib/sign-prompt.ts` and `lib/ai/preview.ts` together are under
1000 lines; read both in full when making a change, since prompt text and the
system instruction have to stay consistent with each other (e.g. a CASE named
in the system instruction must correspond to a branch in `buildBasePrompt`).

## The mental model: two prompt layers

Every generation sends **two** pieces of text to Gemini, and they must agree:

1. **System instruction** (`SIGN_SYSTEM_INSTRUCTION`, fixed, sent on every call) — defines the physics/construction rules and the CASE taxonomy (A1 = logo+panel cabinet, A2 = logo-only flat-cut, B = name-only channel letters, C = logo+name unified, plus the awning override).
2. **Per-request prompt** (`buildSignPrompt()`, built fresh from the order's params) — picks *which* case applies from the order's actual field values (`brandMode`, `hasBackground`, `referenceId`, etc.) and writes the specific instructions for image content, color, lighting, mounting.

If you add a new sign type or variant, you're usually changing **both**: a new
branch in `buildBasePrompt()` (or a new clause function like
`awningColorClause`/`backgroundClause`) AND, if it's a structurally new case
(not just a parameter of an existing one), a new CASE block in
`SIGN_SYSTEM_INSTRUCTION`. Adding a case to only one side is the most common
way to get a preview that ignores half the instructions.

## Adding or adjusting a case

1. Find the closest existing branch in `buildBasePrompt()` (awning, light-box,
   logo-only-no-panel, or the channel-letters fallback) and check whether the
   new thing is a *variant* of it (add a parameter + branch inside the
   existing function) or a genuinely *new* structure (needs its own case).
2. Follow the existing pattern of small clause-builder functions
   (`colorClause`, `backgroundClause`, `awningColorClause`,
   `logoFidelityClause`) rather than inlining everything into one long
   template string — each one has a narrow, testable job.
3. If it's a new structural case, add a `CASE <letter>` block to
   `SIGN_SYSTEM_INSTRUCTION` describing its geometry/material in the same
   terse, physics-vocabulary style as the existing ones (extrusion depth,
   return planes, PBR material terms) — the model responds much better to
   this register than to plain descriptive English.
4. Check `PreviewJobParams` in `lib/ai/preview.ts` — any new field the prompt
   needs has to be threaded through from the order form → job params → the
   `buildSignPrompt()` call site inside `generatePreviewDataUrls()`. All four
   have to agree on the field name and type.
5. Sanitize any new free-form user text the same way `businessName` and
   `customPrompt` already are (`sanitizeUserText`, length caps) — anything
   that reaches the prompt string is a prompt-injection surface.

## Known failure modes to check for

These are recurring, non-obvious ways a prompt change can go wrong — worth a
deliberate check whenever you touch this pipeline, not just when a bug report
mentions them:

- **Logo redrawn instead of copied.** Gemini tends to "improve" or restyle
  supplied artwork rather than reproduce it. `logoFidelityClause()` exists
  specifically to fight this with repeated exact-reproduction language. If a
  new case involves a logo, make sure this clause (or an equivalent) still
  gets appended — check the `fidelity` line near the end of
  `buildSignPrompt()`, since one branch (`logo-only` + no backer panel)
  intentionally skips the generic clause because it writes its own inline
  fidelity wording instead. If you add another case that also writes its own
  logo instructions, it needs the same carve-out or you'll get contradictory
  "preserve exact colors" + "use this other color" instructions.
- **Backer panel shrunk or rebuilt instead of respected.** When a panel is
  pre-painted into Image 1 (`isPanelPrepaint` in `generatePreviewDataUrls`),
  the model must treat that painted rectangle as the panel's *final* boundary
  — not something to erase and reconstruct at a size that fits the logo. This
  is why the prompt explicitly says "already installed at its final exact
  boundaries" and why the mask-erasure/gold-zone instructions are skipped
  entirely for this path (see `hasPaintedPanel` branching in
  `buildBasePrompt` and the `PRE-INSTALLED PANEL OVERRIDE` section of
  `SIGN_SYSTEM_INSTRUCTION`). If you change panel logic, verify both the
  per-request prompt and the system instruction still agree that a painted
  panel is authoritative and gets no gold outline.
- **Gold mask bleeding through.** The `#FFD740` gold zone marks where the sign
  goes but must be 100% erased/covered in the final image — the
  compositing step in `generateOne()` also erodes the mask edge in code
  (blur+threshold) specifically because the model sometimes leaves a thin
  gold outline at the zone boundary. If output previews show a yellow sliver
  at sign edges, check both the prompt wording (`ZERO GOLD POLICY`) and the
  `blendMask` erosion parameters in `generateOne()` — it can be either side.
- **Aspect ratio / composite misalignment.** Gemini only supports fixed
  aspect-ratio buckets (`SUPPORTED_ASPECT_RATIOS`), so the generated image
  never exactly matches the input photo's ratio; the code crops
  (`fit: "cover"`) rather than stretches to avoid warping. If a preview looks
  subtly shifted or cropped oddly, this mismatch — not the prompt — is
  usually the cause.

## Debugging a preview that doesn't match instructions

1. Enable debug dumps: set `PREVIEW_DEBUG_DIR` (or rely on the `/tmp` default
   outside production) — `debugDump()` writes the raw Gemini output and the
   final composite per generation, which tells you whether the problem is in
   what the model generated or in the compositing step.
2. Reconstruct the exact prompt for the failing order: call `buildSignPrompt`
   with the same params (or log it — the client already shows a live prompt
   preview using the same function, so client-side and server-side prompts
   never drift, per the file's own header comment).
3. Decide which layer is at fault: system instruction (wrong CASE selected or
   contradictory rule), per-request prompt (wrong clause for these params —
   check `brandMode`/`hasBackground`/`referenceId` combination), or
   compositing (mask/aspect-ratio issue, not a prompt problem at all).
4. Change one thing at a time. This prompt has accumulated many narrow,
   hard-won fixes (see the comments throughout `lib/sign-prompt.ts` and
   `lib/ai/preview.ts` — most non-obvious lines have a comment explaining
   which failure mode they prevent). A broad rewrite risks silently
   reintroducing a previously-fixed bug; prefer a targeted edit near the
   relevant clause function.

## Guardrails when editing this pipeline

- **Preview is best-effort, not required.** Per `docs/PRODUCT-SPEC.md`
  section 3.1, an order can proceed to sign-company bidding even if preview
  generation fails entirely. Don't make any part of the order flow (guest
  checkout, quad selection, bidding) depend on preview succeeding — errors
  here should surface as a job `status: "error"`, not break the order.
- **The guest/anonymous order flow must keep working.** `/order/new` runs
  without a user account (anonymous Supabase auth) per this project's
  existing guest-order-flow constraint — don't add auth requirements to
  anything the preview pipeline touches inside the `(client)` route group,
  only to the job routes that already require it (`preview/start` and
  `preview/status` already call `supabase.auth.getUser()` and correctly
  401 unauthenticated requests — anonymous sign-in still satisfies this,
  since it's still a Supabase user).
- **Don't break the start/status/run job contract.** `preview/start` must
  keep returning fast (it exists specifically to dodge serverless timeouts)
  and `preview/run` must keep checking `PREVIEW_WORKER_SECRET` before running
  arbitrary jobs. If you change `PreviewJobParams`, old in-flight jobs stored
  with the previous shape should still degrade gracefully (missing fields
  read as `undefined`, not throw).
- **Client and server must never build the prompt differently.** Both the
  order-review UI (live prompt preview) and the actual generation call
  `buildSignPrompt()` — if you need different prompt text for a preview
  display vs. the real call, that's a sign something is wrong; keep it to a
  single shared function.
