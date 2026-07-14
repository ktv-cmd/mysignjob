"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { resizeImageForAI } from "@/lib/utils"

interface Props {
  onPhoto: (dataUrl: string) => void
}

const TIPS = [
  { icon: "📐", text: "Stand straight in front — tilting the camera more than 15° makes sizing less accurate" },
  { icon: "🚪", text: "Include the entrance door — we use it to calculate your sign's size" },
  { icon: "☀️", text: "Shoot in good light and avoid harsh shadows" },
  { icon: "🏢", text: "Show the full width of your storefront" },
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
    onDropRejected: () => setError("That file isn't supported. Try a JPG, PNG, WEBP, or HEIC photo under 30MB."),
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 30 * 1024 * 1024,
    // Chrome's File System Access picker (showOpenFilePicker) converts the picked
    // handle to a File asynchronously; when that stalls, the dialog closes with no
    // error and no file ever reaches onDrop. Force the plain <input> fallback instead.
    useFsAccessApi: false,
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
            <p className="text-sm text-muted-foreground">Processing your photo…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">📷</div>
            <p className="font-medium">
              {isDragActive ? "Drop your photo here" : "Upload a photo of your storefront"}
            </p>
            <p className="text-sm text-muted-foreground">
              Drag and drop, or tap to choose — JPG, PNG, WEBP, HEIC
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
