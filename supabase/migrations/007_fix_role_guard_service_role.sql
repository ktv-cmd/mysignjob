-- ─────────────────────────────────────────────────────────────────────────────
-- 007_fix_role_guard_service_role.sql
--
-- 006's guard_user_role_change trigger assumed the service-role client "bypasses
-- RLS entirely and never reaches this trigger via anon/authed" — but Postgres
-- triggers fire on every row update regardless of BYPASSRLS; only row-security
-- *policies* are skipped, not user-defined triggers. Since the service-role
-- JWT carries no 'sub' claim, auth.uid() is NULL for those requests, so
-- current_user_role() is also NULL, and `NULL IS DISTINCT FROM 'admin'` is
-- TRUE — meaning the trigger has been rejecting every service-role role
-- change since 006 was applied (e.g. signUpSC assigning the 'sc' role after
-- signup, or seeding an admin account).
--
-- Fix: only enforce the admin-only check when there's an actual authenticated
-- session (auth.uid() is not null) — i.e. a normal anon/authenticated request.
-- Service-role and direct-Postgres access have already bypassed RLS by design
-- and are trusted server-side contexts; they should not be blocked here.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_user_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and public.current_user_role() is distinct from 'admin' then
      raise exception 'permission denied: only admins may change the role column'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
