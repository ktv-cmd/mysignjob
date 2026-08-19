"use client"

import { useActionState } from "react"
import { adminSignIn, type AuthState } from "@/app/actions/auth"
import { AuthShell, Field, SubmitButton } from "@/components/auth/AuthUI"

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(adminSignIn, null)

  return (
    <AuthShell title="Admin sign in" subtitle="Mysignjobs.com internal access">
      <form action={action} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <SubmitButton pending={pending}>Log in</SubmitButton>
      </form>
    </AuthShell>
  )
}
