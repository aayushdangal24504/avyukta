-- ============================================================
-- AVYUKTA — Supabase schema
-- Run this ONCE in your Supabase project's SQL Editor:
--   https://supabase.com/dashboard → your project → SQL Editor → New query
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
  images      jsonb not null default '[]',
  is_featured boolean not null default false,
  is_new      boolean not null default false,
  is_best     boolean not null default false,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);

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
-- can read/write. NOTE: this is fine for a demo/small shop, but for
-- production you should restrict writes (e.g. only allow inserts on
-- orders/order_items for anon, and manage the rest via service role).
-- ------------------------------------------------------------
alter table users       enable row level security;
alter table categories  enable row level security;
alter table products    enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table settings    enable row level security;

drop policy if exists "avyukta open" on users;
drop policy if exists "avyukta open" on categories;
drop policy if exists "avyukta open" on products;
drop policy if exists "avyukta open" on orders;
drop policy if exists "avyukta open" on order_items;
drop policy if exists "avyukta open" on settings;

create policy "avyukta open" on users       for all using (true) with check (true);
create policy "avyukta open" on categories  for all using (true) with check (true);
create policy "avyukta open" on products    for all using (true) with check (true);
create policy "avyukta open" on orders      for all using (true) with check (true);
create policy "avyukta open" on order_items for all using (true) with check (true);
create policy "avyukta open" on settings    for all using (true) with check (true);
