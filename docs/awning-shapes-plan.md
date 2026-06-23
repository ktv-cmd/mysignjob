# Awning Shapes — Exploration & Plan (Phase 1)

**Status:** Plan only. No feature code written.

**Architecture (decided with you):** the **3D mesh is the single source of
truth.** There is no separately-authored 2D asset. Specifically:

- Each frame style is one **`FrameSpec`** (parametric profile + sweep op) →
  built into a three.js mesh. That mesh is the *only* shape definition.
- **"2D / straight-on" is a camera preset** on the same 3D scene — a locked
  orthographic camera with orbit disabled. **"3D" is the same scene** with a
  perspective camera + `OrbitControls`. Toggling modes swaps the camera, not the
  asset.
- **Day/Night is a lighting + material change in the 3D scene**, not a palette
  swap on a 2D drawing.
- **Picker thumbnails and the no-WebGL fallback are pre-rendered snapshots** of
  each shape, captured from the same 3D model.
- The **existing hand-drawn SVG awning is kept only as a temporary fallback**
  and **retired** once the 3D straight-on view matches today's polish.

---

## 0. Headline finding — most of the *picker* already exists; the *renderer* is the real work

The Phase‑1 brief assumed the awning preview is "one flat 2D banner." It isn't —
the picker and a 2D renderer already exist. But under the decided architecture,
the existing 2D renderer is **interim**: it gets replaced by the 3D scene.

| Brief ask | Current state | Under the new architecture |
|---|---|---|
| Picker of all 12 frame styles | **Exists** as a ‹ › carousel + dots (`AwningShapeViewer` `:784`) | Becomes a strip of **3D-snapshot thumbnails** (Slice 4) |
| All 12 named shapes | **Exist** as bespoke SVG (`AwningShape` switch `:606`) | Re-expressed once as **`FrameSpec` → mesh**; SVG retired |
| Click switches main preview | **Works** (`AwningSign` `:867`) | Switches the **mesh** in the scene |
| **2D ⇄ 3D toggle + orbit** | **Missing** | **Camera-preset toggle** on one scene |
| Day/Night works | **Works** via `wallBg` palette swap | Becomes **scene lighting/material** |

**Net:** the carousel already lets people choose a frame today. The build phase
replaces the *rendering substrate* (SVG → WebGL) and adds orbit, with the SVG as
a safety net until parity.

---

## 1. Repo map

### Framework / build
- **Next.js 16.2.9**, **React 19.2.4**, **TypeScript 5**, **Tailwind 4**, App
  Router. Page: `app/(client)/configure/page.tsx` → `SignConfigurator`.
- ⚠️ **`AGENTS.md`:** *"This is NOT the Next.js you know… read
  `node_modules/next/dist/docs/` before writing any code."* The 3D scene is a
  client-only, SSR-disabled, dynamically-imported component — confirm the exact
  `next/dynamic` + `ssr:false` semantics against those docs before coding
  (WebGL needs `window`).
- Deploys via **Netlify**. Initial bundle must stay light → the three.js scene
  must be code-split behind the toggle.

### The whole wizard lives in ONE file
- `components/sign-configurator/SignConfigurator.tsx` — a **2,053‑line**
  `"use client"` component holding palettes, colour math, the storefront SVG,
  all three sign renderers, the awning shapes, the picker, the side-light view,
  and every wizard step.

### State management
- **Local React `useState` only.** No store (`zustand` is a dep but `store/` and
  `hooks/` are **empty/unused**). One `SignConfig` object (`:72`) mutated via
  `update(patch)` (`:1375`); wizard position is separate `step` state.
- Awning state already present: `awningFrame: string` (`:94`), default
  **`"waterfall"`** (`:117`); day/night is `wallBg: "day"|"night"`.

### Where the awning renders today (all **SVG** — to be replaced)
- `StorefrontPreview` (`:248`) draws one `<svg viewBox="0 0 360 300">` and
  dispatches `config.type === "awning" && <AwningSign…>` (`:379`).
- `AwningSign` (`:867`) → `AwningShape` (`:606`): a `switch(frame)` with bespoke
  per-shape `<polygon>`/`<path>` faces shaded via `shadeHex()` to fake 3D. This
  is the **interim renderer** that the WebGL scene will replace.
- `AwningShapeViewer` (`:784`) reuses `AwningShape` in the picker.

### Styling
- Tailwind utilities + `cn()` (`clsx` + `tailwind-merge`, `lib/utils`). Radix
  primitives available. No CSS modules.

### Where "YOUR NAME" comes from
- `DEFAULT_CONFIG.text = "YOUR NAME"` (`:103`), edited in step "text" (`:1797`),
  upper-cased. Rendered today as a flat centered `<text>` band on the awning
  front (`AwningSign` `textEl` `:877`). In 3D it becomes a flat front-band text
  mesh/decal (Decision C).

### ⚠️ Latent bug found while mapping
- **`finalConfig` (`:1416`) drops `awningFrame` *and* `lightboxFace`** — the
  chosen awning shape never reaches the spec sent to sign makers / preview API.
  Fix in Slice 0.

---

## 2. Architecture & decision tradeoffs (revised for 3D-as-source-of-truth)

### A — Renderer: **react-three-fiber + drei**, one scene
- True WebGL orbit via drei `<OrbitControls>`; declarative meshes from
  `FrameSpec`. Cost: ~**150–250 KB gzipped** (three + r3f + drei) → **must be
  code-split** and loaded only when the awning preview mounts. Because 3D is now
  the *primary* renderer (not an add-on), WebGL availability and the fallback
  story move onto the critical path — see D.

### B — `FrameSpec` = the single shape definition
```ts
type FrameSpec = {
  id: string; label: string;
  profile: (w: number, h: number, d: number) => Point2D[]; // side cross-section
  sweep: "extrude" | "revolve" | "loft";
  valence?: number; // optional hanging skirt (standard-with-valence)
};
```
- Both camera presets render the **same mesh** built from `FrameSpec`; nothing
  is drawn twice. Snapshots (thumbnails + fallback) are captured from this mesh.
- **Sweep per shape:** most frames are a constant cross-section swept along the
  width → **`ExtrudeGeometry`** (standard, valence, arch, bullnose, gable,
  half/quarter round, concave, waterfall, box). **Dome** is double-curved
  (bulges in width *and* depth) → **`LatheGeometry`/revolve (spherical cap)**.
  **Circular** → extrude in v1; upgrade to a loft if it reads flat.
- This *replaces* the 12 bespoke SVG cases — no parallel 2D shape code survives
  once the SVG is retired (Slice 5).

### C — "2D" = orthographic camera preset, **stored per sign type**
- **3D mode:** perspective camera + `OrbitControls` (drag to rotate/tilt).
- **2D mode:** locked **orthographic** camera, controls disabled.
- **The preset is a property of the sign type, not a global** (so future types
  set their own):
  ```ts
  const SIGN_VIEW: Record<SignType, {
    camera2d: "front" | "hero3q";   // locked 2D framing
    orbitStart: [az: number, el: number]; // where 3D orbit lands first
  }> = {
    letters:  { camera2d: "front",  orbitStart: [0, 0] },   // flat, wall-mounted → dead-on
    lightbox: { camera2d: "front",  orbitStart: [0, 0] },   // flat cabinet → dead-on
    awning:   { camera2d: "hero3q", orbitStart: HERO_3Q },  // depth/curve must read → 3/4
  };
  ```
- **Awning → 3/4 hero angle** (top-down 3/4 so you see top + front + side; dome
  looks domed, not like a box). That hero angle is **also the landing/default
  position the orbit starts from** in 3D mode.
- **Letters & Light box → flat front elevation** — they're flat and
  wall-mounted, so dead-on reads correctly. *(Note: today these are still
  rendered as flat SVG, which already* is *a front elevation; the per-type
  preset is forward-looking scaffolding — only the awning consumes a real WebGL
  camera in this phase. Letters/lightbox can migrate to the 3D scene later and
  pick up their preset for free.)*

### D — Day/Night, colour, text — all in the scene
- **Day/Night** = swap environment/key/ambient lighting (+ emissive for lit
  awnings, mirroring the SVG halo) rather than a 2D palette swap. Applies in
  both camera presets since it's one scene.
- **Colour** = mesh material colour from `selectedColours[0]` (live).
- **Text** = flat front-band text (plane/decal or `troika-three-text`) in v1;
  conform-to-surface deferred to v2.

### E — Thumbnails & no-WebGL fallback = pre-rendered 3D snapshots
- One offline/build-time render pass (headless WebGL, or a one-time offscreen
  client render) captures a PNG per shape from the `FrameSpec` mesh.
- ⚠️ **Key tradeoff of the all-3D direction — snapshots are static:** a baked
  PNG **cannot reflect the user's chosen colour, text, or day/night.**
  - *Thumbnails:* fine — they only need to convey **shape**; render in a neutral
    representative colour.
  - *No-WebGL main preview:* a static snapshot is a **real downgrade** (fixed
    colour/text/day). Mitigation: the **existing SVG stays as the live fallback**
    (it recolours + day/night + text in real time) **until** the 3D straight-on
    matches polish; only then does the static snapshot become the fallback. We
    should decide whether no-WebGL users post-retirement get the static snapshot
    or we keep the SVG indefinitely for them. *(Open decision #3.)*

### F — Retirement bar for the SVG
- "Matches today's polish" is subjective — define acceptance before deleting
  `AwningShape`: day & night moods, lit halo/glow, face/side shading, the 3/4
  hero angle, and all 12 shapes reading correctly vs the reference chart.

---

## 3. Build order — revised slices (thumbnail strip pulled earlier, per your call)

Re-sequenced so the 3D scene comes first (everything derives from it), then the
**thumbnail strip lands as soon as the meshes exist** — before the colour/day-
night polish. (The strip can't precede the scene because its thumbnails are
snapshots *of* the meshes.)

- **Slice 0 — Plumbing & bugfix (tiny).** Add `awningView: "2d" | "3d"` to
  `SignConfig` (default `"2d"`). Add the per-type `SIGN_VIEW` preset map (§2C).
  Add `awningFrame` + `lightboxFace` to `finalConfig`. *Verify: final JSON shows
  the frame.*
- **Slice 1 — 3D scene scaffold + one shape + per-type camera presets.** Extract
  the awning preview into `components/sign-configurator/awning/`. Lazy-load an
  r3f scene rendering **"standard"** from a `FrameSpec` extrude. Add the **2D⇄3D
  toggle**: perspective + `OrbitControls` (landing at the type's `orbitStart`)
  vs locked ortho `camera2d`. WebGL fallback → existing SVG. *Verify: toggle
  works; 3D orbits from the 3/4 landing; 2D locks to the hero angle; three.js
  loads only on mount (Network tab); no SSR/window crash.*
- **Slice 2 — All 12 shapes via `FrameSpec`.** Extrude for the eleven; revolve
  for **dome**. Frame switch swaps the mesh in both presets. *Verify: each shape
  matches the reference chart; dome looks domed, not extruded.*
- **Slice 3 — Snapshot pass → thumbnail strip picker (moved up).** Build the
  snapshot render pass; replace the carousel with a horizontal **thumbnail strip**
  of neutral-colour snapshots (the brief's "picker strip"); selected shape
  highlighted; click sets `awningFrame`. Also captures the asset used for the
  no-WebGL fallback. *Verify: strip switches the main preview; scroll/keyboard
  work; mobile width OK; (WebGL disabled) fallback shows the right shape.*
- **Slice 4 — Colour + Day/Night + text in the scene.** Material colour from
  `selectedColours[0]`; day/night lighting to match the SVG mood; flat front-band
  text; lit glow/emissive. *Verify: colour, text, day/night all track the same
  controls in both presets; lit awning glows at night.*
- **Slice 5 — Retire the interim SVG.** Once Slices 1–4 meet the §2F parity bar,
  remove the `AwningShape` SVG branch (keep snapshot fallback per open decision
  #3). *Verify: nothing else imports `AwningShape`; letters/lightbox unaffected.*

---

## 4. Risks & manual verification

### Risks / blast radius
- **All-3D puts WebGL on the critical path.** Once SVG is retired, WebGL is the
  only live renderer; no-WebGL users fall to **static** snapshots (no live
  colour/text/day-night). This is the central tradeoff of the chosen direction —
  see §2E and open decision #3.
- **Snapshot pipeline is new infrastructure** (headless/offscreen render, asset
  management, regeneration when a `FrameSpec` changes). New build-time concern.
- **Straight-on readability:** dead-front ortho hides shape; the 2D preset must
  use the 3/4 hero angle (§2C).
- **2,053-line single component** — extract the awning preview into its own
  module before adding 3D to limit bloat/merge risk.
- **Shared `StorefrontPreview` SVG** also serves letters, lightbox, and the
  side-light view (`LetterSideView`) — touch only the awning branch.
- **Non-standard Next 16** — read `node_modules/next/dist/docs/` before the
  dynamic import / SSR-off pattern.
- **Bundle regression** if the three.js chunk leaks into initial load — verify
  it loads lazily via the Network tab.
- **Day/Night parity** between WebGL and the old SVG is approximate — match the
  *mood*, not pixels; define the parity bar (§2F) before retiring SVG.

### Regression checklist (each slice, on `localhost:3000/configure`)
- Letters & Lightbox previews unchanged; side-light "Adjust position" tool still
  works; Day/Night still toggles for all types; wizard nav + `canAdvance`
  unchanged; **Orders / Account untouched** (only `page.tsx` imports this
  component — confirmed by grep).
- Awning pass: type → lit → style (picker) → text → colours → done; confirm
  preview, both camera presets, orbit, day/night, colour, text, and final JSON.

---

## 5. Open decisions
1. ~~**2D camera preset**~~ — **RESOLVED:** per-type preset; awning = 3/4 hero
   (also the orbit landing), letters/lightbox = front elevation, stored on the
   sign type. *(§2C)*
2. **Thumbnail colour:** neutral/representative colour for all snapshots (rec),
   or render thumbnails in the user's currently-selected colour (needs a live
   client render — won't work in the no-WebGL case)? *(§2E)* — can default to
   neutral and revisit.
3. **Post-retirement no-WebGL fallback:** accept **static snapshot** (loses live
   colour/text/day-night) for no-WebGL users, or **keep the SVG indefinitely**
   as the no-WebGL renderer instead of deleting it? *(§2E/§2F)* — decide at
   Slice 5, not blocking earlier work.
4. **Default view:** awning opens in **2D** preset, 3D on demand (rec, keeps load
   light) — confirm.
