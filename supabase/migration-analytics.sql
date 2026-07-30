-- ============================================================
-- AVYUKTA — Site Analytics Migration
-- Run this in your Supabase SQL Editor AFTER schema.sql
-- ============================================================

create table if not exists analytics_events (
  id          bigint generated always as identity primary key,
  event_type  text not null,
  page        text default '',
  product_id  bigint,
  category_id bigint,
  query       text default '',
  session_id  text not null,
  referrer    text default '',
  user_agent  text default '',
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Indexes for fast analytics queries
create index if not exists idx_analytics_created_at on analytics_events (created_at desc);
create index if not exists idx_analytics_event_type on analytics_events (event_type);
create index if not exists idx_analytics_page       on analytics_events (page);
create index if not exists idx_analytics_session    on analytics_events (session_id);
create index if not exists idx_analytics_product    on analytics_events (product_id) where product_id is not null;

-- Row Level Security
alter table analytics_events enable row level security;

drop policy if exists "open" on analytics_events;
create policy "open" on analytics_events for all using (true) with check (true);

-- ============================================================
-- Done! The analytics_events table is ready.
-- Events are batch-inserted by the client every 30 seconds.
-- ============================================================
