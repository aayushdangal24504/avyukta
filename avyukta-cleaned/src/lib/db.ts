import { schedulePush } from './supabase';

/**
 * AVYUKTA — client-side database layer.
 * Mirrors the SQL schema: users, categories, products, orders, order_items, settings.
 *
 * PRODUCTION-CLEAN BUILD:
 *   - Supabase is the only source of truth.
 *   - No demo data, no default settings, no auto-seeding.
 *   - localStorage is used only as a per-tab cache of cloud state.
 *   - If no data exists, the app shows empty states everywhere.
 */

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'customer';
  created_at: string;
}
export interface Category {
  id: number;
  name: string;
  image: string;
  sort_order: number;
}
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category_id: number;
  images: string[];
  images_detail: string[];
  is_featured: boolean;
  is_new: boolean;
  is_best: boolean;
  is_visible: boolean;
  created_at: string;
}
export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Delivered' | 'Cancelled';
export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
}
export interface Order {
  id: number;
  customer_name: string;
  phone: string;
  email: string;
  location: string;
  notes: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  user_id: number | null;
  tracking_code: string;
}

export interface DBShape {
  users: User[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  order_items: OrderItem[];
  settings: Record<string, string>;
  seq: Record<string, number>;
}

export const DB_KEY = 'avyukta_db_v1';
/** Bumped to invalidate any pre-existing local cache that contained demo data. */
export const CACHE_VERSION_KEY = 'avyukta_cache_version';
export const CACHE_VERSION = 'v2-production-clean';

/* ---------- password hashing (FNV-1a + salt rounds) ---------- */
export function hashPassword(pw: string): string {
  let h = 0x811c9dc5;
  const salted = 'avyukta::' + pw + '::salt';
  for (let r = 0; r < 64; r++) {
    for (let i = 0; i < salted.length; i++) {
      h ^= salted.charCodeAt(i) + r;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return 'pbk$' + h.toString(16) + '$' + salted.length.toString(16);
}
export function checkPassword(pw: string, hash: string): boolean {
  return hashPassword(pw) === hash;
}

/* ------------------------ empty DB factory ------------------------
 * Returns a completely empty DB. NO users, NO categories, NO products,
 * NO orders, NO settings. Used only when no cache exists yet.
 * NOTHING is ever auto-inserted from this module.
 * ----------------------------------------------------------------- */
function emptyDB(): DBShape {
  return {
    users: [],
    categories: [],
    products: [],
    orders: [],
    order_items: [],
    settings: {},
    seq: { users: 0, categories: 0, products: 0, orders: 0, order_items: 0 },
  };
}

/* ------------------------------ persistence ------------------------------ */
let cache: DBShape | null = null;

/**
 * One-time migration: if the browser still holds a pre-cleanup cache
 * (which contained demo products/categories/settings), wipe it.
 * Runs once per browser, then never again.
 */
function clearLegacyCacheOnce() {
  try {
    const v = localStorage.getItem(CACHE_VERSION_KEY);
    if (v !== CACHE_VERSION) {
      localStorage.removeItem(DB_KEY);
      localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);
    }
  } catch {
    /* localStorage unavailable — fine, in-memory only */
  }
}
clearLegacyCacheOnce();

export function getDB(): DBShape {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = JSON.parse(raw) as DBShape;
      // backfill new fields on older rows
      cache.products.forEach((p) => {
        if (typeof p.is_new !== 'boolean') p.is_new = false;
        if (typeof p.is_best !== 'boolean') p.is_best = false;
        if (!Array.isArray(p.images_detail)) p.images_detail = Array.isArray(p.images) ? [...p.images] : [];
        if (!Array.isArray(p.images)) p.images = [];
      });
      return cache;
    }
  } catch {
    /* corrupted — start empty (we never re-seed) */
  }
  cache = emptyDB();
  // Persist the empty shell so the app has a stable cache slot, but do NOT push
  // it to Supabase — we never want to overwrite cloud data with an empty shell.
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  return cache;
}

/** Save the local cache AND schedule a cloud diff-push. */
export function saveDB() {
  if (!cache) return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache));
  } catch {
    console.warn('AVYUKTA: storage quota exceeded; data kept in memory only.');
  }
  schedulePush(cache);
  window.dispatchEvent(new CustomEvent('avyukta-db-change'));
}

/** Replace the whole in-memory db (used only when hydrating from Supabase). */
export function replaceCache(shape: DBShape) {
  cache = shape;
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent('avyukta-db-change'));
}

export function nextId(table: keyof DBShape['seq']): number {
  const db = getDB();
  const rows = (db as unknown as Record<string, { id: number }[]>)[table] || [];
  const maxExisting = rows.reduce((m, r) => Math.max(m, r.id), 0);
  db.seq[table] = Math.max(db.seq[table] || 0, maxExisting) + 1;
  return db.seq[table];
}

/** Re-read the db from localStorage (called when another tab writes changes). */
export function reloadFromStorage() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = JSON.parse(raw) as DBShape;
      window.dispatchEvent(new CustomEvent('avyukta-db-change'));
    }
  } catch { /* keep current cache */ }
}

/* -------------------------------- helpers -------------------------------- */
export const sanitize = (s: string) => s.replace(/[<>]/g, '').trim();
export const validPhone = (p: string) => /^\d{7,15}$/.test(p.replace(/[\s()+-]/g, ''));
export const money = (n: number) => 'Rs. ' + n.toFixed(2);

export function getVisibleProducts(): Product[] {
  return getDB().products.filter((p) => p.is_visible);
}
export function getCategoriesSorted(): Category[] {
  return [...getDB().categories].sort((a, b) => a.sort_order - b.sort_order);
}
export function getOrderItems(orderId: number): OrderItem[] {
  return getDB().order_items.filter((i) => i.order_id === orderId);
}

/**
 * Read a setting. Returns '' (empty string) if the key is not present in
 * Supabase / local cache. NEVER returns demo/default content. Callers should
 * treat an empty return value as "not configured" and render an empty state.
 */
export function getSetting(key: string, fallback = ''): string {
  return getDB().settings[key] ?? fallback;
}

/** Has at least one admin user been created in this Supabase project? */
export function hasAnyAdmin(): boolean {
  return getDB().users.some((u) => u.role === 'admin');
}

/**
 * Cryptographically-strong tracking code (24-char hex, ~96 bits of entropy).
 * Falls back to Math.random in the unlikely event Web Crypto is unavailable.
 */
export function generateTrackingCode(): string {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

/** Look up an order by its tracking code. */
export function getOrderByTrackingCode(code: string): Order | null {
  if (!code) return null;
  return getDB().orders.find((o) => o.tracking_code === code) || null;
}

/** Create an order + its items, decrement stock. Returns the new order. */
export function createOrder(
  data: { customer_name: string; phone: string; email: string; location: string; notes: string; user_id: number | null },
  items: { product_id: number; quantity: number }[]
): Order {
  const db = getDB();
  let total = 0;
  const resolved = items
    .map((it) => {
      const p = db.products.find((pr) => pr.id === it.product_id);
      if (!p) return null;
      total += p.price * it.quantity;
      return { p, qty: it.quantity };
    })
    .filter(Boolean) as { p: Product; qty: number }[];

  const id = nextId('orders');
  const order: Order = {
    id,
    customer_name: sanitize(data.customer_name),
    phone: sanitize(data.phone),
    email: sanitize(data.email),
    location: sanitize(data.location),
    notes: sanitize(data.notes),
    total: Math.round(total * 100) / 100,
    status: 'Pending',
    created_at: new Date().toISOString(),
    user_id: data.user_id,
    tracking_code: generateTrackingCode(),
  };
  db.orders.push(order);
  resolved.forEach(({ p, qty }) => {
    db.order_items.push({ id: nextId('order_items'), order_id: id, product_id: p.id, product_name: p.name, price: p.price, quantity: qty });
    p.stock = Math.max(0, p.stock - qty);
  });
  saveDB();
  return order;
}
