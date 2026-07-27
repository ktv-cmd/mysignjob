-- ─────────────────────────────────────────────────────────────────────────────
-- 008_bids_admin_update_policy.sql
--
-- public.bids has only ever had SELECT and INSERT policies (see
-- 001_initial_schema.sql) — no UPDATE policy at all. Admin's selectWinningBid
-- action updates bids.status via the per-request client (not service role),
-- so with no matching policy RLS silently blocks it: Postgres/PostgREST
-- returns success with zero rows affected rather than an error, so the bid
-- stayed status='pending' forever even after being selected or rejected.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "bids_update_admin" on public.bids;

create policy "bids_update_admin" on public.bids
  for update
  using (public.current_user_role() = 'admin');
