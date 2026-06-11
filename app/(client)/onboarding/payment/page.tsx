import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import PaymentForm from "@/components/onboarding/PaymentForm"

export default async function PaymentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("agreement_signed_at, payment_method_added")
    .eq("id", user.id)
    .single()

  if (!profile?.agreement_signed_at) redirect("/onboarding/agreement")
  if (profile.payment_method_added) redirect("/dashboard")

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Step 2 of 2</p>
        <h1 className="text-2xl font-bold mt-1">Add a payment method</h1>
        <p className="text-muted-foreground mt-1">
          We securely save your card now. You&apos;re only charged the 50% deposit once a sign
          company is assigned to your order.
        </p>
      </div>
      <PaymentForm />
    </div>
  )
}
