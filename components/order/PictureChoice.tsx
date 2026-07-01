"use client"

interface PictureChoiceProps {
  imageSrc: string
  imageAlt?: string
  label: string
  description?: string
  badge?: string
  badgeTone?: string
  selected: boolean
  onClick: () => void
  recommended?: boolean
  compact?: boolean
}

export default function PictureChoice({
  imageSrc,
  imageAlt,
  label,
  description,
  badge,
  badgeTone,
  selected,
  onClick,
  recommended,
  compact,
}: PictureChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl border-2 overflow-hidden transition-all
        ${selected ? "border-accent shadow-sm" : "border-border hover:border-accent/40"}`}
    >
      <div className={`bg-muted overflow-hidden relative aspect-square`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={imageAlt ?? label}
          className="w-full h-full object-cover"
          onError={e => {
            const img = e.currentTarget as HTMLImageElement
            img.style.display = "none"
            const ph = img.nextElementSibling as HTMLElement | null
            if (ph) ph.style.display = "flex"
          }}
        />
        <div
          className="hidden absolute inset-0 items-center justify-center bg-muted"
          aria-hidden="true"
        >
          <span className="text-3xl text-muted-foreground/25">📷</span>
        </div>
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
    </button>
  )
}
