"use client"

import { useSyncExternalStore } from "react"

// Apple's Measure app has no documented URL scheme, so this is instructional
// copy only — never wire up a `measure://` link or any other deep link here.
// A dead link is worse than no link: Safari would just do nothing and the
// user would be left standing outside wondering if they broke something.
//
// This is offered as a nudge on the size-question step because a tape
// measure (or Measure, which is the tape measure most people already have
// in their pocket) beats anything we can compute from a photo. It's only
// worth showing to someone who can actually act on it right now, which is
// why it's gated to iOS.

// window/navigator don't exist during server render, and reading them in
// render or in useState's initializer would make the server-rendered markup
// disagree with the client's first render — a hydration mismatch. Following
// the pattern in PhoneHandoff.tsx: useSyncExternalStore's getServerSnapshot
// is used purely as an escape hatch to render nothing until the client can
// check, since there's nothing here that actually changes over time to
// subscribe to.
function noopSubscribe() {
  return () => {}
}

// iPadOS has reported its Safari UA as "Macintosh" since iPadOS 13, which is
// how Apple keeps desktop sites from serving iPads a crippled mobile layout.
// That means a plain UA sniff for "iPad" misses most iPads in the wild. The
// documented workaround is to pair the UA check with maxTouchPoints: real
// Macs report 0 (no touchscreen), while a touch-capable "Macintosh" is an
// iPad wearing a disguise.
function getIsIOS() {
  const ua = window.navigator.userAgent
  const isClassicIOS = /iPhone|iPod|iPad/.test(ua)
  const isDisguisedIPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return isClassicIOS || isDisguisedIPad
}

function getIsIOSServerSnapshot() {
  return false
}

interface MeasureAppNudgeProps {
  onChooseMeasure: () => void
}

export default function MeasureAppNudge({ onChooseMeasure }: MeasureAppNudgeProps) {
  const isIOS = useSyncExternalStore(noopSubscribe, getIsIOS, getIsIOSServerSnapshot)

  if (!isIOS) return null

  return (
    <div className="rounded-xl border border-border p-4 bg-accent/5">
      <p className="text-sm font-semibold">Have your phone on you at the storefront?</p>
      <p className="text-xs text-muted-foreground mt-1">
        Open the Measure app that&apos;s already on your iPhone, measure the width and height of your sign area, then come back and type in the two numbers. It only takes a minute and gives us the most accurate price.
      </p>
      <button
        type="button"
        onClick={onChooseMeasure}
        className="mt-3 text-sm font-semibold text-accent hover:underline"
      >
        Got the numbers — let me type them in
      </button>
    </div>
  )
}
