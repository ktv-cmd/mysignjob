import ClientNav from "@/components/client/ClientNav"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ClientNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
