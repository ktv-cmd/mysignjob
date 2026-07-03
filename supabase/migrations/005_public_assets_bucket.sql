-- Public bucket for client-facing display images: AI previews, storefront
-- photos, and logos. These are meant to be shown in the browser (to clients and
-- to sign companies), so they need public read access.
--
-- Kept separate from the private `documents` bucket, which holds sensitive SC
-- files (insurance certificates, licenses) that must NOT be publicly readable.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Authenticated users (including anonymous guest sessions) can upload.
-- The preview worker uses the service role and bypasses RLS entirely.
create policy "public_assets_upload"
  on storage.objects for insert
  with check (bucket_id = 'public-assets' AND auth.uid() is not null);

-- Public read is provided by the bucket being public — no select policy required.
