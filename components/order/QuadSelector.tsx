"use client"

import { useRef, useEffect, useState, useCallback } from "react"

export type QuadPoint = { x: number; y: number } // normalized 0–1

interface Props {
  imageDataUrl: string
  onChange: (quad: QuadPoint[]) => void // [TL, TR, BR, BL]
}

const HANDLE_RADIUS = 10
const GOLD = "#FFD740"

// Default quad: centered rectangle, 65% wide × 28% tall, top at 15%
function defaultQuad(): QuadPoint[] {
  return [
    { x: 0.175, y: 0.15 },  // TL
    { x: 0.825, y: 0.15 },  // TR
    { x: 0.825, y: 0.43 },  // BR
    { x: 0.175, y: 0.43 },  // BL
  ]
}

export default function QuadSelector({ imageDataUrl, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const quadRef = useRef<QuadPoint[]>(defaultQuad())
  const draggingRef = useRef<number | null>(null)
  const [, forceRender] = useState(0)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw()
    }
    img.src = imageDataUrl
  }, [imageDataUrl])

  const getCanvasCoords = useCallback((e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }, [])

  function draw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext("2d")!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)

    const quad = quadRef.current
    const pts = quad.map(p => ({ x: p.x * W, y: p.y * H }))

    // Gold fill
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.fillStyle = "rgba(255, 215, 64, 0.30)"
    ctx.fill()

    // Gold stroke
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.stroke()

    // Corner handles
    const labels = ["TL", "TR", "BR", "BL"]
    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = "white"
      ctx.fill()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2.5
      ctx.stroke()

      ctx.fillStyle = "#333"
      ctx.font = "bold 9px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(labels[i], p.x, p.y)
    })
  }

  function findHandle(x: number, y: number, W: number, H: number): number | null {
    const quad = quadRef.current
    for (let i = 0; i < 4; i++) {
      const px = quad[i].x * W
      const py = quad[i].y * H
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (dist <= HANDLE_RADIUS * 1.8) return i
    }
    return null
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onDown(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      const { x, y } = getCanvasCoords(e, canvas!)
      const idx = findHandle(x, y, canvas!.width, canvas!.height)
      draggingRef.current = idx
    }

    function onMove(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      if (draggingRef.current === null) return
      const { x, y } = getCanvasCoords(e, canvas!)
      const W = canvas!.width
      const H = canvas!.height
      quadRef.current[draggingRef.current] = {
        x: Math.max(0, Math.min(1, x / W)),
        y: Math.max(0, Math.min(1, y / H)),
      }
      draw()
    }

    function onUp() {
      if (draggingRef.current !== null) {
        onChange([...quadRef.current])
        forceRender(n => n + 1)
      }
      draggingRef.current = null
    }

    canvas.addEventListener("mousedown", onDown)
    canvas.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    canvas.addEventListener("touchstart", onDown, { passive: false })
    canvas.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onUp)

    return () => {
      canvas.removeEventListener("mousedown", onDown)
      canvas.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      canvas.removeEventListener("touchstart", onDown)
      canvas.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onUp)
    }
  }, [getCanvasCoords, onChange])

  // Re-draw when image loads
  useEffect(() => { draw() })

  function resetQuad() {
    quadRef.current = defaultQuad()
    draw()
    onChange([...quadRef.current])
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="w-full cursor-crosshair touch-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Drag the corner handles to fit the sign area exactly.
        </p>
        <button
          type="button"
          onClick={resetQuad}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
