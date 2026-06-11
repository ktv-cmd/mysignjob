-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('client', 'sc', 'admin')) default 'client',
  stripe_customer_id text,
  payment_method_added boolean not null default false,
  agreement_signed_at timestamptz,
  agreement_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── SC Companies ─────────────────────────────────────────────────────────────
create table public.sc_companies (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  license_number text,
  license_state text,
  stripe_account_id text unique,
  stripe_onboarding_complete boolean not null default false,
  commission_rate numeric(5,2) not null default 25.00, -- platform default
  status text not null check (status in ('pending', 'active', 'suspended')) default 'pending',
  agreement_signed_at timestamptz,
  agreement_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.users(id),
  status text not null default 'draft' check (status in (
    'draft','submitted','bidding','quote_ready','accepted',
    'deposit_paid','in_progress','submitted_for_review',
    'revision_requested','approved','completed','cancelled','disputed'
  )),
  sign_spec jsonb not null default '{}',
  storefront_photo_url text,
  ai_preview_url text,
  selected_bid_id uuid, -- filled after platform selects
  assigned_sc_id uuid references public.sc_companies(id),
  revision_count integer not null default 0,
  max_revisions integer not null default 2,
  bid_deadline_at timestamptz, -- 24hr window end
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Bids ─────────────────────────────────────────────────────────────────────
create table public.bids (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sc_id uuid not null references public.sc_companies(id),
  price_cents integer not null,
  timeline_days integer not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','selected','rejected','expired')),
  created_at timestamptz not null default now(),
  unique(order_id, sc_id) -- one bid per SC per order
);

-- back-fill FK on orders
alter table public.orders
  add constraint orders_selected_bid_fkey
  foreign key (selected_bid_id) references public.bids(id);

-- ─── Payments ────────────────────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id),
  stripe_payment_intent_id text not null unique,
  amount_cents integer not null,
  stage text not null check (stage in ('deposit','final')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  created_at timestamptz not null default now()
);

-- ─── Transfers ───────────────────────────────────────────────────────────────
create table public.transfers (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id),
  sc_id uuid not null references public.sc_companies(id),
  stripe_transfer_id text not null unique,
  amount_cents integer not null,
  milestone text not null check (milestone in ('job_start','job_approved')),
  created_at timestamptz not null default now()
);

-- ─── Jobs ─────────────────────────────────────────────────────────────────────
create table public.jobs (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) unique,
  sc_id uuid not null references public.sc_companies(id),
  status text not null default 'active' check (status in ('active','submitted','revision','completed')),
  install_photos text[] not null default '{}',
  sc_notes text,
  client_revision_notes text,
  client_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Messages ────────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  sender_role text not null check (sender_role in ('client','sc','admin')),
  body text not null,
  created_at timestamptz not null default now()
);

-- ─── Disputes ────────────────────────────────────────────────────────────────
create table public.disputes (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id),
  order_id uuid not null references public.orders(id),
  raised_by uuid not null references public.users(id),
  description text not null,
  evidence_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open','under_review','resolved')),
  admin_resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Commission Log ───────────────────────────────────────────────────────────
create table public.commission_log (
  id uuid primary key default uuid_generate_v4(),
  sc_id uuid not null references public.sc_companies(id),
  old_rate numeric(5,2) not null,
  new_rate numeric(5,2) not null,
  changed_by uuid not null references public.users(id),
  note text,
  changed_at timestamptz not null default now()
);

-- ─── Dispute count (denormalized for fraud detection) ────────────────────────
alter table public.users add column dispute_count integer not null default 0;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index on public.orders(client_id);
create index on public.orders(status);
create index on public.orders(assigned_sc_id);
create index on public.bids(order_id);
create index on public.bids(sc_id);
create index on public.payments(order_id);
create index on public.jobs(order_id);
create index on public.jobs(sc_id);
create index on public.messages(job_id);
create index on public.disputes(status);

-- ─── Updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at before update on public.users
  for each row execute function public.handle_updated_at();
create trigger sc_companies_updated_at before update on public.sc_companies
  for each row execute function public.handle_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.handle_updated_at();
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.handle_updated_at();
create trigger disputes_updated_at before update on public.disputes
  for each row execute function public.handle_updated_at();

-- ─── Auto-create user profile on signup ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.sc_companies enable row level security;
alter table public.orders enable row level security;
alter table public.bids enable row level security;
alter table public.payments enable row level security;
alter table public.transfers enable row level security;
alter table public.jobs enable row level security;
alter table public.messages enable row level security;
alter table public.disputes enable row level security;
alter table public.commission_log enable row level security;

-- Helper: get current user role
create or replace function public.current_user_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql security definer stable;

-- Users: see own row; admin sees all
create policy "users_select_own" on public.users
  for select using (id = auth.uid() or public.current_user_role() = 'admin');
create policy "users_update_own" on public.users
  for update using (id = auth.uid());

-- SC companies: SC sees own; admin sees all
create policy "sc_select_own" on public.sc_companies
  for select using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "sc_update_own" on public.sc_companies
  for update using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "sc_insert" on public.sc_companies
  for insert with check (user_id = auth.uid());

-- Orders: client sees own; assigned SC sees assigned orders; admin sees all
create policy "orders_select" on public.orders
  for select using (
    client_id = auth.uid()
    or assigned_sc_id in (select id from public.sc_companies where user_id = auth.uid())
    or public.current_user_role() = 'admin'
  );
create policy "orders_insert" on public.orders
  for insert with check (client_id = auth.uid());
create policy "orders_update_client" on public.orders
  for update using (
    client_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- Bids: SC sees own bids; admin sees all; client sees selected bid only
create policy "bids_select" on public.bids
  for select using (
    sc_id in (select id from public.sc_companies where user_id = auth.uid())
    or public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'client'
      and status = 'selected'
      and order_id in (select id from public.orders where client_id = auth.uid())
    )
  );
create policy "bids_insert" on public.bids
  for insert with check (
    sc_id in (select id from public.sc_companies where user_id = auth.uid())
  );

-- Payments: client sees own; admin sees all
create policy "payments_select" on public.payments
  for select using (
    order_id in (select id from public.orders where client_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

-- Transfers: SC sees own; admin sees all
create policy "transfers_select" on public.transfers
  for select using (
    sc_id in (select id from public.sc_companies where user_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

-- Jobs: SC and client of that order see it; admin sees all
create policy "jobs_select" on public.jobs
  for select using (
    sc_id in (select id from public.sc_companies where user_id = auth.uid())
    or order_id in (select id from public.orders where client_id = auth.uid())
    or public.current_user_role() = 'admin'
  );
create policy "jobs_update" on public.jobs
  for update using (
    sc_id in (select id from public.sc_companies where user_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

-- Messages: participants of the job
create policy "messages_select" on public.messages
  for select using (
    job_id in (
      select j.id from public.jobs j
      join public.orders o on o.id = j.order_id
      where o.client_id = auth.uid()
         or j.sc_id in (select id from public.sc_companies where user_id = auth.uid())
    )
    or public.current_user_role() = 'admin'
  );
create policy "messages_insert" on public.messages
  for insert with check (sender_id = auth.uid());

-- Disputes: raiser and admin
create policy "disputes_select" on public.disputes
  for select using (
    raised_by = auth.uid()
    or public.current_user_role() = 'admin'
  );
create policy "disputes_insert" on public.disputes
  for insert with check (raised_by = auth.uid());

-- Commission log: admin only
create policy "commission_log_admin" on public.commission_log
  for all using (public.current_user_role() = 'admin');
