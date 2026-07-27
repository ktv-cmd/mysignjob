"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { resizeImageForAI } from "@/lib/utils"

interface Props {
  onPhoto: (dataUrl: string) => void
}

function TipIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-shrink-0 text-accent">
      {children}
    </svg>
  )
}

const TIPS = [
  {
    icon: <path d="M4 19h16M4 19L14 5l2 4M13 19l4-9" />,
    text: "Stand straight in front — tilting the camera more than 15° makes sizing less accurate",
  },
  {
    icon: <path d="M6 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M6 21h10M6 21H4M16 21h2M10 12h.01" />,
    text: "Include the entrance door — we use it to calculate your sign's size",
  },
  {
    icon: <><circle cx="12" cy="12" r="3.4" /><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
    text: "Shoot in good light and avoid harsh shadows",
  },
  {
    icon: <path d="M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6" />,
    text: "Show the full width of your storefront",
  },
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
    // A resize is already in flight — ignore further drops until it resolves,
    // otherwise two concurrent resizes race and whichever resolves last wins,
    // not necessarily the file the user most recently dropped.
    disabled: loading,
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
          className="py-3 text-xs text-muted-foreground hover:text-foreground underline"
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
          <div className="space-y-3">
            <div className="mx-auto h-9 w-9 rounded-full border-2 border-accent/25 border-t-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Processing your photo…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <svg viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M3 7h3.5l1.2-2h6.6l1.2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H3a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3 7Z" />
                <circle cx="11" cy="13" r="3.4" />
              </svg>
            </div>
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
            <TipIcon>{tip.icon}</TipIcon>
            <p className="text-xs text-muted-foreground leading-snug">{tip.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
