"use client"

import { useSyncExternalStore } from "react"
import { QRCodeSVG } from "qrcode.react"
import { CAPTURE_QUERY_FLAG } from "@/lib/order-capture"

// Someone on a laptop physically cannot photograph their own storefront: the
// webcam points the wrong way and they're usually not standing outside anyway.
// Rather than leaving them with nothing but "upload a file you took earlier",
// this hands the flow to the device that does have a usable camera.
//
// Deliberately stateless: the photo is the first step, and the order carries no
// server-side state until the AI-preview gate signs the guest in, so there is
// nothing to migrate between devices — the phone simply starts the flow. That
// keeps this a pure client component with no tokens, table or sync to secure.

// Built from window.location, whose origin varies by environment (localhost,
// preview deploys, production) and isn't knowable while rendering on the
// server. The value never changes once the page has loaded, so there's
// nothing to subscribe to — useSyncExternalStore is used purely for its
// getServerSnapshot escape hatch, which is what keeps this off the server
// render without tripping the "no setState in an effect body" lint rule.
function noopSubscribe() {
  return () => {}
}

function getHandoffUrl() {
  const target = new URL("/order/new", window.location.origin)
  target.searchParams.set(CAPTURE_QUERY_FLAG, "1")
  return target.toString()
}

function getHandoffUrlServerSnapshot() {
  return null
}

// Only offered to pointer devices. On a phone or tablet the "Use my camera
// now" option right above is strictly better, so a QR there is pure noise.
// The server snapshot renders as "not a pointer device" so the QR card never
// flashes into existence on mobile before matchMedia has had a chance to run.
function subscribeToPointerType(onChange: () => void) {
  const mq = window.matchMedia("(pointer: coarse)")
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function getIsPointerDevice() {
  return !window.matchMedia("(pointer: coarse)").matches
}

function getIsPointerDeviceServerSnapshot() {
  return false
}

export default function PhoneHandoff() {
  const url = useSyncExternalStore(noopSubscribe, getHandoffUrl, getHandoffUrlServerSnapshot)
  const isPointerDevice = useSyncExternalStore(
    subscribeToPointerType,
    getIsPointerDevice,
    getIsPointerDeviceServerSnapshot
  )

  if (!isPointerDevice || !url) return null

  return (
    <div className="rounded-xl border border-border p-4 flex items-start gap-4">
      {/* Fixed light background regardless of theme — a QR inverted by dark
          mode won't scan on most phone cameras. */}
      <div className="rounded-lg bg-white p-2 flex-shrink-0">
        <QRCodeSVG value={url} size={96} bgColor="#ffffff" fgColor="#000000" level="M" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Take it with your phone</p>
        <p className="text-xs text-muted-foreground mt-1">
          Scan this with your phone&apos;s camera to open this page there, then shoot your storefront with the guided camera. You&apos;ll finish the order on your phone.
        </p>
      </div>
    </div>
  )
}
