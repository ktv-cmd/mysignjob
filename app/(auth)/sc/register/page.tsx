"use client"

import { useActionState } from "react"
import Link from "next/link"
import { signUpSC, type AuthState } from "@/app/actions/auth"
import { AuthShell, Field, SubmitButton } from "@/components/auth/AuthUI"

export default function SCRegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpSC, null)

  return (
    <AuthShell title="Join as a sign company" subtitle="Apply to receive jobs on My Sign Job">
      <form action={action} className="space-y-4">
        <Field label="Company name" name="company_name" required />
        <Field label="Your name" name="full_name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton pending={pending}>Apply</SubmitButton>
      </form>
      <p className="text-sm text-muted-foreground text-center mt-6">
        Already registered?{" "}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  )
}
