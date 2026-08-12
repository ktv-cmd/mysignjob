import Link from "next/link"
import BrandLogo from "@/components/shared/BrandLogo"

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex justify-center mb-8">
          <BrandLogo className="h-10 w-auto" priority />
        </Link>
        <div className="relative bg-background border border-border/70 rounded-2xl shadow-soft-lg p-8 overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          />
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({
  label,
  name,
  type = "text",
  ...rest
}: { label: string; name: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        {...rest}
      />
    </label>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full w-full text-accent-foreground py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      style={{ backgroundImage: "var(--gradient-brand)" }}
    >
      {pending ? "Please wait…" : children}
    </button>
  )
}
