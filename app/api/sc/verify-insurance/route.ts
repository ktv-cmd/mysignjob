import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 30

interface InsuranceExtracted {
  insurer: string | null
  policy_number: string | null
  named_insured: string | null
  gl_per_occurrence_cents: number | null
  gl_aggregate_cents: number | null
  expires_at: string | null  // ISO date string
  has_workers_comp: boolean
  confidence: number
  reasoning: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 })

  const { data: sc } = await supabase
    .from("sc_companies")
    .select("id, name, city, state")
    .eq("user_id", user.id)
    .single()

  if (!sc) return NextResponse.json({ error: "SC profile not found." }, { status: 404 })

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "pdf"
  const path = `sc-insurance/${sc.id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path)

  // ── Gemini Vision OCR ──────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 })

  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey })

  const mimeType = file.type === "application/pdf" ? "application/pdf" : "image/jpeg"
  const base64 = buffer.toString("base64")

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        {
          text: `You are extracting data from a Certificate of Insurance (COI) document for a sign installation company.

Extract the following fields and return ONLY a raw JSON object:
{
  "insurer": "<insurance company name or null>",
  "policy_number": "<policy number or null>",
  "named_insured": "<name of the insured business on this certificate, or null>",
  "gl_per_occurrence": <general liability per-occurrence limit as a number in dollars, or null>,
  "gl_aggregate": <general liability aggregate limit as a number in dollars, or null>,
  "expires_at": "<policy expiration date as YYYY-MM-DD, or null>",
  "has_workers_comp": <true if a workers compensation policy is listed on this certificate, false otherwise>,
  "confidence": <your confidence in this extraction from 0.0 to 1.0>,
  "reasoning": "<one sentence explaining your confidence level>"
}

Return ONLY the raw JSON object, no markdown, no explanation.`,
        },
      ],
    }],
    config: { responseMimeType: "application/json", temperature: 0 },
  })

  let extracted: InsuranceExtracted
  try {
    const raw = JSON.parse(response.text ?? "{}")
    extracted = {
      insurer: raw.insurer ?? null,
      policy_number: raw.policy_number ?? null,
      named_insured: raw.named_insured ?? null,
      gl_per_occurrence_cents: raw.gl_per_occurrence != null ? Math.round(raw.gl_per_occurrence * 100) : null,
      gl_aggregate_cents: raw.gl_aggregate != null ? Math.round(raw.gl_aggregate * 100) : null,
      expires_at: raw.expires_at ?? null,
      has_workers_comp: Boolean(raw.has_workers_comp),
      confidence: raw.confidence ?? 0.5,
      reasoning: raw.reasoning ?? "",
    }
  } catch {
    return NextResponse.json({ error: "Could not parse insurance document. Please upload a clearer image." }, { status: 422 })
  }

  // ── Rule checks ─────────────────────────────────────────────────────────────
  // Look up jurisdiction requirement for this SC's location
  const jurisdictionKey = sc.city && sc.state
    ? `${sc.state.toLowerCase()}_${sc.city.toLowerCase().replace(/\s+/g, "")}`
    : sc.state?.toLowerCase() ?? "default"

  const { data: reqRow } = await supabase
    .from("jurisdiction_insurance_requirements")
    .select("required_gl_cents, require_workers_comp, label")
    .or(`jurisdiction.eq.${jurisdictionKey},jurisdiction.eq.${sc.state?.toLowerCase() ?? "none"},jurisdiction.eq.default`)
    .order("jurisdiction", { ascending: false })  // city-level (longer slug) sorts first
    .limit(1)
    .single()

  const requiredGl = reqRow?.required_gl_cents ?? 100000000  // fallback $1M
  const requireWc = reqRow?.require_workers_comp ?? false

  const issues: string[] = []

  // Named insured fuzzy match (simple: check if SC name words appear in named_insured)
  if (extracted.named_insured) {
    const scWords = sc.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
    const insuredLower = extracted.named_insured.toLowerCase()
    const matchCount = scWords.filter((w: string) => insuredLower.includes(w)).length
    if (matchCount === 0) {
      issues.push(`Named insured "${extracted.named_insured}" does not match company name "${sc.name}".`)
    }
  } else {
    issues.push("Could not read named insured from certificate.")
  }

  if (!extracted.gl_per_occurrence_cents) {
    issues.push("Could not read GL per-occurrence limit.")
  } else if (extracted.gl_per_occurrence_cents < requiredGl) {
    const required = (requiredGl / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    const actual = (extracted.gl_per_occurrence_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    issues.push(`GL per-occurrence ${actual} is below the required ${required} for your location.`)
  }

  if (extracted.expires_at) {
    const expiresDate = new Date(extracted.expires_at)
    if (expiresDate <= new Date()) {
      issues.push(`Policy expired on ${extracted.expires_at}.`)
    }
  } else {
    issues.push("Could not read policy expiration date.")
  }

  if (requireWc && !extracted.has_workers_comp) {
    issues.push("Workers' Compensation coverage is required in your state and was not found on this certificate.")
  }

  const verified = issues.length === 0 && extracted.confidence >= 0.6

  // Save results
  await supabase
    .from("sc_companies")
    .update({
      insurance_doc_url: publicUrl,
      insurance_extracted: { ...extracted, issues, jurisdiction_label: reqRow?.label ?? "Default" },
      insurance_gl_cents: extracted.gl_per_occurrence_cents,
      insurance_expires_at: extracted.expires_at ? new Date(extracted.expires_at).toISOString() : null,
      insurance_verified: verified,
      insurance_verified_at: verified ? new Date().toISOString() : null,
      insurance_notes: issues.length > 0 ? issues.join(" ") : null,
    })
    .eq("user_id", user.id)

  // Trigger auto status-flip if verified
  if (verified) {
    const { data: updatedSC } = await supabase
      .from("sc_companies")
      .select("agreement_signed_at, stripe_onboarding_complete")
      .eq("user_id", user.id)
      .single()

    if (updatedSC?.agreement_signed_at && updatedSC.stripe_onboarding_complete) {
      await supabase.from("sc_companies").update({ status: "active" }).eq("user_id", user.id)
    }
  }

  return NextResponse.json({
    verified,
    extracted,
    issues,
    jurisdiction: reqRow?.label ?? "Default",
    required_gl_cents: requiredGl,
  })
}
