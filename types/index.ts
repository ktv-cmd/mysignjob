// ─── Users ───────────────────────────────────────────────────────────────────

export type UserRole = "client" | "sc" | "admin"

export interface User {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  stripe_customer_id: string | null
  agreement_signed_at: string | null
  payment_method_added: boolean
  created_at: string
}

// ─── SC Company ──────────────────────────────────────────────────────────────

export type SCStatus = "pending" | "active" | "suspended"

export interface SCCompany {
  id: string
  user_id: string
  name: string
  license_number: string | null
  license_state: string | null
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  commission_rate: number // percentage e.g. 25 = 25%
  status: SCStatus
  agreement_signed_at: string | null
  created_at: string
}

// ─── Sign Spec ───────────────────────────────────────────────────────────────

export type SignType =
  | "flat_cut"
  | "channel_letters"
  | "cabinet"
  | "monument"
  | "blade"
  | "window_vinyl"
  | "awning"
  | "pylon"
  | "other"

export type SignMaterial = "aluminum" | "acrylic" | "vinyl" | "wood" | "foam" | "steel" | "other"

export type IlluminationType = "none" | "internal_led" | "external" | "halo" | "neon" | "digital"

// 12 awning frame styles (from industry standard chart)
export type AwningFrameStyle =
  | "standard_valence"
  | "standard"
  | "arch"
  | "bullnose"
  | "dome"
  | "circular"
  | "gable"
  | "half_round"
  | "quarter_round"
  | "concave"
  | "waterfall"
  | "box"

export interface SunbrellaFabric {
  name: string   // e.g. "Pacific Blue"
  code: string   // e.g. "4601"
  hex: string    // approximate swatch color
}

export interface SignSpec {
  sign_type: SignType
  width_inches: number
  height_inches: number
  width_confidence: "high" | "medium" | "low"
  business_name: string
  primary_color: string
  secondary_color: string | null
  material: SignMaterial
  illumination: IlluminationType
  custom_notes: string | null
  // AI estimation metadata
  estimation_references: string[] // e.g. ["door", "brick"]
  estimation_angle_warning: boolean
  // Selection quad (normalized 0–1)
  selection_quad: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ]
  // Awning-specific (only when sign_type === "awning")
  awning_frame_style?: AwningFrameStyle
  awning_fabric?: SunbrellaFabric
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "draft"
  | "submitted"          // client submitted, awaiting SC bids
  | "bidding"            // broadcast to SCs, within 24hr window
  | "quote_ready"        // platform selected bid, awaiting client acceptance
  | "accepted"           // client accepted, awaiting deposit
  | "deposit_paid"       // 50% paid, SC assigned, work beginning
  | "in_progress"        // SC working
  | "submitted_for_review" // SC submitted install photos
  | "revision_requested" // client requested changes
  | "approved"           // client approved, final payment pending
  | "completed"          // final payment done, job closed
  | "cancelled"
  | "disputed"

export interface Order {
  id: string
  client_id: string
  status: OrderStatus
  sign_spec: SignSpec
  storefront_photo_url: string
  ai_preview_url: string | null
  selected_bid_id: string | null
  assigned_sc_id: string | null
  revision_count: number
  max_revisions: number // default 2
  created_at: string
  updated_at: string
}

// ─── Bids ─────────────────────────────────────────────────────────────────────

export type BidStatus = "pending" | "selected" | "rejected" | "expired"

export interface Bid {
  id: string
  order_id: string
  sc_id: string
  price_cents: number
  timeline_days: number
  notes: string | null
  status: BidStatus
  created_at: string
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentStage = "deposit" | "final"
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded"

export interface Payment {
  id: string
  order_id: string
  stripe_payment_intent_id: string
  amount_cents: number
  stage: PaymentStage
  status: PaymentStatus
  created_at: string
}

export interface Transfer {
  id: string
  order_id: string
  sc_id: string
  stripe_transfer_id: string
  amount_cents: number
  milestone: "job_start" | "job_approved"
  created_at: string
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface Job {
  id: string
  order_id: string
  sc_id: string
  status: "active" | "submitted" | "revision" | "completed"
  install_photos: string[]
  sc_notes: string | null
  client_revision_notes: string | null
  client_approved_at: string | null
  created_at: string
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  job_id: string
  sender_id: string
  sender_role: UserRole
  body: string
  created_at: string
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export type DisputeStatus = "open" | "under_review" | "resolved"

export interface Dispute {
  id: string
  job_id: string
  order_id: string
  raised_by: string
  description: string
  evidence_urls: string[]
  status: DisputeStatus
  admin_resolution: string | null
  created_at: string
}

// ─── Commission Log ───────────────────────────────────────────────────────────

export interface CommissionLogEntry {
  id: string
  sc_id: string
  old_rate: number
  new_rate: number
  changed_by: string
  changed_at: string
  note: string | null
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface SignSizeResult {
  width_inches: number
  height_inches: number
  confidence: "high" | "medium" | "low"
  method: "multi-reference" | "door-only" | "fallback"
  references_used: string[]
  angle_warning: boolean
  reasoning: string
}

export interface SelectionQuad {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
}
