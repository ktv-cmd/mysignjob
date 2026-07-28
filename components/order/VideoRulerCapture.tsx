"use client"

import { useEffect, useRef, useState } from "react"

interface Props {
  onCapture: (dataUrl: string) => void
  onCancel: () => void
}

// Same width/quality convention as resizeImageForAI (lib/utils/index.ts) —
// this just captures a single video frame instead of resizing an uploaded
// file, so the two paths hand PhotoUpload's downstream consumers (QuadSelector,
// the AI preview pipeline) an equivalent data URL either way.
const CAPTURE_MAX_WIDTH = 1920
const CAPTURE_QUALITY = 0.85

type Status = "requesting" | "streaming" | "error"

function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
}

// Guided live-camera capture for people standing at the storefront right
// now — a faster, better-framed alternative to "take a photo with your
// camera app, then upload it." This component only replaces photo
// *acquisition*: it ends by handing back a data URL exactly like PhotoUpload
// does, after which the existing QuadSelector + computeSignDimensions
// measurement pipeline runs completely unchanged (see lib/sign-geometry.ts —
// the reference object and sign quad must live in the same photo, so a
// separately-captured second frame would silently corrupt the scale).
export default function VideoRulerCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Synchronous guard against a double-tap on "Capture photo" firing
  // onCapture twice before the parent has a chance to unmount this
  // component — disabled={status !== "streaming"} alone isn't enough since
  // two taps faster than a paint frame can both land before the disabled
  // attribute takes effect.
  const capturedRef = useRef(false)
  // Checked up front (a plain browser-global read, not a ref) so the
  // "unsupported" case is reflected in the initial render state rather than
  // a synchronous setState from inside the effect below (React flags
  // synchronous in-effect setState as a footgun — it can cascade into an
  // extra render pass).
  const supported = isCameraSupported()
  const [status, setStatus] = useState<Status>(supported ? "requesting" : "error")
  const [errorMessage, setErrorMessage] = useState<string | null>(
    supported ? null : "Your browser doesn't support camera capture here. Please upload a photo instead."
  )

  useEffect(() => {
    if (!supported) return
    let cancelled = false

    navigator.mediaDevices
      // Rear camera — the client is photographing their own storefront from
      // outside, so the front (selfie) camera would be the wrong choice.
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus("streaming")
        // Surface a camera disconnect mid-session (device unplugged,
        // permission revoked after grant, app backgrounded on some mobile
        // browsers) instead of leaving the video frozen on its last frame
        // with a "Capture photo" button that would just grab stale pixels.
        stream.getVideoTracks().forEach(track => {
          track.addEventListener("ended", () => {
            if (cancelled || capturedRef.current) return
            setStatus("error")
            setErrorMessage("The camera connection was lost. Please upload a photo instead.")
          })
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus("error")
        const name = err instanceof DOMException ? err.name : ""
        setErrorMessage(
          name === "NotAllowedError"
            ? "Camera access was denied. Allow camera access in your browser settings, or upload a photo instead."
            : name === "NotFoundError"
            ? "No camera was found on this device. Please upload a photo instead."
            : "Couldn't start the camera. Please upload a photo instead."
        )
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [supported])

  function capture() {
    if (capturedRef.current) return
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return
    capturedRef.current = true

    const canvas = document.createElement("canvas")
    let { videoWidth: width, videoHeight: height } = video
    if (width > CAPTURE_MAX_WIDTH) {
      height = Math.round((height * CAPTURE_MAX_WIDTH) / width)
      width = CAPTURE_MAX_WIDTH
    }
    canvas.width = width
    canvas.height = height
    canvas.getContext("2d")!.drawImage(video, 0, 0, width, height)

    streamRef.current?.getTracks().forEach(t => t.stop())
    onCapture(canvas.toDataURL("image/jpeg", CAPTURE_QUALITY))
  }

  if (status === "error") {
    return (
      <div className="space-y-4 rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-accent underline">
          Upload a photo instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden border border-border bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
        {status === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="h-9 w-9 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}
        {status === "streaming" && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
            <p className="text-xs text-white/90 leading-snug">
              Stand straight in front, include the whole entrance door, and show the full width of your storefront.
            </p>
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50"
        >
          Upload a photo instead
        </button>
        <button
          type="button"
          onClick={capture}
          disabled={status !== "streaming"}
          className="flex-2 flex-1 bg-accent text-accent-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Capture photo
        </button>
      </div>
    </div>
  )
}
