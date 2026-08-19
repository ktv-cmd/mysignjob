-- Admin needs to see failed AI preview jobs and resolve disputes for the new
-- /admin/issues ("Mistakes") page. Two gaps:
--   1. preview_jobs only had an owner-only select policy — admin couldn't
--      read any row, including ones with status = 'error'.
--   2. disputes had select + insert policies but no update policy at all —
--      admin had no way to write admin_resolution / flip status to resolved.

create policy "preview_jobs_select_admin"
  on public.preview_jobs for select
  using (public.current_user_role() = 'admin');

create policy "disputes_update_admin"
  on public.disputes for update
  using (public.current_user_role() = 'admin');
