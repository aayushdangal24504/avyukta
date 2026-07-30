/**
 * AVYUKTA — Client-side Site Analytics Tracker
 *
 * Tracks page visits, clicks, product interactions, searches, cart actions,
 * and orders. Data is stored in localStorage (primary) and batch-pushed to
 * Supabase every 30 seconds (when cloud is configured).
 *
 * Session tracking uses a per-tab session ID stored in sessionStorage.
 * Each session gets a browser/device fingerprint for visitor deduplication.
 *
 * Usage:
 *   import { track, trackPage, trackClick, trackProductView, trackAddToCart, trackSearch, trackOrder, usePageVisit } from '../lib/analytics';
 */

import { getClient } from './supabase';

/* ========================= Types ========================= */

export type EventType =
  | 'page_visit'
  | 'click_product'
  | 'click_add_to_cart'
  | 'click_buy_now'
  | 'click_checkout'
  | 'click_category'
  | 'click_search'
  | 'click_cta'
  | 'click_link'
  | 'click_quick_view'
  | 'search_query'
  | 'view_product'
  | 'view_category'
  | 'order_placed'
  | 'cart_view'
  | 'account_view'
  | 'track_order'
  | 'session_start';

export interface AnalyticsEvent {
  id: number;
  event_type: EventType;
  page: string;
  product_id: number | null;
  category_id: number | null;
  query: string;
  session_id: string;
  referrer: string;
  user_agent: string;
  meta: Record<string, string | number | boolean>;
  created_at: string;
}

/* ========================= Constants ========================= */

const ANALYTICS_KEY = 'avyukta_analytics_events_v1';
const SESSION_KEY = 'avyukta_analytics_session';
const VISITOR_KEY = 'avyukta_analytics_visitor';
const FLUSH_INTERVAL = 30_000; // 30s
const MAX_LOCAL_EVENTS = 5000;
const BATCH_SIZE = 50;

/* ========================= Session / Visitor ========================= */

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 's_' + Math.random().toString(36).slice(2);
  }
}

function getVisitorId(): string {
  try {
    let vid = localStorage.getItem(VISITOR_KEY);
    if (!vid) {
      vid = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  } catch {
    return 'v_' + Math.random().toString(36).slice(2);
  }
}

/* ========================= Local Storage ========================= */

let localEvents: AnalyticsEvent[] = [];
let nextId = 1;

function loadLocal(): AnalyticsEvent[] {
  if (localEvents.length > 0) return localEvents;
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (raw) {
      localEvents = JSON.parse(raw) as AnalyticsEvent[];
      const maxId = localEvents.reduce((m, e) => Math.max(m, e.id), 0);
      nextId = maxId + 1;
    }
  } catch { /* corrupted */ }
  return localEvents;
}

function saveLocal() {
  try {
    // Cap to prevent localStorage bloat
    if (localEvents.length > MAX_LOCAL_EVENTS) {
      localEvents = localEvents.slice(-MAX_LOCAL_EVENTS);
    }
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(localEvents));
  } catch { /* quota exceeded */ }
}

/* ========================= Core Track ========================= */

/**
 * Record a single analytics event. Stored locally and queued for cloud sync.
 */
export function track(
  event_type: EventType,
  opts: {
    page?: string;
    product_id?: number;
    category_id?: number;
    query?: string;
    meta?: Record<string, string | number | boolean>;
  } = {}
) {
  loadLocal();

  const ev: AnalyticsEvent = {
    id: nextId++,
    event_type,
    page: opts.page || (typeof window !== 'undefined' ? window.location.hash : ''),
    product_id: opts.product_id ?? null,
    category_id: opts.category_id ?? null,
    query: opts.query || '',
    session_id: getSessionId(),
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    meta: opts.meta || {},
    created_at: new Date().toISOString(),
  };

  localEvents.push(ev);
  saveLocal();
  return ev;
}

/* ========================= Convenience Trackers ========================= */

/** Track a page visit (called automatically by usePageVisit hook). */
export function trackPage(path: string) {
  track('page_visit', { page: path });
}

/** Track clicking on a product card. */
export function trackProductClick(productId: number, productName?: string) {
  track('click_product', {
    product_id: productId,
    meta: productName ? { product_name: productName } : undefined,
  });
}

/** Track viewing a product detail page. */
export function trackProductView(productId: number) {
  track('view_product', { product_id: productId });
}

/** Track add-to-cart action. */
export function trackAddToCart(productId: number, productName?: string) {
  track('click_add_to_cart', {
    product_id: productId,
    meta: productName ? { product_name: productName } : undefined,
  });
}

/** Track buy-now click. */
export function trackBuyNow(productId: number) {
  track('click_buy_now', { product_id: productId });
}

/** Track checkout page entry. */
export function trackCheckout() {
  track('click_checkout');
}

/** Track category click/filter. */
export function trackCategoryClick(categoryId: number, categoryName?: string) {
  track('click_category', {
    category_id: categoryId,
    meta: categoryName ? { category_name: categoryName } : undefined,
  });
}

/** Track a search query. */
export function trackSearch(query: string) {
  track('search_query', { query });
}

/** Track a CTA button click. */
export function trackCTA(label: string) {
  track('click_cta', { meta: { label } });
}

/** Track an order placement. */
export function trackOrder(orderId: number, total: number) {
  track('order_placed', {
    meta: { order_id: orderId, total },
  });
}

/** Track quick-view modal open. */
export function trackQuickView(productId: number) {
  track('click_quick_view', { product_id: productId });
}

/** Track session start (called once per session). */
export function trackSessionStart() {
  track('session_start', {
    meta: {
      visitor_id: getVisitorId(),
      screen_width: typeof window !== 'undefined' ? window.innerWidth : 0,
      screen_height: typeof window !== 'undefined' ? window.innerHeight : 0,
    },
  });
}

/* ========================= React Hook: usePageVisit ========================= */

import { useEffect, useRef } from 'react';

/**
 * Call at the top of any page component to auto-track page visits.
 * Tracks once per mount (deduplicates React StrictMode double-invoke).
 *
 * Usage:
 *   usePageVisit('/shop');
 *   usePageVisit('/product/' + id);
 */
export function usePageVisit(path: string) {
  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackPage(path);
    }
    return () => { tracked.current = false; };
  }, [path]);
}

/* ========================= Supabase Batch Push ========================= */

let flushTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

/**
 * Flush local events to Supabase in batches. Called every 30s.
 */
async function flushToCloud() {
  if (syncing) return;
  const sb = getClient();
  if (!sb) return;

  loadLocal();
  if (localEvents.length === 0) return;

  syncing = true;
  try {
    // Get already-synced count from last flush
    const unsent = localEvents;
    if (unsent.length === 0) { syncing = false; return; }

    // Batch insert
    for (let i = 0; i < unsent.length; i += BATCH_SIZE) {
      const batch = unsent.slice(i, i + BATCH_SIZE).map((ev) => ({
        event_type: ev.event_type,
        page: ev.page,
        product_id: ev.product_id,
        category_id: ev.category_id,
        query: ev.query,
        session_id: ev.session_id,
        referrer: ev.referrer,
        user_agent: ev.user_agent,
        meta: ev.meta,
        created_at: ev.created_at,
      }));

      const { error } = await sb.from('analytics_events').insert(batch);
      if (error) {
        console.warn('Analytics flush error:', error.message);
        break; // stop on first error; retry next cycle
      }
    }

    // On success: clear local store (events are now in Supabase)
    localEvents = [];
    saveLocal();
  } catch (e) {
    console.warn('Analytics flush failed:', (e as Error).message);
  } finally {
    syncing = false;
  }
}

/** Start the periodic flush timer. Call once at app init. */
export function startAnalyticsSync() {
  if (flushTimer) return;
  // Session start event
  trackSessionStart();
  // Flush immediately then every 30s
  flushToCloud();
  flushTimer = setInterval(flushToCloud, FLUSH_INTERVAL);
}

/** Stop the flush timer (cleanup). */
export function stopAnalyticsSync() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/* ========================= Data Retrieval (for Admin) ========================= */

/**
 * Fetch all analytics events from Supabase + local.
 * Falls back to local-only when cloud is unavailable.
 */
export async function getAllEvents(fromDate?: string): Promise<AnalyticsEvent[]> {
  const sb = getClient();
  if (!sb) {
    loadLocal();
    return fromDate
      ? localEvents.filter((e) => e.created_at >= fromDate)
      : [...localEvents];
  }

  try {
    let query = sb
      .from('analytics_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50000);

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Merge with any unsent local events
    loadLocal();
    const merged = [...(data || []), ...localEvents];
    // Deduplicate by (session_id + event_type + created_at)
    const seen = new Set<string>();
    return merged.filter((e) => {
      const key = `${e.session_id}|${e.event_type}|${e.created_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    console.warn('Analytics fetch failed, using local:', (e as Error).message);
    loadLocal();
    return fromDate
      ? localEvents.filter((e) => e.created_at >= fromDate)
      : [...localEvents];
  }
}

/* ========================= Analytics Computations ========================= */

/** Get events for a date range. */
export function eventsInRange(events: AnalyticsEvent[], from: Date, to: Date): AnalyticsEvent[] {
  const fromStr = from.toISOString();
  const toStr = new Date(to.getTime() + 86400000).toISOString(); // +1 day
  return events.filter((e) => e.created_at >= fromStr && e.created_at < toStr);
}

/** Count events by type. */
export function countByType(events: AnalyticsEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  events.forEach((e) => {
    counts[e.event_type] = (counts[e.event_type] || 0) + 1;
  });
  return counts;
}

/** Unique visitors (by session_id). */
export function uniqueVisitors(events: AnalyticsEvent[]): number {
  return new Set(events.map((e) => e.session_id)).size;
}

/** Events grouped by day (YYYY-MM-DD). */
export function groupByDay(events: AnalyticsEvent[]): Record<string, AnalyticsEvent[]> {
  const groups: Record<string, AnalyticsEvent[]> = {};
  events.forEach((e) => {
    const day = e.created_at.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });
  return groups;
}

/** Top pages by visit count. */
export function topPages(events: AnalyticsEvent[], limit = 10): { page: string; count: number }[] {
  const counts: Record<string, number> = {};
  events.filter((e) => e.event_type === 'page_visit').forEach((e) => {
    const p = e.page || '/';
    counts[p] = (counts[p] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Top products by interaction (views + add-to-cart + clicks). */
export function topProducts(events: AnalyticsEvent[], limit = 10): { product_id: number; views: number; cartAdds: number; buys: number }[] {
  const map = new Map<number, { views: number; cartAdds: number; buys: number }>();
  events.forEach((e) => {
    if (!e.product_id) return;
    let entry = map.get(e.product_id);
    if (!entry) {
      entry = { views: 0, cartAdds: 0, buys: 0 };
      map.set(e.product_id, entry);
    }
    if (e.event_type === 'view_product' || e.event_type === 'click_product') entry.views++;
    if (e.event_type === 'click_add_to_cart') entry.cartAdds++;
    if (e.event_type === 'click_buy_now') entry.buys++;
  });
  return [...map.entries()]
    .map(([product_id, stats]) => ({ product_id, ...stats }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/** Top search queries. */
export function topSearches(events: AnalyticsEvent[], limit = 10): { query: string; count: number }[] {
  const counts: Record<string, number> = {};
  events.filter((e) => e.event_type === 'search_query' && e.query).forEach((e) => {
    counts[e.query] = (counts[e.query] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Top categories by click count. */
export function topCategories(events: AnalyticsEvent[], limit = 10): { category_id: number; count: number }[] {
  const counts: Record<number, number> = {};
  events.filter((e) => e.event_type === 'click_category' && e.category_id).forEach((e) => {
    counts[e.category_id!] = (counts[e.category_id!] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([id, count]) => ({ category_id: Number(id), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Conversion funnel: visits → product views → add-to-cart → checkout → orders. */
export function conversionFunnel(events: AnalyticsEvent[]): { step: string; count: number; rate: string }[] {
  const pageVisits = events.filter((e) => e.event_type === 'page_visit').length;
  const productViews = events.filter((e) => e.event_type === 'view_product' || e.event_type === 'click_product').length;
  const addToCarts = events.filter((e) => e.event_type === 'click_add_to_cart').length;
  const checkouts = events.filter((e) => e.event_type === 'click_checkout').length;
  const orders = events.filter((e) => e.event_type === 'order_placed').length;

  const steps = [
    { step: 'Page Visits', count: pageVisits },
    { step: 'Product Views', count: productViews },
    { step: 'Add to Cart', count: addToCarts },
    { step: 'Checkout', count: checkouts },
    { step: 'Orders', count: orders },
  ];

  return steps.map((s, i) => ({
    ...s,
    rate: i === 0 ? '100%' : pageVisits > 0 ? `${((s.count / pageVisits) * 100).toFixed(1)}%` : '0%',
  }));
}

/** Hourly distribution of events. */
export function hourlyDistribution(events: AnalyticsEvent[]): { hour: number; count: number }[] {
  const counts: Record<number, number> = {};
  events.forEach((e) => {
    const h = new Date(e.created_at).getHours();
    counts[h] = (counts[h] || 0) + 1;
  });
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: counts[h] || 0,
  }));
}

/** Average session duration (in seconds). */
export function avgSessionDuration(events: AnalyticsEvent[]): number {
  const sessions = new Map<string, { first: string; last: string }>();
  events.forEach((e) => {
    const existing = sessions.get(e.session_id);
    if (!existing) {
      sessions.set(e.session_id, { first: e.created_at, last: e.created_at });
    } else {
      if (e.created_at < existing.first) existing.first = e.created_at;
      if (e.created_at > existing.last) existing.last = e.created_at;
    }
  });
  if (sessions.size === 0) return 0;
  let total = 0;
  sessions.forEach((s) => {
    total += (new Date(s.last).getTime() - new Date(s.first).getTime()) / 1000;
  });
  return Math.round(total / sessions.size);
}

/** Bounce rate: sessions with only 1 page_visit. */
export function bounceRate(events: AnalyticsEvent[]): number {
  const sessions = new Map<string, number>();
  events.filter((e) => e.event_type === 'page_visit').forEach((e) => {
    sessions.set(e.session_id, (sessions.get(e.session_id) || 0) + 1);
  });
  if (sessions.size === 0) return 0;
  const bounces = [...sessions.values()].filter((c) => c === 1).length;
  return Math.round((bounces / sessions.size) * 100);
}

/** Pages per session (average). */
export function pagesPerSession(events: AnalyticsEvent[]): number {
  const sessions = new Map<string, number>();
  events.filter((e) => e.event_type === 'page_visit').forEach((e) => {
    sessions.set(e.session_id, (sessions.get(e.session_id) || 0) + 1);
  });
  if (sessions.size === 0) return 0;
  const total = [...sessions.values()].reduce((s, c) => s + c, 0);
  return +(total / sessions.size).toFixed(1);
}
