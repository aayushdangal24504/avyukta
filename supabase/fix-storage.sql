-- ============================================================
-- AVYUKTA — STORAGE FIX
-- Fixes: "new row violates row-level security policy" on image upload.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1) Make sure the public "products" bucket exists
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

-- 2) Allow the storefront (anon key) to read & upload product images
drop policy if exists "avyukta products read"   on storage.objects;
drop policy if exists "avyukta products insert" on storage.objects;
drop policy if exists "avyukta products update" on storage.objects;
drop policy if exists "avyukta products delete" on storage.objects;

create policy "avyukta products read"   on storage.objects for select using (bucket_id = 'products');
create policy "avyukta products insert" on storage.objects for insert with check (bucket_id = 'products');
create policy "avyukta products update" on storage.objects for update using (bucket_id = 'products');
create policy "avyukta products delete" on storage.objects for delete using (bucket_id = 'products');

-- ============================================================
-- IF THE ABOVE FAILS with "must be owner of table objects":
-- newer Supabase projects block SQL policies on storage. Do it
-- via the dashboard instead (takes 1 minute):
--
--   1. Storage → buckets → create bucket "products" → toggle PUBLIC on
--   2. Storage → policies → products bucket → "New policy"
--      → "For full customization" → allow ALL operations (SELECT,
--      INSERT, UPDATE, DELETE) for role: anon, public — policy
--      definition:  bucket_id = 'products'
-- ============================================================
