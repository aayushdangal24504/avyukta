/**
 * AVYUKTA — Supabase cloud sync layer.
 *
 * The app always works locally (localStorage). When an anon key is configured
 * (Admin → Settings → Cloud Sync), the database is mirrored to Supabase:
 *   - on app load:   pull cloud data → hydrate local cache
 *   - on every save: debounced push of all tables to the cloud
 *
 * Run `supabase/schema.sql` in the Supabase SQL Editor once to create tables.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DBShape, Product, Category, User, Order, OrderItem } from './db';

export const SUPABASE_URL = 'https://qmiqwihgremdfehaiccu.supabase.co';
/** Pre-configured publishable (anon) key — cloud sync works out of the box. */
const DEFAULT_ANON_KEY = 'sb_publishable_6piUSqwvKICc88rommwFGA_OkJzAqKp';
const KEY_STORAGE = 'avyukta_sb_anon_key';
const DISABLED = '__disabled__'; // sentinel: admin explicitly disconnected

let client: SupabaseClient | null = null;

export function getAnonKey(): string {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored === DISABLED) return '';
    return stored || DEFAULT_ANON_KEY;
  } catch { return DEFAULT_ANON_KEY; }
}
export function setAnonKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.setItem(KEY_STORAGE, DISABLED); // explicit disconnect
  } catch { /* ignore */ }
  client = null; // force re-create with the new key
}
export function isCloudConfigured(): boolean {
  return getAnonKey().length > 0;
}

export function getClient(): SupabaseClient | null {
  const key = getAnonKey();
  if (!key) return null;
  if (!client) client = createClient(SUPABASE_URL, key);
  return client;
}

/** Quick connectivity + schema test. Throws a friendly error message on failure. */
export async function testConnection(): Promise<void> {
  const sb = getClient();
  if (!sb) throw new Error('No API key configured.');
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
/** Fetch everything from Supabase. Returns null if the cloud db is empty. */
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

  // empty cloud project → caller should seed it by pushing local data up
  if (users.length === 0 && categories.length === 0 && products.length === 0) return null;

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
/* Each tab remembers the state it last synced with the cloud. Pushes are
 * computed as a DIFF against this snapshot, so a tab only ever writes rows
 * IT changed and only deletes rows IT explicitly deleted. A tab with stale
 * data can therefore NEVER wipe newer products created elsewhere. */
type TableName = 'users' | 'categories' | 'products' | 'orders' | 'order_items';
const TABLES: TableName[] = ['users', 'categories', 'products', 'orders', 'order_items'];

let snapshot: DBShape | null = null;
export function setSnapshot(db: DBShape) {
  snapshot = JSON.parse(JSON.stringify(db)) as DBShape;
}

/* --------------------------------- PUSH ---------------------------------- */
/** Upsert ALL local rows. NEVER deletes anything in the cloud — used only for
 *  seeding an empty cloud project and the manual "Push local → cloud" button. */
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
  setSnapshot(db); // future auto-pushes diff against this state
}

/* ------------------------- row-level diff sync ---------------------------- */
/** Push ONLY the rows changed since the last sync, and delete ONLY the rows
 *  explicitly removed locally since the last sync. Cloud stays authoritative
 *  for everything this tab didn't touch. */
export async function syncDiffToCloud(db: DBShape): Promise<void> {
  const sb = getClient();
  if (!sb) return;

  for (const t of TABLES) {
    const cur = db[t] as { id: number }[];
    const prev = (snapshot ? (snapshot[t] as { id: number }[]) : []);
    const prevMap = new Map(prev.map((r) => [r.id, JSON.stringify(r)]));
    const curIds = new Set(cur.map((r) => r.id));

    // new or modified rows only
    const changed = cur.filter((r) => prevMap.get(r.id) !== JSON.stringify(r));
    // rows this tab explicitly deleted (were in OUR last-synced state, gone now)
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

  // settings: only keys whose value actually changed
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
/** True while a debounced push is queued (used to avoid pulling over unsaved changes). */
export function isPushPending() { return pushTimer !== null; }

/** Called by db.saveDB() after every local write. No-op without a key.
 *  Uses row-level DIFF sync — never replaces or prunes the whole dataset. */
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
