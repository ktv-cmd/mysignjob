"use client"

import { useRef, useEffect, useState, useCallback } from "react"

export type QuadPoint = { x: number; y: number } // normalized 0–1

interface Props {
  imageDataUrl: string
  onChange: (quad: QuadPoint[]) => void // [TL,TR,BR,BL] flat | [TL,TM,TR,BR,BM,BL] corner
  corner?: boolean
}

const HANDLE_RADIUS = 10
const GOLD = "#FFD740"
const FOLD_COLOR = "#FF8C42"  // orange — fold handles are visually distinct

function defaultQuad(corner: boolean): QuadPoint[] {
  if (corner) return [
    { x: 0.175, y: 0.15 }, // 0 TL
    { x: 0.50,  y: 0.15 }, // 1 TM (fold top)
    { x: 0.825, y: 0.15 }, // 2 TR
    { x: 0.825, y: 0.43 }, // 3 BR
    { x: 0.50,  y: 0.43 }, // 4 BM (fold bottom)
    { x: 0.175, y: 0.43 }, // 5 BL
  ]
  return [
    { x: 0.175, y: 0.15 },
    { x: 0.825, y: 0.15 },
    { x: 0.825, y: 0.43 },
    { x: 0.175, y: 0.43 },
  ]
}

export default function QuadSelector({ imageDataUrl, onChange, corner = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const quadRef = useRef<QuadPoint[]>(defaultQuad(corner))
  const draggingRef = useRef<number | null>(null)
  const prevCornerRef = useRef(corner)
  const [, forceRender] = useState(0)

  // Reset quad when corner mode toggles
  useEffect(() => {
    if (prevCornerRef.current !== corner) {
      quadRef.current = defaultQuad(corner)
      prevCornerRef.current = corner
      draw()
      onChange([...quadRef.current])
      forceRender(n => n + 1)
    }
  })

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

    if (corner && pts.length === 6) {
      // pts: [TL(0), TM(1), TR(2), BR(3), BM(4), BL(5)]
      // Front face: TL, TM, BM, BL
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.lineTo(pts[5].x, pts[5].y)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 215, 64, 0.28)"
      ctx.fill()

      // Side face: TM, TR, BR, BM
      ctx.beginPath()
      ctx.moveTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[2].x, pts[2].y)
      ctx.lineTo(pts[3].x, pts[3].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 160, 64, 0.28)"
      ctx.fill()

      // Full hexagon border
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.stroke()

      // Fold dashed line TM → BM
      ctx.beginPath()
      ctx.moveTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.strokeStyle = FOLD_COLOR
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // "Building corner" label on fold line
      const midX = (pts[1].x + pts[4].x) / 2
      const midY = (pts[1].y + pts[4].y) / 2
      ctx.save()
      ctx.font = "bold 10px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const label = "corner"
      const lw = ctx.measureText(label).width + 8
      ctx.fillStyle = "rgba(0,0,0,0.55)"
      ctx.beginPath()
      ctx.roundRect(midX - lw / 2, midY - 9, lw, 18, 4)
      ctx.fill()
      ctx.fillStyle = FOLD_COLOR
      ctx.fillText(label, midX, midY)
      ctx.restore()

      // Face labels
      const frontCx = (pts[0].x + pts[1].x + pts[4].x + pts[5].x) / 4
      const frontCy = (pts[0].y + pts[1].y + pts[4].y + pts[5].y) / 4
      const sideCx = (pts[1].x + pts[2].x + pts[3].x + pts[4].x) / 4
      const sideCy = (pts[1].y + pts[2].y + pts[3].y + pts[4].y) / 4

      ctx.font = "bold 11px system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(255,255,255,0.9)"
      ctx.fillText("Front", frontCx, frontCy)
      ctx.fillText("Side", sideCx, sideCy)

      // Handles
      const handleColors = [GOLD, FOLD_COLOR, GOLD, GOLD, FOLD_COLOR, GOLD]
      const handleLabels = ["TL", "◆", "TR", "BR", "◆", "BL"]
      pts.forEach((p, i) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()
        ctx.strokeStyle = handleColors[i]
        ctx.lineWidth = 2.5
        ctx.stroke()

        ctx.fillStyle = "#333"
        ctx.font = "bold 9px system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(handleLabels[i], p.x, p.y)
      })
    } else {
      // Normal 4-point mode
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 215, 64, 0.30)"
      ctx.fill()

      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.stroke()

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
  }

  function findHandle(x: number, y: number, W: number, H: number): number | null {
    const quad = quadRef.current
    for (let i = 0; i < quad.length; i++) {
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

  useEffect(() => { draw() })

  function resetQuad() {
    quadRef.current = defaultQuad(corner)
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
          {corner
            ? "Drag the orange ◆ handles to the building's corner edge, then fit each face."
            : "Drag the corner handles to fit the sign area exactly."}
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
