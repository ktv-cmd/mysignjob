"use client"

import { useState } from "react"
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

export function PasswordField({
  label,
  name,
  preventPaste,
  ...rest
}: {
  label: string
  name: string
  preventPaste?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false)

  const blockClipboard = preventPaste
    ? (e: React.ClipboardEvent<HTMLInputElement> | React.DragEvent<HTMLInputElement>) => e.preventDefault()
    : undefined

  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="relative mt-1">
        <input
          name={name}
          type={visible ? "text" : "password"}
          className="w-full rounded-2xl border border-border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          onPaste={blockClipboard}
          onDrop={blockClipboard}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        >
          {visible ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3.1 3.9M6.6 6.6C3.4 8.6 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.4-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
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
