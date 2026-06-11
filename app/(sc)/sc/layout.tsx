import SCNav from "@/components/sc/SCNav"

export default function SCLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SCNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
