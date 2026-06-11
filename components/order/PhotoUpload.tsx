"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { resizeImageForAI } from "@/lib/utils"

interface Props {
  onPhoto: (dataUrl: string) => void
}

const TIPS = [
  { icon: "📐", text: "Stand straight in front — avoid angles over 15°" },
  { icon: "🚪", text: "Include the entrance door for accurate sizing" },
  { icon: "☀️", text: "Take in good light — avoid harsh shadows" },
  { icon: "🏢", text: "Capture the full facade width" },
]

export default function PhotoUpload({ onPhoto }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const dataUrl = await resizeImageForAI(file, 1920, 0.85)
      setPreview(dataUrl)
      onPhoto(dataUrl)
    } catch {
      setError("Could not process this image. Try a different file.")
    } finally {
      setLoading(false)
    }
  }, [onPhoto])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 30 * 1024 * 1024,
  })

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Storefront" className="w-full" />
        </div>
        <button
          type="button"
          onClick={() => { setPreview(null) }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Use a different photo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/30"}`}
      >
        <input {...getInputProps()} />
        {loading ? (
          <div className="space-y-2">
            <div className="text-3xl animate-pulse">🖼️</div>
            <p className="text-sm text-muted-foreground">Processing image…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">📷</div>
            <p className="font-medium">
              {isDragActive ? "Drop your photo here" : "Upload a storefront photo"}
            </p>
            <p className="text-sm text-muted-foreground">
              Drag & drop or click to browse — JPG, PNG, WEBP, HEIC
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        {TIPS.map(tip => (
          <div key={tip.text} className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
            <span className="text-base flex-shrink-0">{tip.icon}</span>
            <p className="text-xs text-muted-foreground leading-snug">{tip.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
