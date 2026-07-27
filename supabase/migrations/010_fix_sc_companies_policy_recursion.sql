-- ─────────────────────────────────────────────────────────────────────────────
-- 010_fix_sc_companies_policy_recursion.sql
--
-- 009's sc_companies_select_client_view policy queries orders (via a join
-- through bids) to check ownership — but orders' own RLS policies
-- (orders_select, orders_select_active_sc_pool) query sc_companies right
-- back, so Postgres detects infinite recursion evaluating the two tables'
-- policies against each other (error 42P17), and every order lookup for a
-- client breaks, not just the sc_companies embed.
--
-- Fix: move the ownership check into a SECURITY DEFINER function, the same
-- pattern current_user_role() already uses to safely read public.users from
-- inside other tables' policies — a security-definer function runs as its
-- (privileged) owner and does not re-trigger RLS on the tables it queries
-- internally, breaking the cycle.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "sc_companies_select_client_view" on public.sc_companies;

create or replace function public.client_can_view_sc(sc_id_param uuid)
returns boolean as $$
  select exists (
    select 1 from public.bids b
    join public.orders o on o.id = b.order_id
    where b.sc_id = sc_id_param
      and o.client_id = auth.uid()
      and b.status = 'selected'
  );
$$ language sql security definer stable;

create policy "sc_companies_select_client_view" on public.sc_companies
  for select
  using (public.client_can_view_sc(id));
