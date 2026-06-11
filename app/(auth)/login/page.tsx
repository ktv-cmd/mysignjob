"use client"

import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn, type AuthState } from "@/app/actions/auth"
import { AuthShell, Field, SubmitButton } from "@/components/auth/AuthUI"

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null)
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? ""

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your account">
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton pending={pending}>Log in</SubmitButton>
      </form>
      <p className="text-sm text-muted-foreground text-center mt-6">
        Need an account?{" "}
        <Link href="/register" className="text-accent font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  )
}
