import { connection } from "next/server"
import OrderNewClient from "./OrderNewClient"

// This route has no server-side data reads, so Next.js statically prerenders
// it by default — but a statically-prerendered page has no per-request CSP
// nonce to attach to its hydration scripts. proxy.ts's strict-dynamic CSP
// then blocks every one of them: the page paints, but nothing on it works
// (dead upload button, dead forms), with no console error pointing at why.
// This is the same failure class as the CSP incident fixed by moving CSP
// into proxy.ts — that fix only covers pages Next.js already renders
// dynamically. `connection()` forces this one to render dynamically too, so
// it gets a real nonce. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export default async function Page() {
  await connection()
  return <OrderNewClient />
}
