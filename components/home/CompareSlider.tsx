"use client"

import { useRef, useState } from "react"

const MIN_PCT = 6
const MAX_PCT = 94

// Draggable before/after reveal — "before" is an illustrative placeholder
// (this is where the client's own storefront photo will go), "after" is a
// real example render, so nothing here is a fabricated customer result.
export default function CompareSlider({ afterSrc, afterAlt }: { afterSrc: string; afterAlt: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [pct, setPct] = useState(50)

  function setFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * 100
    setPct(Math.max(MIN_PCT, Math.min(MAX_PCT, raw)))
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-3 rounded-2xl opacity-50 blur-2xl"
        style={{ backgroundImage: "var(--gradient-brand)" }}
      />
      <div
        ref={containerRef}
        className="relative aspect-square overflow-hidden rounded-2xl cursor-ew-resize select-none touch-none shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        onPointerDown={(e) => { draggingRef.current = true; setFromClientX(e.clientX) }}
        onPointerMove={(e) => { if (draggingRef.current) setFromClientX(e.clientX) }}
        onPointerUp={() => { draggingRef.current = false }}
        onPointerLeave={() => { draggingRef.current = false }}
      >
        {/* After — full-bleed real example render */}
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={afterSrc} alt={afterAlt} className="h-full w-full object-cover" draggable={false} />
        </div>

        {/* Before — clipped placeholder, revealed as the handle drags right */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              backgroundColor: "#cfd3d6",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0 2px, transparent 2px 34px), repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 84px)",
              backgroundPosition: "0 0, 42px 17px",
              filter: "saturate(0.25) brightness(0.98)",
            }}
          >
            <div className="rounded-2xl border-2 border-dashed border-black/35 bg-white/55 px-5 py-6 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mx-auto mb-2 h-6.5 w-6.5 text-[#12151b]">
                <rect x="3" y="6" width="18" height="13" rx="1.5" />
                <path d="M8 6l1.5-2.5h5L16 6" />
                <circle cx="12" cy="12.5" r="3.2" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#3a3f47]">Your storefront photo</span>
            </div>
          </div>
        </div>

        <div className="absolute left-3.5 top-3.5 z-10 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Before
        </div>
        <div className="absolute right-3.5 top-3.5 z-10 flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#12151b]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-2.5 w-2.5">
            <path d="M4 12l5 5L20 6" />
          </svg>
          AI Preview
        </div>

        <div
          aria-hidden
          className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          style={{ left: `${pct}%` }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#12151b" strokeWidth="2" className="h-4.5 w-4.5">
            <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
          </svg>
        </div>
      </div>
    </div>
  )
}
