// Pure, headlessly-testable helpers for the WebXR AR measurement capture
// flow (components/order/ARMeasureCapture.tsx).
//
// WHY this file exists as a standalone module, separate from lib/ar-measure.ts:
// ar-measure.ts is plain-JS geometry (points, quads, inches) that has nothing
// to do with WebXR/WebGL data shapes. The three functions here operate on the
// raw Float32Array matrices and Uint8ClampedArray pixel buffers that WebXR and
// WebGL hand back — a different (still pure, still synchronous) input shape,
// kept in its own module rather than widening ar-measure.ts's surface with
// WebXR-flavored inputs. Moved out of the component (where they started as
// module-private helpers) purely so they can be unit-tested without a WebXR
// session or a real GL context, per the same "an AR session can only be
// exercised on a physical Android device" rationale documented at the top of
// lib/ar-measure.ts.
//
// NOTE on what did NOT move here: the component's `readCameraPixels` helper
// (binds a texture into a framebuffer and calls gl.readPixels) stays in
// ARMeasureCapture.tsx — it closes over a live WebGLRenderingContext, which
// this project's vitest config (environment: "node", no jsdom/canvas) cannot
// provide, so there is nothing headless to test there. Likewise,
// `pixelsToImageData`'s original form (which called `new ImageData(...)`
// directly) is deliberately NOT reproduced here as-is: `ImageData` is a DOM
// constructor that does not exist under vitest's node environment, so
// constructing one would make this file untestable for the same reason
// readCameraPixels is excluded. What moved is exactly the pure row-flip math
// (flipPixelRowsY, below) — the component wraps its result in
// `new ImageData(...)` itself, a one-line, untestable-but-trivial piece of
// DOM glue that isn't worth hiding pure logic behind.

// Column-major 4x4 multiply, A*B. Column-major layout convention (WebXR's,
// e.g. XRRigidTransform / gl-matrix mat4 — same one documented in
// lib/ar-measure.ts's transformPoint): a 16-number array laid out as 4
// consecutive columns, element (row r, col c) at m[c*4 + r]. Standard matrix
// multiplication C = A*B is C[row][col] = sum_k A[row][k] * B[k][col]; in
// this column-major storage that's
//   out[col*4 + row] = sum_k a[k*4 + row] * b[col*4 + k]
// (A[row][k] lives at a[k*4+row]; B[k][col] lives at b[col*4+k]).
//
// Used by the component as viewProjection = mat4Multiply(projectionMatrix,
// viewMatrix) — i.e. A=projection, B=view — so that applying the combined
// matrix to a column vector matches applying view first, then projection:
// (proj*view)*p == proj*(view*p).
export function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

// gl.readPixels on the bound framebuffer returns rows bottom-to-top (GL's
// bottom-left origin convention), but ImageData/canvas 2D expects rows
// top-to-bottom — without this flip the captured photo comes out upside
// down (spike RISK: "the camera texture's origin is bottom-left — you must
// flip Y when compositing into a normal top-left-origin image/canvas").
//
// Returns the flipped RGBA buffer only — NOT an ImageData. The caller (the
// component) does `new ImageData(flipPixelRowsY(pixels, w, h), w, h)`; see
// the file-level note above for why that one-line DOM construction can't
// live in this module.
//
// Return type is explicitly `Uint8ClampedArray<ArrayBuffer>`, not the bare
// `Uint8ClampedArray` (which TS resolves to `Uint8ClampedArray<ArrayBufferLike>`,
// i.e. possibly SharedArrayBuffer-backed) — `new Uint8ClampedArray(n)` always
// allocates a plain ArrayBuffer, and the DOM `ImageData` constructor's
// `ImageDataArray` type at the call site requires that more specific
// generic. Widening it here would fail `npx tsc --noEmit` at the call site
// with a confusing "SharedArrayBuffer is missing resizable/resize/..."
// error that has nothing to do with the actual bug.
export function flipPixelRowsY(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const flipped = new Uint8ClampedArray(pixels.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    const src = pixels.subarray(y * rowBytes, y * rowBytes + rowBytes)
    flipped.set(src, (height - 1 - y) * rowBytes)
  }
  return flipped
}

// Spike RISK: the first frame(s) after session start (and, defensively, any
// frame) can hand back an uninitialized/black camera texture. Samples a
// handful of interior points (not just the dead center, and not the edges,
// which some devices pad/crop) so a single unlucky sample landing on a
// genuinely dark part of the actual scene doesn't get misread as a warm-up
// frame.
export function isLikelyBlackFrame(pixels: Uint8ClampedArray, width: number, height: number): boolean {
  const samples: Array<[number, number]> = [
    [0.5, 0.5],
    [0.3, 0.3],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.7, 0.7],
  ]
  return samples.every(([fx, fy]) => {
    const x = Math.min(width - 1, Math.floor(width * fx))
    const y = Math.min(height - 1, Math.floor(height * fy))
    const idx = (y * width + x) * 4
    return pixels[idx] === 0 && pixels[idx + 1] === 0 && pixels[idx + 2] === 0
  })
}
