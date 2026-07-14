# Storefront Sign-Zone Measurement from a Single Photo — Research

## Problem Statement

In the order flow, the client marks where their sign will go by dragging a golden 4-corner quad
(`#FFD740`, "Mark where your sign will go") directly onto their storefront photo
(`components/order/QuadSelector.tsx` — corners stored as normalized 0–1 coordinates,
`[TL,TR,BR,BL]`). The task: convert that pixel-space quad — usually perspective-distorted, since
storefront photos are taken at an angle from street level — into real-world sign dimensions
(width × height, inches/feet) at **~95% accuracy (≤5% error)**, so quoting and fabrication use
correct sizes without a site visit. This requires monocular metric depth estimation plus
perspective correction, and — as shown below — a mandatory single-reference scale calibration.

---

## Candidate Comparison

| Candidate | Metric (absolute) depth? | Reference object required? | Replicate hosted? | fal.ai hosted? | License | Maintenance | Notes |
|---|---|---|---|---|---|---|---|
| **Metric3D v2** | Yes — zero-shot | No (zero-shot); reference boosts accuracy | No (HuggingFace Spaces only) | No | BSD-2-Clause (commercial OK) | Active (TPAMI 2024, ~2.3k stars) | SOTA on KITTI & NYUv2; ViT-small/large/giant2 variants; PyTorch Hub; no hosted inference API on Replicate/fal |
| **Depth Anything V2 (metric variants)** | Yes — fine-tuned metric variants (NYUv2/KITTI) | No | Yes — `chenxwh/depth-anything-v2` (~$0.02/run) | Yes — `fal-ai/image-preprocessors/depth-anything/v2` (preprocessor; relative, not metric) | Small: Apache-2.0; Base/Large/Giant: CC-BY-NC-4.0 (non-commercial for larger) | Very active (NeurIPS 2024, ~8.4k stars, Jan 2025 update) | Replicate model outputs relative depth by default; metric fine-tunes available on HuggingFace but not yet a dedicated metric Replicate endpoint |
| **Depth Anything 3 (DA3 Metric-Large)** | Yes — DA3METRIC-LARGE outputs meters | No | No | No | DA3METRIC-LARGE: Apache-2.0; Giant/Nested: CC-BY-NC-4.0 | Very active (Nov 2025 update, ~5.8k stars) | Most recent; multi-view & mono; `focal * output / 300` formula for metric; no hosted inference yet |
| **Apple DepthPro** | Yes — metric + focal length estimation, no camera intrinsics needed | No | Yes — `garg-aayush/ml-depth-pro` (~$0.079/run) | No (not found) | Apple Sample Code License (non-commercial only) | Moderate (ICLR 2025, ~5.6k stars; re-trained reference impl) | 0.3 s per 2.25 MP image on GPU; estimates focal length autonomously (big plus for phone photos); **license blocks commercial use** |
| **ZoeDepth** | Yes — combines relative + metric | No | No | No | MIT (commercial OK) | Archived May 2025 (read-only, ~2.8k stars) | Intel abandoned it; superseded by everything above; do not use |
| **UniDepth V2** | Yes — predicts metric 3D points directly | No (can accept optional intrinsics) | No | No | CC-BY-NC-4.0 (non-commercial) | Active (Feb 2025, ~1.2k stars) | Strong KITTI scores; ETH3D regression in V2 is a red flag; non-commercial license rules it out |
| **augenmass** | Pixel-ratio only (no absolute scale) | **Yes — mandatory** (ruler or known-size object in photo) | No | No | Unspecified | Low activity (~112 stars) | Browser-based, client-side; no API; not a depth model — just a pixel ruler tool |
| **image-measurer** | Pixel-ratio only | **Yes — mandatory** | No | No | MIT | Low activity (~6 stars) | Desktop PyQt5 app; no API; not suitable |
| **victornpb/measure** | Pixel-ratio only | **Yes — mandatory** | No | No | Not specified | Minimal (~1 star) | Single-page HTML app; no API; not suitable |

---

## How a Metric Depth Model Measures the Golden Quad (Pipeline)

The quad lives in pixel space on an angled facade — its on-screen shape is a perspective-distorted
trapezoid, not the sign's true rectangle. The measurement pipeline:

1. **Metric depth map** — run the storefront photo through the depth model; every pixel gets a
   depth value in meters.
2. **Back-project the 4 quad corners to 3D** — using each corner's pixel coordinates, its depth,
   and the camera intrinsics (focal length from EXIF, or model-estimated à la DepthPro):
   `X = (u − cx)·Z/f`, `Y = (v − cy)·Z/f`, `Z = depth`. The quad becomes four 3D points.
3. **Fit the facade plane** — least-squares plane through the 3D points (optionally including
   neighboring depth samples inside the quad for robustness); snap the corners onto the plane to
   suppress per-pixel depth noise.
4. **Rectify and measure** — because the quad sits on an angled plane, measuring pixel spans
   directly would understate the foreshortened edges. Working in the plane's own 2D coordinate
   frame (equivalently, applying the homography that rectifies the facade to fronto-parallel),
   measure the quad's edge lengths in metric units → true sign width × height.
5. **Scale calibration (required — see below)** — correct the global scale using one
   user-confirmed reference dimension.

Steps 2–4 are deterministic geometry; the model's only job is the depth map (and possibly focal
length). Errors in the final dimensions are dominated by depth-scale error — which is why
calibration matters.

---

## Winner: DA-V2 Metric Depth + Mandatory Single-Reference Calibration

### Depth/geometry engine: Depth Anything V2 (metric fine-tune) via Replicate

**Rationale:** (a) a community Replicate endpoint already exists (`chenxwh/depth-anything-v2`),
making hosted integration immediate without GPU infrastructure; (b) the Small variant is
Apache-2.0 (fully commercial); (c) actively maintained (NeurIPS 2024, ~8.4k stars); (d) metric
fine-tunes (NYUv2 indoor / KITTI outdoor) are on HuggingFace and can be deployed as a custom
fal.ai endpoint or swapped into a Replicate deployment; (e) benchmark AbsRel of ~5–8% is the best
starting point among the commercially-licensed, hostable options.

Caveat: the current Replicate endpoint outputs **relative** depth by default — a metric-fine-tuned
checkpoint (DA-V2-Small-Metric / Base-Metric) must be used, deployed as a custom fal.ai/Replicate
model or on serverless GPU (Modal, fly.io).

**Honourable mention — Apple DepthPro** (`garg-aayush/ml-depth-pro` on Replicate): estimates focal
length autonomously, which matters because phone uploads often have stripped or unreliable EXIF.
Ruled out for production by its non-commercial Apple Sample Code License.

### Scale calibration: REQUIRED, not optional

Be honest about the numbers: pure monocular metric depth is **±8–15% absolute scale error**
(worse with missing EXIF), which **fails the 95% target on its own**. To reach ≤5% error, a
single known reference dimension must be calibrated in — the user confirms one dimension and the
whole depth map (hence the quad measurement) is rescaled by one correction factor:

- Standard entry door: ~80 in (2032 mm) tall, ~36 in (914 mm) wide
- Standard brick course: 3 in (76 mm) per course (brick + mortar)
- Or the client simply types one measured dimension (e.g., "the doorway is 72 inches wide")

Because scale error is global (a single multiplicative factor per photo), one good reference
collapses it to the reference's own uncertainty (±1–3%) plus residual geometry noise — bringing
the pipeline to **±2–5% total**, inside the 95% accuracy target.

| Scenario | Expected dimension error |
|---|---|
| Metric depth alone, good EXIF | ±8–15% — **fails target** |
| Metric depth alone, missing/bad EXIF | ±15–25% — fails badly |
| Metric depth + user-confirmed door reference | **±2–5% — meets target** |
| Metric depth + user-entered measured dimension | **±2–4% — meets target** |

At 10 ft (120 in) sign width, ±5% = ±6 in; ±2% = ±2.4 in — suitable for fabrication spec.

---

## Integration Notes for my-sign-job

The quad corner coordinates **already exist in app state**: `QuadSelector`
(`components/order/QuadSelector.tsx`) emits normalized `[TL,TR,BR,BL]` points via `onChange`, and
the same `quad` array is already shipped to the server in `PreviewJobParams`
(`lib/ai/preview.ts`). The async-job pattern there (Supabase `preview_jobs` + storage + external
AI call) is the template to follow. Sketch (no code in this doc):

1. **Photo + quad already captured** — the order flow at `app/(client)/order/new/` uploads the
   photo and the client draws the golden quad; both are available server-side today.
2. **Depth endpoint call** — send the photo to the DA-V2 metric endpoint (Replicate or custom
   fal.ai deployment); receive the metric depth map (plus focal length if the model provides it,
   else read EXIF).
3. **Server-side geometry** — back-project the 4 quad corners, fit the facade plane, rectify,
   compute width × height (pipeline above).
4. **Client confirmation screen** — show the estimated dimensions overlaid on the photo and ask
   the client to confirm one reference ("tap the top and bottom of your door — we'll assume
   80 in") or type one known measurement. Apply the scale correction; recompute.
5. **Store & quote** — save final width × height (inches) on the order for quoting/fabrication;
   optionally pre-fill the sign-size fields.

---

## Sources

- [Metric3D / Metric3Dv2 GitHub](https://github.com/YvanYin/Metric3D)
- [Metric3Dv2 paper (arXiv 2404.15506)](https://arxiv.org/abs/2404.15506)
- [Depth Anything V2 GitHub](https://github.com/DepthAnything/Depth-Anything-V2)
- [Depth Anything V2 metric depth README](https://github.com/DepthAnything/Depth-Anything-V2/blob/main/metric_depth/README.md)
- [chenxwh/depth-anything-v2 on Replicate](https://replicate.com/chenxwh/depth-anything-v2)
- [Depth Anything 3 GitHub](https://github.com/ByteDance-Seed/depth-anything-3)
- [Apple DepthPro GitHub](https://github.com/apple/ml-depth-pro)
- [garg-aayush/ml-depth-pro on Replicate](https://replicate.com/garg-aayush/ml-depth-pro)
- [DepthPro paper — ICLR 2025](https://machinelearning.apple.com/research/depth-pro)
- [ZoeDepth GitHub (archived)](https://github.com/isl-org/ZoeDepth)
- [UniDepth GitHub](https://github.com/lpiccinelli-eth/UniDepth)
- [UniDepthV2 paper (arXiv 2502.20110)](https://arxiv.org/abs/2502.20110)
- [augenmass GitHub](https://github.com/hzeller/augenmass)
- [image-measurer GitHub](https://github.com/ozgurural/image-measurer)
- [victornpb/measure GitHub](https://github.com/victornpb/measure)
- [Survey on Monocular Metric Depth Estimation (MDPI 2025)](https://www.mdpi.com/2073-431X/14/11/502)
- [fal.ai Depth Anything v2 preprocessor](https://fal.ai/models/fal-ai/image-preprocessors/depth-anything/v2)
