import Link from "next/link"
import BrandLogo from "@/components/shared/BrandLogo"

export default function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; type?: string }>
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="flex justify-center mb-8">
          <BrandLogo className="h-10 w-auto" priority />
        </Link>
        <div className="relative bg-background border border-border/70 rounded-2xl shadow-soft-lg p-8 overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-9 w-9 mx-auto mb-4"
            style={{ color: "var(--color-brand-indigo)" }}
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="1.5" />
            <path d="M3.5 6.5L12 13l8.5-6.5" />
          </svg>
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We sent a confirmation link to your email address. Click the link to
            activate your account, then come back to log in.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm text-accent font-medium hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
