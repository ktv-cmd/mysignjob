-- ─── SC company verification columns ────────────────────────────────────────
alter table public.sc_companies
  add column if not exists ein text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state char(2),
  add column if not exists zip text,
  add column if not exists service_radius_miles integer not null default 25,
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  -- insurance
  add column if not exists insurance_doc_url text,
  add column if not exists insurance_extracted jsonb,
  add column if not exists insurance_gl_cents bigint,
  add column if not exists insurance_expires_at timestamptz,
  add column if not exists insurance_verified boolean not null default false,
  add column if not exists insurance_verified_at timestamptz,
  add column if not exists insurance_notes text,
  -- stripe connect
  add column if not exists stripe_connect_url text;

-- ─── Jurisdiction insurance requirements ────────────────────────────────────
-- Seeded with researched statutory minimums; admin-editable via admin panel.
-- jurisdiction: state code (e.g. 'NY') or city slug (e.g. 'ny_nyc').
-- City-level rows take precedence over state-level rows.
create table if not exists public.jurisdiction_insurance_requirements (
  id uuid primary key default uuid_generate_v4(),
  jurisdiction text not null unique,  -- 'ny_nyc', 'ca_la', 'il_chicago', 'TX', 'FL', 'default'
  label text not null,
  required_gl_cents bigint not null,  -- minimum GL per occurrence in cents
  require_workers_comp boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

-- Seed known jurisdictions (all amounts in cents)
insert into public.jurisdiction_insurance_requirements
  (jurisdiction, label, required_gl_cents, require_workers_comp, notes)
values
  ('default',    'Default (unlisted areas)', 100000000, false, '$1M GL — safe baseline for any unrecognized jurisdiction'),
  ('ny_nyc',     'New York City, NY',        100000000, true,  '$1M GL statutory (Master Sign Hanger DOB). Workers Comp + Disability mandatory. Note: many NYC landlords/BIDs contractually require $5M additional insured — set required_gl_cents on the order.'),
  ('ny',         'New York State',            100000000, true,  '$1M GL baseline; NYC city-level row takes precedence.'),
  ('ca_la',      'Los Angeles, CA',           100000000, false, '$1M/occ $2M aggregate CSLB C-45 requirement.'),
  ('ca',         'California',                100000000, false, 'CSLB C-45 (Electric Sign) license required.'),
  ('il_chicago', 'Chicago, IL',               100000000, false, 'GC license; GL $1M–$5M by class. Set higher on large jobs.'),
  ('il',         'Illinois',                  100000000, false, 'State baseline.'),
  ('tx',         'Texas',                     100000000, false, 'No statutory min; $1M is market norm.'),
  ('fl',         'Florida',                   100000000, false, 'DBPR/CILB license; $300K BI + $50K property statutory — we require $1M as platform minimum.')
on conflict (jurisdiction) do nothing;

-- ─── Add required_gl_cents to orders ────────────────────────────────────────
-- Per-job GL requirement (defaults to jurisdiction minimum, can be raised e.g. $5M for Manhattan landlord jobs)
alter table public.orders
  add column if not exists required_gl_cents bigint,
  add column if not exists job_address_lat numeric(9,6),
  add column if not exists job_address_lng numeric(9,6),
  add column if not exists job_city text,
  add column if not exists job_state char(2),
  add column if not exists job_zip text;

-- ─── Storage bucket for insurance docs + storefront photos ──────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- SC can upload to their own folder; admins can read all
create policy "sc_upload_documents"
  on storage.objects for insert
  with check (bucket_id = 'documents' AND auth.uid() is not null);

create policy "sc_read_own_documents"
  on storage.objects for select
  using (bucket_id = 'documents' AND auth.uid() is not null);

-- ─── RLS for jurisdiction table ──────────────────────────────────────────────
alter table public.jurisdiction_insurance_requirements enable row level security;

-- Everyone can read (needed to show requirements during onboarding)
create policy "jurisdiction_requirements_read_all"
  on public.jurisdiction_insurance_requirements for select
  using (true);

-- Only admins can modify
create policy "jurisdiction_requirements_admin_write"
  on public.jurisdiction_insurance_requirements for all
  using (public.current_user_role() = 'admin');
