"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { signUpSC, type AuthState } from "@/app/actions/auth"
import { AuthShell, Field, PasswordField, SubmitButton } from "@/components/auth/AuthUI"

export default function SCRegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpSC, null)
  const [matchError, setMatchError] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget
    const password = (form.elements.namedItem("password") as HTMLInputElement).value
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value
    if (password !== confirmPassword) {
      e.preventDefault()
      setMatchError("Passwords do not match.")
      return
    }
    setMatchError("")
  }

  return (
    <AuthShell title="Join as a sign company" subtitle="Apply to receive jobs on Mysignjobs.com">
      <form action={action} onSubmit={handleSubmit} className="space-y-4">
        <Field label="Company name" name="company_name" required />
        <Field label="Your name" name="full_name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <PasswordField label="Password" name="password" autoComplete="new-password" required minLength={8} />
        <PasswordField
          label="Confirm password"
          name="confirm_password"
          autoComplete="new-password"
          required
          minLength={8}
          preventPaste
        />
        {(matchError || state?.error) && (
          <p className="text-sm text-destructive">{matchError || state?.error}</p>
        )}
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
