-- ============================================================
-- Supabase schema — PRODUCTION-CLEAN
-- Run this ONCE in your Supabase project's SQL Editor.
--
-- This script ONLY creates tables and policies. It NEVER inserts
-- any demo / sample / placeholder data. The application is also
-- guaranteed to never auto-seed an empty cloud project.
-- ============================================================

create table if not exists users (
  id            bigint primary key,
  username      text not null,
  password_hash text not null,
  role          text not null default 'customer',
  created_at    timestamptz not null default now()
);

create table if not exists categories (
  id         bigint primary key,
  name       text not null,
  image      text,
  sort_order int not null default 0
);

create table if not exists products (
  id          bigint primary key,
  name        text not null,
  description text default '',
  price       numeric not null default 0,
  stock       int not null default 0,
  category_id bigint,
  images        jsonb not null default '[]',
  images_detail jsonb not null default '[]',
  is_featured boolean not null default false,
  is_new      boolean not null default false,
  is_best     boolean not null default false,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);

-- safe upgrade for projects that created the table before images_detail existed
alter table products add column if not exists images_detail jsonb not null default '[]';

create table if not exists orders (
  id            bigint primary key,
  customer_name text not null,
  phone         text not null,
  location      text default '',
  notes         text default '',
  total         numeric not null default 0,
  status        text not null default 'Pending',
  created_at    timestamptz not null default now(),
  user_id       bigint
);

create table if not exists order_items (
  id           bigint primary key,
  order_id     bigint not null,
  product_id   bigint,
  product_name text not null,
  price        numeric not null default 0,
  quantity     int not null default 1
);

create table if not exists settings (
  key   text primary key,
  value text default ''
);

-- ------------------------------------------------------------
-- Row Level Security: open policies so the storefront (anon key)
-- can read/write. For stricter production use, restrict writes
-- so anon can only INSERT into orders/order_items and only the
-- service role can mutate products/categories/settings/users.
-- ------------------------------------------------------------
alter table users       enable row level security;
alter table categories  enable row level security;
alter table products    enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table settings    enable row level security;

drop policy if exists "open" on users;
drop policy if exists "open" on categories;
drop policy if exists "open" on products;
drop policy if exists "open" on orders;
drop policy if exists "open" on order_items;
drop policy if exists "open" on settings;

create policy "open" on users       for all using (true) with check (true);
create policy "open" on categories  for all using (true) with check (true);
create policy "open" on products    for all using (true) with check (true);
create policy "open" on orders      for all using (true) with check (true);
create policy "open" on order_items for all using (true) with check (true);
create policy "open" on settings    for all using (true) with check (true);

-- ------------------------------------------------------------
-- STORAGE: public "products" bucket for product images.
-- Admin uploads cropped images here; public URLs are saved in
-- the products.images column.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

drop policy if exists "products read"   on storage.objects;
drop policy if exists "products insert" on storage.objects;
drop policy if exists "products update" on storage.objects;
drop policy if exists "products delete" on storage.objects;

create policy "products read"   on storage.objects for select using (bucket_id = 'products');
create policy "products insert" on storage.objects for insert with check (bucket_id = 'products');
create policy "products update" on storage.objects for update using (bucket_id = 'products');
create policy "products delete" on storage.objects for delete using (bucket_id = 'products');

-- ============================================================
-- NOTE: No INSERTs follow. The application never auto-seeds.
-- The first time you open Admin → Login the app asks you to
-- create the initial admin user from the UI.
-- ============================================================
