-- Async AI preview generation jobs.
-- The client kicks off a job, a background worker generates the previews and
-- writes the result back, and the client polls for completion. This keeps the
-- request short so serverless function timeouts (e.g. Netlify) are never hit.

create table if not exists public.preview_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending',  -- pending | processing | done | error
  params      jsonb not null,
  result_urls jsonb,                             -- string[] of public preview URLs
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists preview_jobs_user_id_idx on public.preview_jobs (user_id);
create index if not exists preview_jobs_created_at_idx on public.preview_jobs (created_at);

alter table public.preview_jobs enable row level security;

-- Users can create and read their own jobs. Updates are performed by the worker
-- using the service role, which bypasses RLS — so no update/insert-for-worker policy needed.
create policy "preview_jobs_select_own"
  on public.preview_jobs for select
  using (auth.uid() = user_id);

create policy "preview_jobs_insert_own"
  on public.preview_jobs for insert
  with check (auth.uid() = user_id);
