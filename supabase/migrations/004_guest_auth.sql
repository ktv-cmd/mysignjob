-- Allow anonymous Supabase users (signInAnonymously has no email address).
-- Replaces the NOT NULL + unique constraints with a partial unique index so
-- real-email users are still unique but anonymous rows can have email = null.
alter table public.users alter column email drop not null;
alter table public.users drop constraint if exists users_email_key;
create unique index if not exists users_email_unique_idx
  on public.users (email) where email is not null;

-- Lead capture: phone number collected at sign-up / guest modal.
alter table public.users add column if not exists phone text;
