"use client"

// Converts a PDF logo (first page) to a PNG data URL so it can flow through
// the same pipeline as an uploaded raster logo (color extraction, complexity
// analysis, AI compositing). pdfjs-dist is dynamically imported — most users
// upload PNG/JPG, so we don't want the PDF renderer in the initial bundle.

const TARGET_LONG_EDGE_PX = 1600

let workerConfigured = false

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist")
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString()
    workerConfigured = true
  }
  return pdfjs
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

/** Renders the first page of a PDF logo to a transparent-background PNG data URL. */
export async function pdfFileToLogoDataUrl(file: File): Promise<string> {
  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  try {
    const page = await doc.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.max(TARGET_LONG_EDGE_PX / Math.max(baseViewport.width, baseViewport.height), 1)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas rendering is not supported in this browser")

    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL("image/png")
  } finally {
    await doc.destroy()
  }
}
