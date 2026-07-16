"use client"

import { useState } from "react"

interface PictureChoiceProps {
  imageSrc: string
  imageAlt?: string
  nightImageSrc?: string
  label: string
  description?: string
  badge?: string
  badgeTone?: string
  selected: boolean
  onClick: () => void
  recommended?: boolean
  compact?: boolean
  /** Show the night photo first instead of the day photo — use when the night
   *  view is what actually differentiates this choice (e.g. lighting style). */
  defaultNight?: boolean
}

export default function PictureChoice({
  imageSrc,
  imageAlt,
  nightImageSrc,
  label,
  description,
  badge,
  badgeTone,
  selected,
  onClick,
  recommended,
  compact,
  defaultNight,
}: PictureChoiceProps) {
  const [showNight, setShowNight] = useState(!!defaultNight)
  const activeSrc = nightImageSrc ? (showNight ? nightImageSrc : imageSrc) : imageSrc
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set())
  const hasError = failedSrcs.has(activeSrc)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={`relative text-left rounded-xl border-2 overflow-hidden transition-all cursor-pointer
        ${selected ? "border-accent shadow-sm" : "border-border hover:border-accent/40"}`}
    >
      <div className={`bg-muted overflow-hidden relative aspect-square`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeSrc}
          alt={imageAlt ?? label}
          className="w-full h-full object-cover"
          style={{ display: hasError ? "none" : undefined }}
          onError={() => {
            // Track by the same relative path used for lookup — the DOM's
            // resolved absolute URL would never match activeSrc.
            setFailedSrcs(prev => new Set(prev).add(activeSrc))
          }}
        />
        <div
          className={`${hasError ? "flex" : "hidden"} absolute inset-0 items-center justify-center bg-muted`}
          aria-hidden="true"
        >
          <span className="text-3xl text-muted-foreground/25">📷</span>
        </div>
        {nightImageSrc && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setShowNight(prev => !prev)
            }}
            className="absolute top-1 left-1 bg-black/50 hover:bg-black/70 text-white rounded-full w-11 h-11 flex items-center justify-center text-xs shadow"
            aria-label={showNight ? "Show day photo" : "Show night photo"}
          >
            {showNight ? "☀️" : "🌙"}
          </button>
        )}
      </div>

      <div className="p-2.5">
        <div className="flex items-start gap-1.5 mb-0.5 flex-wrap">
          <p className={`text-xs font-semibold leading-tight ${selected ? "text-accent" : ""}`}>{label}</p>
          {recommended && (
            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 leading-tight flex-shrink-0">
              Recommended
            </span>
          )}
        </div>
        {description && !compact && (
          <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
        )}
        {badge && badgeTone && (
          <span className={`mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeTone}`}>
            {badge}
          </span>
        )}
      </div>

      {selected && (
        <span className="absolute top-2 right-2 bg-accent text-accent-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow">
          ✓
        </span>
      )}
    </div>
  )
}
