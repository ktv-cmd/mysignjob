"use client"

import { useEffect, useRef, useState } from "react"
import { type GeoPoint } from "@/lib/sign-geometry"
import { type Vec3, projectPointsToQuad, measureRectangle } from "@/lib/ar-measure"
import { mat4Multiply, isLikelyBlackFrame, flipPixelRowsY } from "@/lib/ar-frame"

// Tap-4-corners AR measurement — the client stands at their storefront, taps
// the 4 corners of where the sign will go directly on the live camera view,
// and gets back a photo + sign quad + real-world inches in one gesture.
//
// Mirrors VideoRulerCapture's shape (same onCapture/onCancel contract style,
// same "one clear failure path, never a dead screen" philosophy) but the
// underlying platform is WebXR's `camera-access` + `hit-test` features
// instead of plain getUserMedia, which is what makes almost everything below
// non-obvious. All correctness-critical math (ordering 4 taps into a quad,
// projecting a 3D point into image space, judging squareness) lives in
// lib/ar-measure.ts, which is unit-tested — this component's only job is to
// plumb XRFrame data into that module and the result back onto the screen.
// See WEBXR-SPIKE.md for the research this file follows; risk numbers cited
// in comments below (e.g. "spike RISK #5") refer to that document's numbered
// risk list.

// ─── Minimal local WebXR type declarations ─────────────────────────────────
// This project's TypeScript lib set (tsconfig.json: "lib": ["dom", ...])
// does not include WebXR types — confirmed there is no XRSystem/Navigator.xr
// anywhere in node_modules/typescript/lib/lib.dom.d.ts. Rather than pull in
// a whole @types/webxr-style package for the one file that needs it, these
// are hand-written and scoped to exactly the surface this component calls.

type XRSessionMode = "immersive-ar"

interface XRSessionInit {
  requiredFeatures?: string[]
  optionalFeatures?: string[]
  domOverlay?: { root: Element }
}

interface XRSystem {
  isSessionSupported(mode: XRSessionMode): Promise<boolean>
  requestSession(mode: XRSessionMode, init?: XRSessionInit): Promise<XRSession>
}

declare global {
  interface Navigator {
    // Absent entirely on non-WebXR browsers (desktop Safari, Firefox, iOS —
    // anything without an ARCore-backed Chrome) — every call site below
    // checks for undefined rather than assuming presence.
    xr?: XRSystem
  }
}

interface XRRenderStateInit {
  baseLayer?: XRWebGLLayer
}

type XRReferenceSpaceType = "local" | "viewer"

// Opaque per spec — this component only ever passes these to other WebXR
// calls (getViewerPose, getPose, requestHitTestSource), never reads from
// them directly, so there's nothing to type beyond "some object."
type XRReferenceSpace = object

interface XRHitTestOptionsInit {
  space: XRReferenceSpace
  entityTypes?: ("point" | "plane" | "mesh")[]
}

interface XRHitTestSource {
  cancel(): void
}

interface XRRigidTransform {
  readonly matrix: Float32Array
  readonly position: DOMPointReadOnly
  readonly inverse: XRRigidTransform
}

interface XRPose {
  readonly transform: XRRigidTransform
}

interface XRHitTestResult {
  getPose(baseSpace: XRReferenceSpace): XRPose | null
}

// The camera-access feature's per-view camera descriptor. width/height are
// the raw camera texture's own dimensions — spike RISK #5: these can differ
// from the XRWebGLLayer's render viewport, and every size used for the photo
// readback or the corner projection must come from here, never the layer.
interface XRCamera {
  readonly width: number
  readonly height: number
}

interface XRView {
  readonly transform: XRRigidTransform
  readonly projectionMatrix: Float32Array
  readonly camera?: XRCamera
}

interface XRViewerPose {
  readonly views: XRView[]
}

interface XRFrame {
  getViewerPose(refSpace: XRReferenceSpace): XRViewerPose | null
  getHitTestResults(source: XRHitTestSource): XRHitTestResult[]
}

type XRFrameRequestCallback = (time: number, frame: XRFrame) => void

interface XRInputSourceEvent extends Event {
  readonly frame: XRFrame
}

interface XRViewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// Declared as a class (not just an interface) because the component
// constructs one directly with `new`.
declare class XRWebGLLayer {
  constructor(session: XRSession, context: WebGLRenderingContext, options?: object)
  readonly framebuffer: WebGLFramebuffer
  getViewport(view: XRView): XRViewport | null
}

declare class XRWebGLBinding {
  constructor(session: XRSession, context: WebGLRenderingContext)
  getCameraImage(camera: XRCamera): WebGLTexture
}

// Deliberately NOT `extends EventTarget` — XRSession's real addEventListener
// overloads (for exactly the two event names this component listens to) are
// narrower than EventTarget's generic signature, which TypeScript treats as
// an incompatible override. Declaring the handful of methods actually used
// avoids that entirely without losing any real type safety here.
interface XRSession {
  readonly domOverlayState: { type: "screen" | "floating" | "head-locked" } | null
  updateRenderState(state: XRRenderStateInit): void
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>
  requestHitTestSource(options: XRHitTestOptionsInit): Promise<XRHitTestSource>
  requestAnimationFrame(callback: XRFrameRequestCallback): number
  cancelAnimationFrame(handle: number): void
  end(): Promise<void>
  addEventListener(type: "end", listener: () => void): void
  addEventListener(type: "select", listener: (event: XRInputSourceEvent) => void): void
}

// ─── Component-local math helpers ───────────────────────────────────────────
// mat4Multiply and isLikelyBlackFrame used to live here as module-private
// helpers; they're pure functions over plain arrays/typed arrays with no
// dependency on component state, so they've moved to lib/ar-frame.ts where
// they can be unit-tested headlessly (see tests/unit/ar-frame.test.ts) and
// are imported back in above. pixelsToImageData's row-flip math moved too,
// as flipPixelRowsY — but the `new ImageData(...)` construction itself stays
// here (see attemptCapture below) rather than in lib/ar-frame.ts, because
// `ImageData` is a DOM constructor unavailable under this project's vitest
// config (environment: "node"); wrapping the flipped buffer in one is a
// one-line, untestable-but-trivial piece of DOM glue not worth hiding pure
// logic behind. readCameraPixels below stays here for the same reason: it
// closes over a live WebGLRenderingContext, which nothing in this project's
// test environment can provide.

// Binds the opaque camera texture into an offscreen framebuffer and reads it
// back as plain RGBA bytes — the exact pattern from Google's own
// camera-access-barebones reference sample (spike Q1).
function readCameraPixels(
  gl: WebGLRenderingContext,
  fbo: WebGLFramebuffer,
  texture: WebGLTexture,
  width: number,
  height: number
): Uint8ClampedArray {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const pixels = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return new Uint8ClampedArray(pixels.buffer)
}

// ─── Component ───────────────────────────────────────────────────────────

interface Props {
  onCapture: (result: {
    dataUrl: string
    quad: GeoPoint[]
    widthInches: number
    heightInches: number
    squareness: number
  }) => void
  onCancel: () => void
}

// Feature detection. Async because navigator.xr.isSessionSupported returns a
// promise. Resolves false — never throws — when navigator.xr is absent
// entirely, or for any other reason a real device might reject/throw here;
// callers (deciding whether to even mount this component) shouldn't need a
// try/catch of their own.
export async function isARMeasureSupported(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.xr) return false
  try {
    return await navigator.xr.isSessionSupported("immersive-ar")
  } catch {
    return false
  }
}

type Status = "starting" | "tracking" | "error"

const MAX_CORNERS = 4
// ~150ms at 60fps of retrying before giving up on a black/uninitialized
// camera frame and asking the client to tap Done again — generous enough to
// cover the documented warm-up window without leaving them staring at a
// stuck "Capturing…" button.
const WARMUP_MAX_FRAMES = 10
const CAPTURE_QUALITY = 0.85

export default function ARMeasureCapture({ onCapture, onCancel }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const sessionRef = useRef<XRSession | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const glBindingRef = useRef<XRWebGLBinding | null>(null)
  const baseLayerRef = useRef<XRWebGLLayer | null>(null)
  const readbackFboRef = useRef<WebGLFramebuffer | null>(null)
  const refSpaceRef = useRef<XRReferenceSpace | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const rafHandleRef = useRef<number | null>(null)

  // Guards against onCapture/onCancel ever firing twice (success racing an
  // 'end' event, a double button-tap, etc.) — see cancelAndNotify/
  // settleCapture/onSessionEnded below, which all check this before acting.
  const settledRef = useRef(false)
  // Set while fail() is in the middle of ending a session itself, so the
  // resulting 'end' event doesn't ALSO auto-fire onCancel() before the user
  // has had a chance to read the error message and dismiss it.
  const pendingErrorRef = useRef(false)

  const cornersRef = useRef<Vec3[]>([])
  const captureRequestRef = useRef<{ attempts: number } | null>(null)
  const reticleActiveRef = useRef(false)
  const hasPoseRef = useRef(false)

  // Long-lived effect (the XR session lasts as long as the client is
  // measuring, easily tens of seconds) needs the LATEST onCapture/onCancel
  // even though the setup effect below only runs once on mount — otherwise
  // a parent re-render that hands down new callback identities mid-session
  // would silently keep calling stale, mount-time closures.
  const onCaptureRef = useRef(onCapture)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCaptureRef.current = onCapture
    onCancelRef.current = onCancel
  })

  // Imperative handles the JSX buttons call — the functions themselves live
  // inside the mount effect below (so they can close cleanly over the XR
  // session's refs without re-creating on every render), and are exposed
  // here purely so onClick has something stable to invoke.
  const requestCaptureRef = useRef<() => void>(() => {})
  const undoRef = useRef<() => void>(() => {})
  const cancelButtonRef = useRef<() => void>(() => {})

  const [status, setStatus] = useState<Status>("starting")
  const [message, setMessage] = useState<string | null>(null)
  const [cornerCount, setCornerCount] = useState(0)
  const [dims, setDims] = useState<{ widthInches: number; heightInches: number; squareness: number } | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [reticleActive, setReticleActive] = useState(false)
  const [hasPose, setHasPose] = useState(false)

  useEffect(() => {
    let cancelled = false

    // BUG FIX (found in review, reproduced live in a dev server — not
    // device-dependent): settledRef/pendingErrorRef are `useRef`s, so they
    // are NOT recreated when this effect re-runs — but the effect's own
    // cleanup below unconditionally sets `settledRef.current = true` (its
    // job there is to suppress a late onSessionEnded during a REAL
    // unmount). In development, React StrictMode intentionally
    // mount->cleanup->mounts every effect once to surface exactly this
    // class of bug: the synthetic first cleanup sets settledRef.current =
    // true, and without the reset below, the SECOND (real) mount inherits
    // that stale `true` forever — permanently short-circuiting
    // settleCapture/cancelAndNotify/fail's leading `if (settledRef.current)
    // return` guards, and onSessionEnded's `!settledRef.current &&
    // !pendingErrorRef.current` check. Concretely: Cancel silently does
    // nothing, a successful 4-corner capture never reaches onCapture(), and
    // an unexpected session end never reaches onCancel() — a real dead
    // screen, confirmed by clicking Cancel in this project's own dev server
    // and observing zero effect. Resetting both flags at the top of every
    // mount (a no-op for the ordinary single-mount/production case, since
    // they already start false) makes the effect's mount phase idempotent
    // across StrictMode's synthetic pass, which is exactly what React's own
    // contract for effects requires.
    settledRef.current = false
    pendingErrorRef.current = false

    // ── Teardown / settle helpers ──────────────────────────────────────
    // Idempotent: cancels the frame loop and releases the hit-test source
    // and GL handles. Deliberately does NOT touch sessionRef or call
    // session.end() itself — callers below decide when the underlying
    // XRSession is actually ended, since a couple of paths (settleCapture,
    // cancelAndNotify) need the session reference a moment longer than this.
    function teardown() {
      if (rafHandleRef.current !== null) {
        sessionRef.current?.cancelAnimationFrame(rafHandleRef.current)
        rafHandleRef.current = null
      }
      hitTestSourceRef.current?.cancel()
      hitTestSourceRef.current = null
      refSpaceRef.current = null
      glBindingRef.current = null
      baseLayerRef.current = null
      glRef.current = null
      readbackFboRef.current = null
    }

    // The one true path to onCapture(): ends the session (constraint —
    // never leave a leaked session holding the camera hostage) and reports
    // the result exactly once.
    function settleCapture(result: {
      dataUrl: string
      quad: GeoPoint[]
      widthInches: number
      heightInches: number
      squareness: number
    }) {
      if (settledRef.current) return
      settledRef.current = true
      teardown()
      const session = sessionRef.current
      sessionRef.current = null
      session?.end().catch(() => {})
      onCaptureRef.current(result)
    }

    // The one true path to onCancel(): used by the Cancel button (both
    // during tracking and on the error screen — fail() below has usually
    // already ended the session by the time this runs, but calling it again
    // here is a harmless no-op via the settledRef/null guards) and by the
    // unexpected-session-end listener.
    function cancelAndNotify() {
      if (settledRef.current) return
      settledRef.current = true
      teardown()
      const session = sessionRef.current
      sessionRef.current = null
      session?.end().catch(() => {})
      onCancelRef.current()
    }

    // Hard failure path (session request rejected, WebGL context creation
    // failed, etc.). Ends the session immediately — the camera must not
    // stay reserved just because an error message is sitting on screen —
    // but defers the onCancel() *callback* to the Cancel button, so the
    // client actually gets to read why before this component goes away.
    function fail(msg: string) {
      pendingErrorRef.current = true
      teardown()
      const session = sessionRef.current
      sessionRef.current = null
      session?.end().catch(() => {})
      setStatus("error")
      setMessage(msg)
    }

    // Fires whenever the session ends for ANY reason — our own
    // settleCapture/cancelAndNotify/fail calling session.end(), or the
    // platform tearing it down out from under us (system back gesture,
    // permission revoked, app backgrounded). Only the latter case should
    //自動ly notify the parent; the other paths already have (or, for fail(),
    // will once the user dismisses the message).
    function onSessionEnded() {
      teardown()
      if (!settledRef.current && !pendingErrorRef.current) {
        settledRef.current = true
        onCancelRef.current()
      }
    }

    // ── Capture ─────────────────────────────────────────────────────────
    // Attempts to build the final photo + quad + dimensions from the given
    // frame's camera image. Returns "black-frame" (transient, worth
    // retrying a few frames), "degenerate" (the 4 tapped points don't
    // resolve to a sane rectangle — not a frame problem, don't retry), or
    // "success" (settleCapture has already been called).
    function attemptCapture(view: XRView, camera: XRCamera): "success" | "degenerate" | "black-frame" {
      const gl = glRef.current
      const glBinding = glBindingRef.current
      const fbo = readbackFboRef.current
      if (!gl || !glBinding || !fbo) return "black-frame"

      const texture = glBinding.getCameraImage(camera)
      const pixels = readCameraPixels(gl, fbo, texture, camera.width, camera.height)
      if (isLikelyBlackFrame(pixels, camera.width, camera.height)) return "black-frame"

      // Spike RISK #5: both the readback above and this projection key off
      // view.camera's own width/height. Nothing here reaches for the
      // XRWebGLLayer's render viewport (session.updateRenderState's
      // baseLayer / layer.getViewport) — that's a different rectangle and
      // mixing the two would silently misplace the corners relative to the
      // JPEG built from `camera`.
      const viewMatrix = Array.from(view.transform.inverse.matrix)
      const projectionMatrix = Array.from(view.projectionMatrix)
      const viewProjection = mat4Multiply(projectionMatrix, viewMatrix)

      const quad = projectPointsToQuad(cornersRef.current, viewProjection)
      const rect = measureRectangle(cornersRef.current)
      if (!quad || !rect) return "degenerate"

      const imageData = new ImageData(flipPixelRowsY(pixels, camera.width, camera.height), camera.width, camera.height)
      const canvas2d = document.createElement("canvas")
      canvas2d.width = camera.width
      canvas2d.height = camera.height
      const ctx2d = canvas2d.getContext("2d")
      if (!ctx2d) return "degenerate" // effectively unreachable; not worth a frame-retry loop over

      ctx2d.putImageData(imageData, 0, 0)
      const dataUrl = canvas2d.toDataURL("image/jpeg", CAPTURE_QUALITY)

      settleCapture({ dataUrl, quad, widthInches: rect.widthInches, heightInches: rect.heightInches, squareness: rect.squareness })
      return "success"
    }

    // ── Tap-to-place ────────────────────────────────────────────────────
    // Fires on any tap on the passthrough view (dom-overlay buttons route
    // to normal DOM click events instead, so this never double-fires for
    // button taps). The hit-test source was created against the "viewer"
    // reference space, so its ray follows wherever the phone is currently
    // pointed — i.e. the reticle drawn at screen-center below IS what this
    // hit test is testing against, without any extra per-tap projection.
    function onSelect(event: XRInputSourceEvent) {
      if (cornersRef.current.length >= MAX_CORNERS) return
      const hitTestSource = hitTestSourceRef.current
      const refSpace = refSpaceRef.current
      if (!hitTestSource || !refSpace) return

      const results = event.frame.getHitTestResults(hitTestSource)
      if (results.length === 0) return // tapped, but no surface under the reticle — ignore, let them re-aim and retap

      const pose = results[0].getPose(refSpace)
      if (!pose) return

      // Spike Q2: consume the hit result's full pose, not just a position
      // with an assumed horizontal normal — that's what keeps this correct
      // against a vertical wall instead of only against the floor. We only
      // persist the position (x, y, z) here because the downstream math in
      // lib/ar-measure.ts (measureRectangle / projectPointsToQuad) works
      // from the 4 corner positions alone — but fetching the pose via
      // getPose() (full transform) rather than any position-only shortcut
      // is what makes this correct on a tilted/vertical surface in the
      // first place.
      const { x, y, z } = pose.transform.position
      cornersRef.current = [...cornersRef.current, { x, y, z }]
      setCornerCount(cornersRef.current.length)
      setMessage(null)

      if (cornersRef.current.length === MAX_CORNERS) {
        const rect = measureRectangle(cornersRef.current)
        if (rect) {
          setDims(rect)
          // No dom-overlay grant means no visible Done button to tap — the
          // 4th corner IS the trigger in that degraded mode (see the
          // domOverlayState check in start() below).
          if (!sessionRef.current?.domOverlayState) requestCapture()
        } else {
          setDims(null)
          setMessage("Couldn't read that placement — try undoing the last corner and tapping again.")
        }
      } else {
        setDims(null)
      }
    }

    // ── Per-frame loop ──────────────────────────────────────────────────
    function onXRFrame(_time: number, frame: XRFrame) {
      const session = sessionRef.current
      if (!session) return
      rafHandleRef.current = session.requestAnimationFrame(onXRFrame)

      const refSpace = refSpaceRef.current
      if (!refSpace) return
      const pose = frame.getViewerPose(refSpace)
      if (!pose) {
        if (hasPoseRef.current) {
          hasPoseRef.current = false
          setHasPose(false)
        }
        return
      }
      if (!hasPoseRef.current) {
        hasPoseRef.current = true
        setHasPose(true)
      }

      // Every frame must at minimum bind and clear the XRWebGLLayer's
      // framebuffer — we render no 3D content of our own (all UI is the
      // dom-overlay), so this just keeps the passthrough camera visible
      // (alpha 0 = fully transparent, nothing painted over it) rather than
      // leaving the compositor with undefined/stale contents. This
      // `getViewport` call is the layer's RENDER viewport, used only for
      // `gl.viewport` here — a different rectangle from view.camera's
      // width/height used in attemptCapture, and never mixed with it.
      const gl = glRef.current
      const baseLayer = baseLayerRef.current
      if (gl && baseLayer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer)
        for (const v of pose.views) {
          const viewport = baseLayer.getViewport(v)
          if (viewport) gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        }
      }

      const view = pose.views[0] // exactly one view in handheld/phone AR (spike Q3)
      if (!view) return

      const hitTestSource = hitTestSourceRef.current
      if (hitTestSource && cornersRef.current.length < MAX_CORNERS) {
        const results = frame.getHitTestResults(hitTestSource)
        const active = results.length > 0
        if (reticleActiveRef.current !== active) {
          reticleActiveRef.current = active
          setReticleActive(active)
        }
      }

      if (captureRequestRef.current) {
        if (view.camera) {
          const outcome = attemptCapture(view, view.camera)
          if (outcome === "success") {
            captureRequestRef.current = null
          } else if (outcome === "degenerate") {
            captureRequestRef.current = null
            setCapturing(false)
            setMessage("Couldn't read that — try again.")
          } else {
            captureRequestRef.current.attempts++
            if (captureRequestRef.current.attempts > WARMUP_MAX_FRAMES) {
              captureRequestRef.current = null
              setCapturing(false)
              setMessage("Couldn't get a clear photo — try Done again.")
            }
          }
        } else {
          // camera-access was granted at session start, but this particular
          // frame has no camera image yet — treat like a black-frame retry
          // rather than failing outright.
          captureRequestRef.current.attempts++
          if (captureRequestRef.current.attempts > WARMUP_MAX_FRAMES) {
            captureRequestRef.current = null
            setCapturing(false)
            setMessage("Lost the camera feed — try Done again.")
          }
        }
      }
    }

    // ── Button handlers (exposed via refs for the JSX below) ────────────
    function requestCapture() {
      if (cornersRef.current.length !== MAX_CORNERS) return
      if (captureRequestRef.current) return // already in flight
      captureRequestRef.current = { attempts: 0 }
      setCapturing(true)
      setMessage(null)
    }

    function undoLast() {
      if (cornersRef.current.length === 0) return
      // BUG FIX (found in review, no device needed to reproduce): a capture
      // request stays in flight for up to WARMUP_MAX_FRAMES frames waiting
      // for a non-black camera frame (see onXRFrame's captureRequestRef
      // branch). If Undo fires during that window, cornersRef.current drops
      // below MAX_CORNERS while attemptCapture keeps running against it next
      // frame — projectPointsToQuad/measureRectangle both require exactly 4
      // points, so the in-flight capture is silently doomed to fail with a
      // generic "Couldn't read that — try again," misattributing a
      // user-caused corner-count change to a bad frame. The JSX `disabled`
      // prop on the Undo button covers the common case, but per this file's
      // own established pattern (see VideoRulerCapture's capturedRef
      // comment), `disabled` alone doesn't stop a tap that lands before a
      // re-render commits it — so this guard is the authoritative one.
      if (captureRequestRef.current) return
      cornersRef.current = cornersRef.current.slice(0, -1)
      setCornerCount(cornersRef.current.length)
      setDims(null)
      setMessage(null)
    }

    requestCaptureRef.current = requestCapture
    undoRef.current = undoLast
    cancelButtonRef.current = cancelAndNotify

    // ── Session bootstrap ───────────────────────────────────────────────
    async function start() {
      if (typeof navigator === "undefined" || !navigator.xr) {
        if (!cancelled) fail("AR measuring isn't available in this browser.")
        return
      }

      let session: XRSession
      try {
        session = await navigator.xr.requestSession("immersive-ar", {
          requiredFeatures: ["camera-access", "hit-test"],
          optionalFeatures: ["dom-overlay"],
          domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
        })
      } catch {
        // Covers every "can't do AR here" case in one place: no ARCore
        // device, camera-access unsupported (older Chrome), permission
        // denied, or — spike RISK #6 — opened from an in-app browser
        // (Instagram, Facebook) where navigator.xr exists but camera-access
        // is disabled inside WebView, so the session request itself is what
        // fails rather than anything reaching the frame loop.
        if (!cancelled) {
          fail(
            "Couldn't start AR measuring here. If you opened this link from Instagram, Facebook, or another in-app browser, try opening it in Chrome instead."
          )
        }
        return
      }

      if (cancelled) {
        session.end().catch(() => {})
        return
      }
      sessionRef.current = session
      session.addEventListener("end", onSessionEnded)
      session.addEventListener("select", onSelect)

      const canvas = document.createElement("canvas")
      // xrCompatible must be requested at context-creation time (the
      // spike's verified recipe) — TypeScript's WebGLContextAttributes
      // predates this WebXR-specific option, hence the narrow local cast.
      const gl = canvas.getContext("webgl", {
        xrCompatible: true,
      } as WebGLContextAttributes & { xrCompatible: boolean }) as WebGLRenderingContext | null
      if (!gl) {
        fail("Couldn't start the AR camera view on this device.")
        return
      }
      glRef.current = gl
      readbackFboRef.current = gl.createFramebuffer()

      // Plain XRWebGLLayer — NOT XRProjectionLayer / the WebXR Layers
      // module. Spike RISK #1: combining camera-access with the Layers API
      // crashed Chrome Android 147/148 (device-crashing regression, fixed
      // in M149). This sidesteps that entire bug class and matches
      // Google's own reference sample.
      const baseLayer = new XRWebGLLayer(session, gl)
      session.updateRenderState({ baseLayer })
      baseLayerRef.current = baseLayer
      glBindingRef.current = new XRWebGLBinding(session, gl)

      let localSpace: XRReferenceSpace
      let viewerSpace: XRReferenceSpace
      try {
        localSpace = await session.requestReferenceSpace("local")
        viewerSpace = await session.requestReferenceSpace("viewer")
      } catch {
        if (!cancelled) fail("Couldn't start tracking on this device.")
        return
      }
      if (cancelled) {
        session.end().catch(() => {})
        return
      }
      refSpaceRef.current = localSpace

      let hitTestSource: XRHitTestSource
      try {
        // entityTypes: ["plane"] is hit-test's own default (spike Q2) —
        // spelled out explicitly here rather than relying on that default.
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: ["plane"] })
      } catch {
        if (!cancelled) fail("Couldn't start surface detection on this device.")
        return
      }
      if (cancelled) {
        hitTestSource.cancel()
        session.end().catch(() => {})
        return
      }
      hitTestSourceRef.current = hitTestSource

      setStatus("tracking")
      rafHandleRef.current = session.requestAnimationFrame(onXRFrame)
    }

    start()

    return () => {
      cancelled = true
      // Suppress any late/async onSessionEnded auto-callback — unmounting
      // is the parent's decision, it doesn't need to be told about it via
      // onCancel(), and calling a prop during unmount cleanup risks acting
      // on a component that's already gone.
      settledRef.current = true
      teardown()
      // Constraint: always end the XR session on unmount. A leaked session
      // holds the camera hostage until the tab is closed.
      const session = sessionRef.current
      sessionRef.current = null
      session?.end().catch(() => {})
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex flex-col justify-between text-white">
      {status === "starting" && (
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="text-center space-y-3">
            <div className="h-9 w-9 mx-auto rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <p className="text-sm text-white/80">Starting AR camera…</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex-1 flex items-center justify-center bg-black p-6">
          <div className="max-w-sm space-y-4 rounded-xl border border-white/20 p-6 text-center">
            <p className="text-sm text-white/90">{message}</p>
            <button
              type="button"
              onClick={() => cancelButtonRef.current()}
              className="text-sm font-medium text-accent underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "tracking" && (
        <>
          <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
            <button
              type="button"
              onClick={() => cancelButtonRef.current()}
              className="text-sm font-medium text-white/90 underline"
            >
              Cancel
            </button>
            <span className="text-sm font-semibold bg-black/50 rounded-full px-3 py-1">
              {cornerCount} of {MAX_CORNERS} corners
            </span>
          </div>

          <div className="flex-1 relative pointer-events-none">
            {cornerCount < MAX_CORNERS && (
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full border-2"
                style={{ borderColor: reticleActive ? "#4ADE80" : "rgba(255,255,255,0.6)" }}
              />
            )}
            {!hasPose && (
              <p className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 text-center text-xs bg-black/60 rounded-lg px-3 py-2">
                Move your phone slowly so it can find its position.
              </p>
            )}
            {message && (
              <p className="absolute bottom-28 left-1/2 -translate-x-1/2 w-72 text-center text-xs bg-black/70 rounded-lg px-3 py-2">
                {message}
              </p>
            )}
          </div>

          <div className="p-4 bg-gradient-to-t from-black/70 to-transparent space-y-3">
            {dims && (
              <p className="text-center text-sm font-semibold">
                {dims.widthInches}&quot; wide &times; {dims.heightInches}&quot; tall
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => undoRef.current()}
                disabled={cornerCount === 0 || capturing}
                className="flex-1 border border-white/40 rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => requestCaptureRef.current()}
                disabled={cornerCount < MAX_CORNERS || !dims || capturing}
                className="flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {capturing ? "Capturing…" : "Done"}
              </button>
            </div>
            <p className="text-center text-xs text-white/70">Tap the wall where each corner of the sign will go.</p>
          </div>
        </>
      )}
    </div>
  )
}
