-- ─────────────────────────────────────────────────────────────────────────────
-- 006_security_hardening.sql
--
-- Fixes four confirmed vulnerabilities:
--
--  §1  CRITICAL  handle_new_user() trusted client-supplied 'role' from JWT
--                metadata, allowing any signup to claim 'admin'. Fixed by
--                hardcoding 'client' as the inserted role.
--
--  §2  CRITICAL  users_update_own had no WITH CHECK, so an authenticated user
--                could UPDATE their own role to 'admin'. Fixed by dropping the
--                policy and adding a BEFORE UPDATE trigger that raises an
--                exception when a non-admin session tries to change the role
--                column, and a reconstructed policy with WITH CHECK.
--
--  §3  HIGH      storage 'documents' bucket policies allowed any authenticated
--                user to read/write any object. Replaced with path-scoped
--                policies:
--                  • preview-inputs/<user.id>/...  — path segment [1] = user.id
--                  • sc-insurance/<sc_id>/...      — path segment [1] = sc_companies.id
--                    owned by the current user
--                Admins may read everything. All other ops (UPDATE/DELETE) are
--                also scoped to owner or admin.
--
--  §4  MEDIUM    orders_select excluded active SCs from seeing unassigned
--                submitted/bidding orders, which the SC dashboard queries.
--                Added a dedicated policy for that read path.
--
--  §5  MEDIUM    sc_companies had no 'pending_review' status and no way to
--                record human review of AI-extracted insurance data. Added
--                the status value and insurance_reviewed_at/_by columns.
--
-- All changes are idempotent-ish:
--   • Functions use CREATE OR REPLACE.
--   • Policies use DROP POLICY IF EXISTS before CREATE POLICY.
--   • The role-guard trigger uses DROP TRIGGER IF EXISTS before CREATE TRIGGER.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1  CRITICAL — handle_new_user: stop trusting client-supplied role
-- ═════════════════════════════════════════════════════════════════════════════

-- Redefine the function with a hardcoded 'client' role.
-- The trigger that calls it (on_auth_user_created) already exists and is
-- unchanged; only the function body is replaced.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'client'  -- never trust client-supplied role from JWT metadata
  );
  return new;
end;
$$ language plpgsql security definer;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2  CRITICAL — prevent non-admin users from escalating their own role
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. Drop the vulnerable policy (no WITH CHECK = role escalation possible)
drop policy if exists "users_update_own" on public.users;

-- 2b. Recreate the policy with a WITH CHECK that disallows role changes.
--     The USING clause keeps "user may only touch their own row".
--     The WITH CHECK clause ensures the role column is not altered
--     (admins are exempt via public.current_user_role() = 'admin').
create policy "users_update_own" on public.users
  for update
  using (id = auth.uid())
  with check (
    -- Non-admins must not change the role column.
    -- Admins can change anything (incl. promoting/demoting users).
    public.current_user_role() = 'admin'
    or role = (select u.role from public.users u where u.id = auth.uid())
  );

-- 2c. Belt-and-suspenders: a BEFORE UPDATE trigger that raises an exception
--     if a non-admin session attempts to change the role column.
--     This fires even if a future policy change accidentally reopens the hole.
create or replace function public.guard_user_role_change()
returns trigger as $$
begin
  -- Allow the change only if the caller is an admin (or the service role,
  -- which bypasses RLS entirely and never reaches this trigger via anon/authed).
  if new.role is distinct from old.role then
    if public.current_user_role() is distinct from 'admin' then
      raise exception 'permission denied: only admins may change the role column'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_user_role_change on public.users;
create trigger guard_user_role_change
  before update on public.users
  for each row execute function public.guard_user_role_change();


-- ═════════════════════════════════════════════════════════════════════════════
-- §3  HIGH — path-scoped storage policies for the 'documents' bucket
--
--  Path layouts (confirmed from route source):
--    preview-inputs/<user.id>/<jobId>.jpg           storage.foldername()[1] = user.id
--    preview-inputs/<user.id>/<jobId>-logo.(png|jpg)
--    sc-insurance/<sc_companies.id>/<timestamp>.ext  storage.foldername()[1] = sc.id
--
--  storage.foldername(name) returns an array of path segments split by '/'.
--  Index [1] is the first segment, [2] is the second (1-based in Postgres).
-- ═════════════════════════════════════════════════════════════════════════════

-- Drop the broad policies from 002_sc_verification.sql
drop policy if exists "sc_upload_documents"    on storage.objects;
drop policy if exists "sc_read_own_documents"  on storage.objects;

-- ── Helper: returns true when the object lives under the caller's preview-inputs folder
-- ── (first segment = 'preview-inputs', second segment = auth.uid()::text)

-- INSERT — users may upload only into their own preview-inputs or sc-insurance folder
create policy "documents_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid() is not null
    and (
      -- preview-inputs/<uid>/...
      (
        (storage.foldername(name))[1] = 'preview-inputs'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      or
      -- sc-insurance/<sc_id>/... where sc_id belongs to the caller
      (
        (storage.foldername(name))[1] = 'sc-insurance'
        and (storage.foldername(name))[2] in (
          select id::text from public.sc_companies where user_id = auth.uid()
        )
      )
    )
  );

-- UPDATE — same path scoping as INSERT (e.g. upsert: true calls upsert which may update)
create policy "documents_update_own"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and auth.uid() is not null
    and (
      (
        (storage.foldername(name))[1] = 'preview-inputs'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      or
      (
        (storage.foldername(name))[1] = 'sc-insurance'
        and (storage.foldername(name))[2] in (
          select id::text from public.sc_companies where user_id = auth.uid()
        )
      )
      or public.current_user_role() = 'admin'
    )
  );

-- DELETE — owner or admin only
create policy "documents_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid() is not null
    and (
      (
        (storage.foldername(name))[1] = 'preview-inputs'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      or
      (
        (storage.foldername(name))[1] = 'sc-insurance'
        and (storage.foldername(name))[2] in (
          select id::text from public.sc_companies where user_id = auth.uid()
        )
      )
      or public.current_user_role() = 'admin'
    )
  );

-- SELECT — owner reads their own objects; admins read all in the bucket
create policy "documents_select_own"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid() is not null
    and (
      (
        (storage.foldername(name))[1] = 'preview-inputs'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      or
      (
        (storage.foldername(name))[1] = 'sc-insurance'
        and (storage.foldername(name))[2] in (
          select id::text from public.sc_companies where user_id = auth.uid()
        )
      )
    )
  );

create policy "documents_select_admin"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and public.current_user_role() = 'admin'
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- §4  MEDIUM — let active SCs read unassigned submitted/bidding orders
--
--  The existing "orders_select" policy only allows an SC to see orders that
--  are already assigned to them. The SC dashboard also queries submitted and
--  bidding orders (to show the open bid pool). Add a separate policy so active
--  SCs can SELECT those rows without touching client/admin access.
-- ═════════════════════════════════════════════════════════════════════════════

drop policy if exists "orders_select_active_sc_pool" on public.orders;

create policy "orders_select_active_sc_pool" on public.orders
  for select
  using (
    status in ('submitted', 'bidding')
    and exists (
      select 1 from public.sc_companies
      where user_id = auth.uid()
        and status = 'active'
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- §5  MEDIUM — insurance verification must not auto-activate on AI OCR alone
--
--  app/api/sc/verify-insurance/route.ts moves an SC to 'pending_review' once
--  the AI-extracted certificate passes rule checks, instead of jumping straight
--  to 'active'. That status value didn't exist in the original CHECK constraint,
--  and there was no column recording that a human actually reviewed the AI
--  output — so add both.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.sc_companies
  drop constraint if exists sc_companies_status_check;

alter table public.sc_companies
  add constraint sc_companies_status_check
  check (status in ('pending', 'pending_review', 'active', 'suspended'));

alter table public.sc_companies
  add column if not exists insurance_reviewed_at timestamptz,
  add column if not exists insurance_reviewed_by uuid references public.users(id);
