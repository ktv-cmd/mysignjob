import { connection } from "next/server"
import OrderNewClient from "./OrderNewClient"
import { CAPTURE_QUERY_FLAG } from "@/lib/order-capture"

// This route has no server-side data reads, so Next.js statically prerenders
// it by default — but a statically-prerendered page has no per-request CSP
// nonce to attach to its hydration scripts. proxy.ts's strict-dynamic CSP
// then blocks every one of them: the page paints, but nothing on it works
// (dead upload button, dead forms), with no console error pointing at why.
// This is the same failure class as the CSP incident fixed by moving CSP
// into proxy.ts — that fix only covers pages Next.js already renders
// dynamically. `connection()` forces this one to render dynamically too, so
// it gets a real nonce. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  // The desktop QR hand-off (components/order/PhoneHandoff.tsx) links here with
  // ?capture=1 so the phone opens straight into the guided camera. Resolved
  // here rather than from window.location in the client so the very first
  // render already has the right mode — no post-hydration flip, and no
  // hydration mismatch from reading the URL during client state init.
  const capture = (await searchParams)[CAPTURE_QUERY_FLAG]
  return <OrderNewClient startInCaptureMode={capture === "1"} />
}
