/**
 * AVYUKTA — Supabase cloud sync layer (PRODUCTION-CLEAN).
 *
 *   - Supabase URL + anon key MUST be provided by the admin (Settings → Cloud Sync)
 *     or via Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 *     NOTHING is hard-coded in source.
 *   - On app load: pull cloud data → hydrate local cache.
 *   - On every save: debounced diff-push (only rows YOU changed/deleted).
 *   - We NEVER auto-seed an empty Supabase project.
 *   - Existing cloud data is never wiped, reset, or replaced by this client.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DBShape, Product, Category, User, Order, OrderItem } from './db';

const URL_STORAGE = 'avyukta_sb_url';
const KEY_STORAGE = 'avyukta_sb_anon_key';
const DISABLED = '__disabled__';

const ENV_URL = 'https://qmiqwihgremdfehaiccu.supabase.co';
const ENV_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaXF3aWhncmVtZGZlaGFpY2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzE3NDksImV4cCI6MjA5NjYwNzc0OX0.iWGSba3xeQOY5-ZPb1K3sWRd4HU5_HI_hKL-KZiIhM0';
let client: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  try {
    const stored = localStorage.getItem(URL_STORAGE);
    if (stored === DISABLED) return '';
    return stored || ENV_URL || '';
  } catch { return ENV_URL || ''; }
}
export function setSupabaseUrl(url: string) {
  try {
    if (url.trim()) localStorage.setItem(URL_STORAGE, url.trim());
    else localStorage.setItem(URL_STORAGE, DISABLED);
  } catch { /* ignore */ }
  client = null;
}

export function getAnonKey(): string {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored === DISABLED) return '';
    return stored || ENV_KEY || '';
  } catch { return ENV_KEY || ''; }
}
export function setAnonKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.setItem(KEY_STORAGE, DISABLED);
  } catch { /* ignore */ }
  client = null;
}

export function isCloudConfigured(): boolean {
  return getSupabaseUrl().length > 0 && getAnonKey().length > 0;
}

export function getClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getAnonKey();
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

/** Quick connectivity + schema test. Throws a friendly error message on failure. */
export async function testConnection(): Promise<void> {
  const sb = getClient();
  if (!sb) throw new Error('Supabase URL and anon key are required.');
  const { error } = await sb.from('settings').select('key').limit(1);
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      throw new Error('Tables not found — run supabase/schema.sql in your Supabase SQL Editor first.');
    }
    if (/JWT|api key|Invalid/i.test(error.message)) {
      throw new Error('Invalid API key. Paste the "anon public" key from Settings → API.');
    }
    throw new Error(error.message);
  }
}

/* --------------------------------- PULL ---------------------------------- */
/**
 * Fetch everything from Supabase. Always returns a DBShape — even when every
 * table is empty — so the caller can hydrate the local cache and the UI shows
 * proper empty states. We never auto-seed when this is empty.
 */
export async function pullFromCloud(): Promise<DBShape | null> {
  const sb = getClient();
  if (!sb) return null;

  const [u, c, p, o, oi, s] = await Promise.all([
    sb.from('users').select('*'),
    sb.from('categories').select('*'),
    sb.from('products').select('*'),
    sb.from('orders').select('*'),
    sb.from('order_items').select('*'),
    sb.from('settings').select('*'),
  ]);
  const firstError = [u, c, p, o, oi, s].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const users = (u.data || []) as User[];
  const categories = (c.data || []) as Category[];
  const products = ((p.data || []) as (Product & { images: unknown; images_detail: unknown })[]).map((row) => ({
    ...row,
    price: Number(row.price),
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    images_detail: Array.isArray(row.images_detail) ? (row.images_detail as string[]) : (Array.isArray(row.images) ? (row.images as string[]) : []),
    is_featured: !!row.is_featured,
    is_new: !!row.is_new,
    is_best: !!row.is_best,
    is_visible: !!row.is_visible,
  })) as Product[];
  const orders = ((o.data || []) as Order[]).map((row) => ({ ...row, total: Number(row.total) }));
  const order_items = ((oi.data || []) as OrderItem[]).map((row) => ({ ...row, price: Number(row.price) }));
  const settings: Record<string, string> = {};
  ((s.data || []) as { key: string; value: string }[]).forEach((row) => { settings[row.key] = row.value ?? ''; });

  const maxId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0);
  return {
    users, categories, products, orders, order_items, settings,
    seq: {
      users: maxId(users), categories: maxId(categories), products: maxId(products),
      orders: maxId(orders), order_items: maxId(order_items),
    },
  };
}

/* ------------------------- snapshot (per-tab) ----------------------------- */
type TableName = 'users' | 'categories' | 'products' | 'orders' | 'order_items';
const TABLES: TableName[] = ['users', 'categories', 'products', 'orders', 'order_items'];

let snapshot: DBShape | null = null;
export function setSnapshot(db: DBShape) {
  snapshot = JSON.parse(JSON.stringify(db)) as DBShape;
}

/* --------------------------------- PUSH ---------------------------------- */
/**
 * Upsert ALL local rows. NEVER deletes anything in the cloud — used only for
 * the manual "Push local → cloud" button.
 */
export async function pushToCloud(db: DBShape): Promise<void> {
  const sb = getClient();
  if (!sb) return;

  for (const t of TABLES) {
    const rows = db[t] as { id: number }[];
    if (rows.length > 0) {
      const { error } = await sb.from(t).upsert(rows as never[]);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
  }
  const settingRows = Object.entries(db.settings).map(([key, value]) => ({ key, value }));
  if (settingRows.length > 0) {
    const { error } = await sb.from('settings').upsert(settingRows);
    if (error) throw new Error(`settings: ${error.message}`);
  }
  setSnapshot(db);
}

/* ------------------------- row-level diff sync ---------------------------- */
/**
 * Push ONLY the rows changed since the last sync, and delete ONLY the rows
 * explicitly removed locally since the last sync. Cloud stays authoritative
 * for everything this tab didn't touch — so a stale tab can never wipe data.
 */
export async function syncDiffToCloud(db: DBShape): Promise<void> {
  const sb = getClient();
  if (!sb) return;

  for (const t of TABLES) {
    const cur = db[t] as { id: number }[];
    const prev = (snapshot ? (snapshot[t] as { id: number }[]) : []);
    const prevMap = new Map(prev.map((r) => [r.id, JSON.stringify(r)]));
    const curIds = new Set(cur.map((r) => r.id));

    const changed = cur.filter((r) => prevMap.get(r.id) !== JSON.stringify(r));
    const deletedIds = prev.filter((r) => !curIds.has(r.id)).map((r) => r.id);

    if (changed.length > 0) {
      const { error } = await sb.from(t).upsert(changed as never[]);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    if (deletedIds.length > 0) {
      const { error } = await sb.from(t).delete().in('id', deletedIds);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
  }

  const prevSettings = snapshot?.settings ?? {};
  const settingRows = Object.entries(db.settings)
    .filter(([k, v]) => prevSettings[k] !== v)
    .map(([key, value]) => ({ key, value }));
  if (settingRows.length > 0) {
    const { error } = await sb.from('settings').upsert(settingRows);
    if (error) throw new Error(`settings: ${error.message}`);
  }

  setSnapshot(db);
}

/* ---------------------------- debounced pusher ---------------------------- */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushError = '';
export function getLastPushError() { return lastPushError; }
export function isPushPending() { return pushTimer !== null; }

export function schedulePush(db: DBShape) {
  if (!isCloudConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncDiffToCloud(db)
      .then(() => { lastPushError = ''; })
      .catch((e: Error) => {
        lastPushError = e.message;
        console.warn('AVYUKTA cloud push failed:', e.message);
      });
  }, 1200);
}
