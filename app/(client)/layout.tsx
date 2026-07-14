import ClientNav from "@/components/client/ClientNav"

// No group-level auth guard here on purpose: /order/new must stay publicly
// reachable for the guest ordering flow (anonymous sign-in happens client-side
// on that page). Every authenticated-only route in this group — dashboard,
// onboarding/*, order/[id] — enforces its own getUser()/redirect guard.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ClientNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
