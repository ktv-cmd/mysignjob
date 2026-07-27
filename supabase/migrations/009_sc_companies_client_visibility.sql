-- ─────────────────────────────────────────────────────────────────────────────
-- 009_sc_companies_client_visibility.sql
--
-- public.sc_companies had no client-facing SELECT policy at all — only the
-- owning SC or an admin could read a row (sc_select_own, 001_initial_schema).
-- Once a client's order reaches quote_ready, the order/[id] page needs to
-- show the winning SC's name; without this policy the embedded
-- "sc_companies(name)" join is silently filtered to null by RLS.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "sc_companies_select_client_view" on public.sc_companies;

create policy "sc_companies_select_client_view" on public.sc_companies
  for select
  using (
    id in (
      select b.sc_id from public.bids b
      join public.orders o on o.id = b.order_id
      where o.client_id = auth.uid() and b.status = 'selected'
    )
  );
