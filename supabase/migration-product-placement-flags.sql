-- Run once in Supabase Dashboard → SQL Editor for an existing AVYUKTA project.
-- It makes the Featured, New Arrival and Best Seller values persist on products.
alter table products add column if not exists is_featured boolean not null default false;
alter table products add column if not exists is_new boolean not null default false;
alter table products add column if not exists is_best boolean not null default false;
