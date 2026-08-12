import { describe, it, expect } from "vitest"
import { mat4Multiply, isLikelyBlackFrame, flipPixelRowsY } from "@/lib/ar-frame"

// ─── mat4Multiply ───────────────────────────────────────────────────────────

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe("mat4Multiply", () => {
  it("multiplying by identity on the right returns the original matrix", () => {
    const a = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]
    expect(mat4Multiply(a, IDENTITY)).toEqual(a)
  })

  it("multiplying by identity on the left returns the original matrix", () => {
    const a = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]
    expect(mat4Multiply(IDENTITY, a)).toEqual(a)
  })

  it("produces a hand-computed product for a known pair of matrices, verifying the column-major convention explicitly", () => {
    // Conceptual (row-major, "as written on paper") matrices:
    //   A = [ 1  2  3  4]      B = [16 15 14 13]
    //       [ 5  6  7  8]          [12 11 10  9]
    //       [ 9 10 11 12]          [ 8  7  6  5]
    //       [13 14 15 16]          [ 4  3  2  1]
    //
    // mat4Multiply's column-major storage convention (matching
    // lib/ar-measure.ts's transformPoint) is element (row r, col c) at
    // index c*4+r, i.e. each matrix is stored as 4 consecutive COLUMNS, not
    // rows. So A above is entered here column-by-column:
    //   col0 = A[0][0],A[1][0],A[2][0],A[3][0] = 1,5,9,13
    //   col1 = A[0][1],A[1][1],A[2][1],A[3][1] = 2,6,10,14
    //   col2 = 3,7,11,15   col3 = 4,8,12,16
    const a = [
      1, 5, 9, 13, // column 0
      2, 6, 10, 14, // column 1
      3, 7, 11, 15, // column 2
      4, 8, 12, 16, // column 3
    ]
    //   B: col0 = 16,12,8,4   col1 = 15,11,7,3   col2 = 14,10,6,2   col3 = 13,9,5,1
    const b = [
      16, 12, 8, 4,
      15, 11, 7, 3,
      14, 10, 6, 2,
      13, 9, 5, 1,
    ]

    // Hand-computed C = A*B by the standard row-times-column rule,
    // C[row][col] = sum_k A[row][k] * B[k][col] — computed independently of
    // mat4Multiply's own indexing arithmetic (this is the point: if
    // mat4Multiply's a[k*4+row]/b[col*4+k] indexing were transposed or
    // otherwise wrong, this test would catch it even though the identity
    // tests above would not).
    //   C[0] = [1*16+2*12+3*8+4*4,   1*15+2*11+3*7+4*3,   1*14+2*10+3*6+4*2,   1*13+2*9+3*5+4*1]
    //        = [80, 70, 60, 50]
    //   C[1] = [5*16+6*12+7*8+8*4,   5*15+6*11+7*7+8*3,   5*14+6*10+7*6+8*2,   5*13+6*9+7*5+8*1]
    //        = [240, 214, 188, 162]
    //   C[2] = [9*16+10*12+11*8+12*4, 9*15+10*11+11*7+12*3, 9*14+10*10+11*6+12*2, 9*13+10*9+11*5+12*1]
    //        = [400, 358, 316, 274]
    //   C[3] = [13*16+14*12+15*8+16*4, 13*15+14*11+15*7+16*3, 13*14+14*10+15*6+16*2, 13*13+14*9+15*5+16*1]
    //        = [560, 502, 444, 386]
    //
    // Converted back to column-major storage (out[col*4+row] = C[row][col]):
    const expected = [
      80, 240, 400, 560, // column 0 = C[0][0],C[1][0],C[2][0],C[3][0]
      70, 214, 358, 502, // column 1
      60, 188, 316, 444, // column 2
      50, 162, 274, 386, // column 3
    ]

    expect(mat4Multiply(a, b)).toEqual(expected)
  })

  it("is not accidentally commutative (A*B != B*A for these matrices) — sanity check that the test above isn't vacuous", () => {
    const a = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]
    const b = [16, 12, 8, 4, 15, 11, 7, 3, 14, 10, 6, 2, 13, 9, 5, 1]
    expect(mat4Multiply(a, b)).not.toEqual(mat4Multiply(b, a))
  })
})

// ─── isLikelyBlackFrame ─────────────────────────────────────────────────────

function makeBuffer(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y)
      const idx = (y * width + x) * 4
      buf[idx] = r
      buf[idx + 1] = g
      buf[idx + 2] = b
      buf[idx + 3] = a
    }
  }
  return buf
}

describe("isLikelyBlackFrame", () => {
  it("returns true for an all-black buffer", () => {
    const buf = makeBuffer(10, 10, () => [0, 0, 0, 255])
    expect(isLikelyBlackFrame(buf, 10, 10)).toBe(true)
  })

  it("returns false for a normal (non-black) image buffer", () => {
    const buf = makeBuffer(10, 10, () => [128, 96, 64, 255])
    expect(isLikelyBlackFrame(buf, 10, 10)).toBe(false)
  })

  it("returns false when only the edges are black but the centre has real content (the realistic warm-up-vs-dark-scene case)", () => {
    // 10x10 buffer: outer border (row/col 0 and row/col 9) is black, the
    // interior is a normal color. isLikelyBlackFrame's 5 sample points —
    // fractions 0.5/0.3/0.7 of width/height — floor to indices 5, 3, 7 on a
    // 10-wide/tall buffer, all strictly interior (never 0 or 9), so every
    // sample should land on non-black content and the frame should NOT be
    // misread as a black/warm-up frame just because its edges are dark.
    const buf = makeBuffer(10, 10, (x, y) => {
      const isEdge = x === 0 || x === 9 || y === 0 || y === 9
      return isEdge ? [0, 0, 0, 255] : [200, 150, 100, 255]
    })
    expect(isLikelyBlackFrame(buf, 10, 10)).toBe(false)
  })
})

// ─── flipPixelRowsY ──────────────────────────────────────────────────────────

describe("flipPixelRowsY", () => {
  it("preserves dimensions (same total byte length)", () => {
    const buf = makeBuffer(4, 6, () => [1, 2, 3, 4])
    const flipped = flipPixelRowsY(buf, 4, 6)
    expect(flipped.length).toBe(buf.length)
  })

  it("flips GL's bottom-origin rows into top-origin image rows — proving the flip direction, not just that *a* flip happened", () => {
    // Input follows gl.readPixels' bottom-left-origin convention: row index
    // 0 is the BOTTOM of the captured image, row index (height-1) is the
    // TOP. Color row 0 (bottom) red and the top row blue.
    const width = 2
    const height = 2
    const pixels = new Uint8ClampedArray(width * height * 4)
    const setRow = (y: number, [r, g, b, a]: [number, number, number, number]) => {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        pixels[idx] = r
        pixels[idx + 1] = g
        pixels[idx + 2] = b
        pixels[idx + 3] = a
      }
    }
    setRow(0, [255, 0, 0, 255]) // GL row 0 = bottom of the real image = RED
    setRow(1, [0, 0, 255, 255]) // GL row (height-1) = top of the real image = BLUE

    const flipped = flipPixelRowsY(pixels, width, height)

    // The output is top-down (row 0 = top, row height-1 = bottom), matching
    // ImageData/canvas 2D convention. The physically-top content (BLUE,
    // originally at GL row 1) must land at output row 0; the
    // physically-bottom content (RED, originally at GL row 0) must land at
    // output row (height-1) = row 1. If the flip were a no-op, or flipped
    // the wrong axis, or flipped twice, this exact row/color pairing would
    // not hold.
    const rowBytes = width * 4
    const topRow = flipped.subarray(0, rowBytes)
    const bottomRow = flipped.subarray(rowBytes, 2 * rowBytes)

    expect(Array.from(topRow)).toEqual([0, 0, 255, 255, 0, 0, 255, 255]) // BLUE
    expect(Array.from(bottomRow)).toEqual([255, 0, 0, 255, 255, 0, 0, 255]) // RED
  })

  it("is its own inverse (flipping twice returns the original buffer) — a sanity check ruling out an accidental double-flip bug class", () => {
    const width = 3
    const height = 5
    const buf = makeBuffer(width, height, (x, y) => [x * 10, y * 10, 1, 255])
    const twice = flipPixelRowsY(flipPixelRowsY(buf, width, height), width, height)
    expect(Array.from(twice)).toEqual(Array.from(buf))
  })
})
