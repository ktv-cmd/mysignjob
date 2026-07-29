"use client"

import { useActionState } from "react"
import { updateProfile, type UpdateProfileState } from "@/app/actions/account"
import { signOut } from "@/app/actions/auth"
import { Field, SubmitButton } from "@/components/auth/AuthUI"

export default function AccountForm({
  email, fullName, phone, role,
}: {
  email: string
  fullName: string | null
  phone: string | null
  role: string
}) {
  const [state, action, pending] = useActionState<UpdateProfileState, FormData>(updateProfile, null)

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-4 bg-background border border-border rounded-2xl p-6">
        <div>
          <h2 className="text-lg font-semibold">Your details</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {role === "sc" ? "Sign company contact" : "Client"} account
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            disabled
            className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground mt-1 block">
            Contact support to change the email on your account.
          </span>
        </label>

        <Field label="Full name" name="full_name" type="text" defaultValue={fullName ?? ""} required maxLength={120} />
        <Field label="Phone" name="phone" type="tel" defaultValue={phone ?? ""} placeholder="e.g. (555) 123-4567" />

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-green-700">Saved.</p>}

        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </form>

      <form action={signOut}>
        <button
          type="submit"
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Log out
        </button>
      </form>
    </div>
  )
}
