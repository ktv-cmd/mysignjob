// ─── Users ───────────────────────────────────────────────────────────────────

export type UserRole = "client" | "sc" | "admin"

export interface User {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  phone: string | null
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
  common?: boolean // true = shown in the default 12-color grid
}

export interface SignSpec {
  sign_type: SignType
  width_inches: number   // total developed width (= front + side for corner signs)
  height_inches: number
  width_confidence: "high" | "medium" | "low"
  business_name: string
  primary_color: string
  secondary_color: string | null
  material: SignMaterial
  illumination: IlluminationType
  custom_notes: string | null
  // Size-estimation metadata — populated from the client-side reference-line
  // geometry calc (lib/sign-geometry.ts), not an AI guess.
  estimation_references: string[] // e.g. ["door", "brick"]
  estimation_angle_warning: boolean
  // Selection quad (normalized 0–1) — 4 points [TL,TR,BR,BL] for flat, 6 points [TL,TM,TR,BR,BM,BL] for corner
  selection_quad: { x: number; y: number }[]
  // The storefront photo's own width/height ratio at the time the quad was
  // drawn — required to interpret selection_quad's normalized (0–1)
  // coordinates as real proportions (see validateQuadMatchesRatio in
  // lib/sign-geometry.ts). A "square" quad in normalized space isn't square
  // unless the photo itself is square.
  image_aspect_ratio?: number
  // Reference-line calibration ("app ruler") the client marked to compute size
  reference_type?: string             // e.g. "door" | "window" | "brick" | "custom"
  reference_inches?: number           // known real-world length of the reference line
  reference_line?: { x: number; y: number }[]  // 2 points [A,B] (ruler mode) or 4 points [TL,TR,BR,BL] (door/brick sticker mode)
  // Corner / wraparound sign fields
  is_corner?: boolean
  front_width_inches?: number  // face 1 width (corner signs only)
  side_width_inches?: number   // face 2 width (corner signs only)
  // Top-level category (new tree: letters | light_box | awning)
  sign_category?: "letters" | "light_box" | "awning"
  // Letters-specific
  is_lit?: boolean | null       // null = unset (must choose), true = with light, false = no light
  // "back_side" is a legacy alias for "side" (it never meant "back-lit + side"
  // despite the name) — kept only so already-stored order rows still parse.
  lighting_style?: "front" | "back" | "back_side" | "side" | "front_back" | "front_side" | "full"  // only when is_lit = true
  // Light box-specific
  light_box_type?: "cabinet" | "seethrough_letters"
  light_box_shape?: string      // e.g. "rectangle", "circle", "oval", "rounded"
  is_perpendicular?: boolean    // wall-mounted perpendicular (blade sign); default false = flush to wall
  // Advanced lighting (when is_lit = true)
  light_warmth?: number         // LED color temperature in Kelvin — one of the standard bins
                                // sign shops stock (2700/4000/4500/5000/6000/8000/10000/12000);
                                // null/undefined = default (see DEFAULT_LIGHT_WARMTH_K)
  light_colorful?: boolean      // Multicolor RGB mode; default false
  // Awning-specific (only when sign_category === "awning")
  awning_frame_style?: AwningFrameStyle
  awning_fabric?: SunbrellaFabric
  // Reference style (webs/signs structure) + typography
  reference_style?: string  // derived from sign_category + choices; front-lit | back-lit | light-box-seethrough | no-light-outdoor | awning
  font_style?: string       // modern-sans | classic-serif | bold-condensed
  // Brand / logo
  brand_mode?: "text-only" | "logo-only" | "logo-and-text"
  logo_url?: string | null
  logo_includes_name?: boolean   // client-confirmed: logo already renders the business name, so don't add it again
  // true = no letter/panel color was chosen — the sign company fabricates by
  // color-matching the uploaded logo exactly, rather than a swatch/hex we picked.
  // Only set for: lit channel letters with a background panel, or a cabinet
  // light box. Other logo cases (unlit letters, no-panel letters, see-through
  // light box, awnings) still carry an explicit client-chosen color as before.
  logo_color_match?: boolean
  // The hex value(s) Gemini reported reading off the logo during preview
  // generation (see lib/ai/preview.ts's ColorReport) — the only concrete
  // color data that exists when logo_color_match is true, since no swatch was
  // ever chosen. AI-ESTIMATED from a photo, not a real swatch/Pantone lookup —
  // present it to fabricators as needing verification, not as an authoritative
  // spec. Only present when a preview finished and reported one back; omitted
  // (not just false) whenever no report exists, since preview generation is
  // best-effort and can fail or be skipped entirely.
  logo_color_match_hex?: { letters?: string; panel?: string }
  // Channel letter material details
  panel_face_color?: { name: string; code: string; hex: string }   // Dura-Bond ACP face
  has_background?: boolean                                          // channel letters on a backer panel (true) vs mounted directly on the wall (false)
  bg_material?: "aluminum" | "acrylic"                             // backer panel material (when has_background)
  panel_bg_color?: { name: string; code: string; hex: string; finish?: string }  // backer panel color (+ acrylic finish)
  acrylic_color?: { name: string; code: string; hex: string; finish: "translucent" | "opaque" | "transparent" | "matte" }
  channel_lighting?: { type: string; return_glow?: string }
  // ─── Job requirements (installation + insurance) ───────────────────────────
  // Captured at quote time; these drive what the SC bids on.
  needs_installation?: boolean       // true = SC installs; false = client installs it themselves (fabricate-only)
  // Certificate of Insurance the building/landlord requires from the installer.
  // Only meaningful when needs_installation = true (self-install = client's own concern).
  coi_required?: boolean | null      // null = client isn't sure (SC to confirm)
  coi_amount?: number                // required general-liability coverage in dollars, e.g. 1_000_000
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

