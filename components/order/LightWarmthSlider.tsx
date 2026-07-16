"use client"

import { useRef, useState } from "react"

// Standard LED color-temperature bins sign shops actually stock — matches the
// physical sample wheels used on showroom counters, so clients pick from the
// same real values a fabricator would quote against (not an abstract 0-100 scale).
export const KELVIN_STOPS = [
  { k: 2700, hex: "#FF8A3D" },
  { k: 4000, hex: "#FFC08A" },
  { k: 4500, hex: "#FFD1A3" },
  { k: 5000, hex: "#FFE0C2" },
  { k: 6000, hex: "#FFF3EF" },
  { k: 8000, hex: "#D6E1FF" },
  { k: 10000, hex: "#C2D2FF" },
  { k: 12000, hex: "#AFC4FF" },
] as const

export const DEFAULT_LIGHT_WARMTH_K = 6000

interface LightWarmthSliderProps {
  value: number
  onChange: (kelvin: number) => void
}

export default function LightWarmthSlider({ value, onChange }: LightWarmthSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const selectedIdx = Math.max(0, KELVIN_STOPS.findIndex(s => s.k === value))
  const displayIdx = hoverIdx ?? selectedIdx
  const displayStop = KELVIN_STOPS[displayIdx]!

  // Arrow-key repeats can fire faster than the parent re-renders and passes
  // the new `value` back down, so reading `selectedIdx` (derived from the
  // last-rendered prop) inside onKeyDown would collapse rapid presses into a
  // single step. This ref advances synchronously on every keydown instead.
  const idxRef = useRef(selectedIdx)
  idxRef.current = selectedIdx

  const idxFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return selectedIdx
    const t = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(KELVIN_STOPS.length - 1, Math.round(t * (KELVIN_STOPS.length - 1))))
  }

  const commitFromClientX = (clientX: number) => {
    onChange(KELVIN_STOPS[idxFromClientX(clientX)]!.k)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-1.5">
        <div
          className="w-14 h-14 rounded-full flex-shrink-0 border border-white/10"
          style={{
            background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${displayStop.hex} 45%, ${displayStop.hex} 100%)`,
            boxShadow: `0 0 16px 4px ${displayStop.hex}`,
          }}
          aria-hidden="true"
        />
        <div className="flex-1 px-2.5">
          <div
            ref={trackRef}
            className="relative h-3.5 rounded-full border border-white/10 cursor-pointer"
            style={{ background: `linear-gradient(to right, ${KELVIN_STOPS.map(s => s.hex).join(", ")})` }}
            onPointerMove={e => { if (!dragging) setHoverIdx(idxFromClientX(e.clientX)) }}
            onPointerLeave={() => setHoverIdx(null)}
            onClick={e => commitFromClientX(e.clientX)}
          >
            <div
              role="slider"
              tabIndex={0}
              aria-label="Light warmth"
              aria-valuemin={KELVIN_STOPS[0]!.k}
              aria-valuemax={KELVIN_STOPS[KELVIN_STOPS.length - 1]!.k}
              aria-valuenow={value}
              aria-valuetext={`${value.toLocaleString()}K`}
              className="absolute top-1/2 w-5 h-5 rounded-full bg-zinc-900 border-2 border-white -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: `${(selectedIdx / (KELVIN_STOPS.length - 1)) * 100}%` }}
              onPointerDown={e => {
                e.stopPropagation()
                e.preventDefault()
                setDragging(true)
                const move = (ev: PointerEvent) => { commitFromClientX(ev.clientX); setHoverIdx(idxFromClientX(ev.clientX)) }
                const up = () => {
                  setDragging(false)
                  setHoverIdx(null)
                  window.removeEventListener("pointermove", move)
                  window.removeEventListener("pointerup", up)
                }
                window.addEventListener("pointermove", move)
                window.addEventListener("pointerup", up)
              }}
              onKeyDown={e => {
                if (e.key === "ArrowLeft" && idxRef.current > 0) {
                  idxRef.current -= 1
                  onChange(KELVIN_STOPS[idxRef.current]!.k)
                }
                if (e.key === "ArrowRight" && idxRef.current < KELVIN_STOPS.length - 1) {
                  idxRef.current += 1
                  onChange(KELVIN_STOPS[idxRef.current]!.k)
                }
              }}
            />
          </div>
          <div className="relative h-4 mt-1.5">
            {KELVIN_STOPS.map((s, i) => (
              <span
                key={s.k}
                className={`absolute top-0 -translate-x-1/2 text-[10px] whitespace-nowrap ${
                  i === displayIdx ? "text-white font-medium" : "text-white/50"
                }`}
                style={{ left: `${(i / (KELVIN_STOPS.length - 1)) * 100}%` }}
              >
                {s.k.toLocaleString()}K
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
