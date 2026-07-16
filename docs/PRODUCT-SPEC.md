# My Sign Job — Product Specification

_What the product is supposed to do. Written 2026-07-14 from the live app + database schema (`supabase/migrations/`)._

---

## 1. In one sentence

**My Sign Job is a managed marketplace that turns "I need a sign for my business" into a finished, installed sign** — the business owner photographs their storefront, sees an AI-rendered preview of the sign on their actual building, and vetted local sign companies compete to fabricate and install it. The platform handles measurement, previews, bidding, payments (escrow-style, milestone payouts), and dispute resolution.

## 2. Who uses it (three roles)

| Role | DB role | What they do |
|------|---------|--------------|
| **Client** (business owner) | `client` | Creates an order, gets an AI preview, receives a quote, pays a deposit, approves the finished job. Can start as an anonymous **guest**. |
| **Sign Company / "SC"** | `sc` | Applies, gets vetted (agreement + business info + insurance COI + Stripe payout), bids on jobs, fabricates & installs, uploads proof photos, gets paid. |
| **Admin** (platform) | `admin` | Vets SCs, selects the winning bid, sets commission rates, resolves disputes, oversees everything. |

Roles are mutually exclusive per user row (`users.role` check constraint). The DB signup trigger defaults everyone to `client`; SC signup overrides to `sc` server-side and creates an `sc_companies` row.

## 3. The client journey

### 3.1 Order creation — a 5-step wizard (`/order/new`)

The whole flow runs **without an account** (guest / anonymous Supabase auth). Steps:

1. **Photo** — upload a storefront photo. Guidance: stand square-on (<15° tilt), include the entrance door, good light, full width. Image is resized client-side to ≤1920px before use.
2. **Mark Sign Area** — drag a gold quadrilateral over where the sign will go. To convert pixels → inches, the client drags a **reference object** (a door = 80″, a brick course = 8″, or a custom known size) onto a matching object in the photo. Geometry is computed **client-side** — no AI. Extras: **mount type** (flat-on-wall vs. perpendicular "blade"), **corner sign** (wraps two walls), and an **"I already know my exact size"** shortcut that skips photo measurement and takes typed dimensions.
3. **Sign Details** — the spec the sign companies quote against: optional **logo** upload (brand colors auto-extracted) and/or **business name**; **sign type** and style. Supported types include **channel letters** (lit/unlit, optional background panel), **light box** (flat or blade, optional see-through letters), and **awnings** (12 frame shapes, Sunbrella fabrics, illumination options). Materials: acrylic / aluminum. A live prompt preview shows exactly what the AI will be told.
4. **AI Preview** — the server runs **3 Gemini generations** (async job: `preview/start` → poll `preview/status`) rendering the sign onto the client's photo. Client picks their favourite. Preview is best-effort — a job can proceed even if preview fails ("Sign companies will still be able to quote").
5. **Review & Submit** — summary of the spec, plus job requirements: **who installs** (SC installs vs. client self-installs) and, if the SC installs, an optional **insurance/COI requirement** with a coverage amount. Submitting sends the job out for quotes.

**Guest capture:** the first time a guest triggers the AI preview, a modal collects **name + phone (+ optional email)** so sign companies can send quotes. This signs them in anonymously and persists the lead.

### 3.2 After submit

Order status walks through: `draft → submitted → bidding → quote_ready → accepted → deposit_paid → in_progress → submitted_for_review → (revision_requested ↔) approved → completed`. (`cancelled` / `disputed` are terminal side-paths.)

- **Bidding** happens in a time-boxed window (`orders.bid_deadline_at`, ~24h). One bid per SC per order.
- The **platform selects** the winning bid (`selected_bid_id`, `assigned_sc_id`); the client sees only the selected bid, not all bids.
- Client **accepts**, pays a **deposit** (Stripe), the job becomes active.
- SC fabricates/installs, uploads **install photos**, submits for review.
- Client **approves** (or requests a revision — capped at `max_revisions`, default 2). On approval, the **final payment** is captured.
- Dashboard (`/dashboard`) lists the client's orders; detail at `/order/[id]`.

## 4. The sign-company (SC) journey

1. **Register** (`/sc/register`) → **onboarding wizard** (`/sc/onboarding`):
   1. **Agreement** — accept the partner terms.
   2. **Business Info** — EIN, address, city/state/ZIP, service radius.
   3. **Insurance** — upload a Certificate of Insurance; **AI verifies coverage** (`/api/sc/verify-insurance`).
   4. **Payout Setup** — Stripe Connect onboarding (`stripe_account_id`, `stripe_onboarding_complete`).
2. Company starts `pending`; becomes `active` once vetted.
3. **Dashboard** (`/sc/dashboard`) → available jobs → **submit a bid** (price + timeline days + notes).
4. Win → fabricate/install → upload proof → get paid.

**Payouts** are milestone-based via Stripe **transfers**: `job_start` and `job_approved`. The platform keeps a **commission** (`sc_companies.commission_rate`, default 25%); rate changes are audited in `commission_log`.

## 5. The platform / admin

- Vets SCs, flips `sc_companies.status` to `active`.
- **Selects winning bids** on behalf of clients.
- Adjusts per-SC commission (logged).
- Handles **disputes** (`disputes` table: raised by client or SC, evidence URLs, admin resolution). `users.dispute_count` is denormalized for fraud signals.
- **Messaging** (`messages`) ties client ↔ SC ↔ admin to a job.

## 6. Money model

- **Stripe** end to end. Client is a Stripe customer; SC is a Stripe Connect account.
- **Payments** captured in stages: `deposit`, then `final`.
- **Transfers** pay the SC at milestones, net of platform commission.
- Everything is escrow-style: the platform holds funds and releases on approval.

## 7. Trust & safety pillars

- **Vetted supply**: SCs must pass agreement + business info + **insurance verification** + Stripe before they can earn.
- **Insurance requirement per job**: clients requiring SC installation can demand a COI at a coverage amount.
- **Revision cap + dispute process** protects both sides.
- **RLS everywhere**: clients see only their orders and the *selected* bid; SCs see only their own bids/jobs; admin sees all (`supabase/migrations/001_initial_schema.sql`).

## 8. Tech shape (for context)

Next.js 16 (App Router, Turbopack) · React 19 · Supabase (Postgres + Auth + Storage, RLS) · Stripe · Google Gemini (previews) + Fal/Replicate · Resend (email) · Tailwind v4 + Radix + shadcn-style components · Zustand + React Query. Route groups: `(client)`, `(sc)`, `(admin)`, `(auth)`.

## 9. The core promises the UX must keep

1. A business owner with only a phone photo can get a **believable preview** and a **real quote** in minutes, **without signing up first**.
2. A sign company can **onboard and start bidding** without hand-holding.
3. Money only moves as **work is verified**; both sides have recourse.
4. Every custom control (photo marking, sign customizer) must work **by touch on a phone**, because storefront photos are taken on phones.

> Promise #1 is currently broken for one path — see `docs/UX-AUDIT.md` (P0).
