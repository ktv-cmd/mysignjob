import Link from "next/link"
import Image from "next/image"

export default function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; type?: string }>
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="flex justify-center mb-8">
          <Image src="/brand/logo-horizontal.png" alt="Mysignjobs.com" width={160} height={47} className="h-10 w-auto" priority />
        </Link>
        <div className="bg-background border border-border rounded-2xl p-8">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
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
