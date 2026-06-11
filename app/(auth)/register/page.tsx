"use client"

import { useActionState } from "react"
import Link from "next/link"
import { signUpClient, type AuthState } from "@/app/actions/auth"
import { AuthShell, Field, SubmitButton } from "@/components/auth/AuthUI"

export default function RegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpClient, null)

  return (
    <AuthShell title="Get started" subtitle="Create your account to order a sign">
      <form action={action} className="space-y-4">
        <Field label="Full name" name="full_name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>
      <p className="text-sm text-muted-foreground text-center mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Log in
        </Link>
      </p>
      <p className="text-sm text-muted-foreground text-center mt-2">
        Are you a sign company?{" "}
        <Link href="/sc/register" className="text-accent font-medium hover:underline">
          Apply here
        </Link>
      </p>
    </AuthShell>
  )
}
