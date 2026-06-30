-- ============================================================
-- Migration: add customer email + tracking codes to orders
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- 1) Add email + tracking_code columns to orders
alter table orders add column if not exists email         text default '';
alter table orders add column if not exists tracking_code text default '';

-- 2) Index for fast tracking lookups
create unique index if not exists orders_tracking_code_idx
  on orders (tracking_code)
  where tracking_code <> '';

-- 3) Backfill empty tracking codes for any existing orders
update orders
set tracking_code = encode(gen_random_bytes(12), 'hex')
where tracking_code is null or tracking_code = '';
