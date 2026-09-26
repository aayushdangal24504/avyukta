import { schedulePush } from './supabase';
import { roundMoney } from './cart';

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
export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Confirmed and being prepared'
  | 'Shipped'
  | 'Shipped(on the way)'
  | 'Delivered'
  | 'Cancelled';

/** Canonical status → the colour/label helpers in ui.tsx key off these. */
export const ORDER_STATUSES: OrderStatus[] = [
  'Pending',
  'Confirmed',
  'Confirmed and being prepared',
  'Shipped',
  'Shipped(on the way)',
  'Delivered',
  'Cancelled',
];

/** Collapse a display status onto the colour family it belongs to. */
export function statusFamily(status: string): 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' {
  if (status === 'Cancelled') return 'cancelled';
  if (status.startsWith('Delivered')) return 'delivered';
  if (status.startsWith('Shipped')) return 'shipped';
  if (status.startsWith('Confirmed')) return 'confirmed';
  return 'pending';
}

/** Tailwind classes per status family — one source of truth for every badge. */
export const STATUS_STYLES: Record<ReturnType<typeof statusFamily>, string> = {
  pending: 'bg-amber-100 text-amber-700 ring-amber-300',
  confirmed: 'bg-blue-100 text-blue-700 ring-blue-300',
  shipped: 'bg-purple-100 text-purple-700 ring-purple-300',
  delivered: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
  cancelled: 'bg-red-100 text-red-700 ring-red-300',
};

export const statusStyle = (status: string) => STATUS_STYLES[statusFamily(status)];
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

/** Coerce a JSON/Postgres value into a real number (numeric cols arrive as
 *  strings; without this `price.toFixed()` throws and the site white-screens). */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown, fallback = 0): number {
  return Math.trunc(num(v, fallback));
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v);

/** Repair one product row: numbers are numbers, images are arrays. */
function normalizeProduct(p: Product): Product {
  const images = Array.isArray(p.images) ? p.images.filter((s) => typeof s === 'string' && s) : [];
  const detail = Array.isArray(p.images_detail) ? p.images_detail.filter((s) => typeof s === 'string' && s) : [];
  return {
    ...p,
    id: toInt(p.id),
    name: str(p.name),
    description: str(p.description),
    price: Math.max(0, num(p.price)),
    stock: Math.max(0, toInt(p.stock)),
    category_id: toInt(p.category_id),
    images,
    images_detail: detail.length ? detail : [...images],
    is_featured: !!p.is_featured,
    is_new: !!p.is_new,
    is_best: !!p.is_best,
    is_visible: !!p.is_visible,
    created_at: str(p.created_at, new Date(0).toISOString()),
  };
}

/** Same treatment for every table — cheap insurance against a bad row. */
function normalizeShape(shape: Partial<DBShape> | null | undefined): DBShape {
  const s = (shape || {}) as Partial<DBShape>;
  const settings: Record<string, string> = {};
  if (s.settings && typeof s.settings === 'object') {
    for (const [k, v] of Object.entries(s.settings)) settings[k] = str(v);
  }
  return {
    users: (Array.isArray(s.users) ? s.users : []).map((u) => ({
      ...u,
      id: toInt(u.id),
      username: str(u.username),
      password_hash: str(u.password_hash),
      role: u.role === 'admin' ? 'admin' : 'customer',
      created_at: str(u.created_at, new Date(0).toISOString()),
    })),
    categories: (Array.isArray(s.categories) ? s.categories : []).map((c) => ({
      ...c,
      id: toInt(c.id),
      name: str(c.name),
      image: str(c.image),
      sort_order: toInt(c.sort_order),
    })),
    products: (Array.isArray(s.products) ? s.products : []).map(normalizeProduct),
    orders: (Array.isArray(s.orders) ? s.orders : []).map((o) => ({
      ...o,
      id: toInt(o.id),
      customer_name: str(o.customer_name),
      phone: str(o.phone),
      email: str(o.email),
      location: str(o.location),
      notes: str(o.notes),
      total: Math.max(0, num(o.total)),
      status: str(o.status, 'Pending') as OrderStatus,
      user_id: o.user_id === null || o.user_id === undefined ? null : toInt(o.user_id),
      tracking_code: str(o.tracking_code),
      created_at: str(o.created_at, new Date(0).toISOString()),
    })),
    order_items: (Array.isArray(s.order_items) ? s.order_items : []).map((i) => ({
      ...i,
      id: toInt(i.id),
      order_id: toInt(i.order_id),
      product_id: toInt(i.product_id),
      product_name: str(i.product_name),
      price: Math.max(0, num(i.price)),
      quantity: Math.max(0, toInt(i.quantity)),
    })),
    settings,
    seq: (s.seq && typeof s.seq === 'object' ? s.seq : {}) as DBShape['seq'],
  };
}

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
      // normalizeShape repairs rows written by older builds (missing columns,
      // string prices, non-array images) instead of trusting them blindly.
      cache = normalizeShape(JSON.parse(raw) as DBShape);
      return cache;
    }
  } catch {
    /* corrupted — start empty (we never re-seed) */
  }
  cache = normalizeShape(emptyDB());
  // Persist the empty shell so the app has a stable cache slot, but do NOT push
  // it to Supabase — we never want to overwrite cloud data with an empty shell.
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  return cache;
}

/** Save the local cache and, unless disabled, schedule a cloud diff-push. */
export function saveDB(scheduleCloudPush = true) {
  if (!cache) return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache));
  } catch {
    console.warn('AVYUKTA: storage quota exceeded; data kept in memory only.');
  }
  if (scheduleCloudPush) schedulePush(cache);
  window.dispatchEvent(new CustomEvent('avyukta-db-change'));
}

/** Replace the whole in-memory db (used only when hydrating from Supabase). */
export function replaceCache(shape: DBShape) {
  cache = normalizeShape(shape);
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
      cache = normalizeShape(JSON.parse(raw) as DBShape);
      window.dispatchEvent(new CustomEvent('avyukta-db-change'));
    }
  } catch { /* keep current cache */ }
}

/* -------------------------------- helpers -------------------------------- */
export const sanitize = (s: string) => s.replace(/[<>]/g, '').trim();
export const validPhone = (p: string) => /^\d{7,15}$/.test(p.replace(/[\s()+-]/g, ''));

/**
 * Format money. Tolerates anything — a string price from Postgres, undefined,
 * NaN — because a price must NEVER be able to crash a render.
 */
export const money = (n: unknown) => 'Rs. ' + roundMoney(num(n)).toFixed(2);

/** How many units of a product a customer may still add to their cart. */
export const sellableStock = (p: Product) => (p.is_visible ? Math.max(0, toInt(p.stock)) : 0);

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

export interface OrderDraftItem {
  product_id: number;
  quantity: number;
}

export class OrderError extends Error {}

/**
 * Create an order + its items, decrementing stock.
 *
 * Everything is re-validated here against the CURRENT catalog rather than
 * trusting the cart that was rendered a moment ago, so the total stored on the
 * order is guaranteed to equal the sum of its line items.
 */
export function createOrder(
  data: { customer_name: string; phone: string; email: string; location: string; notes: string; user_id: number | null },
  items: OrderDraftItem[]
): Order {
  const db = getDB();

  // Merge duplicate product lines, drop unusable ones.
  const wanted = new Map<number, number>();
  for (const raw of Array.isArray(items) ? items : []) {
    const id = toInt(raw?.product_id);
    const qty = Math.round(num(raw?.quantity));
    if (id <= 0 || qty <= 0) continue;
    wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }

  const resolved: { p: Product; qty: number }[] = [];
  for (const [id, requested] of wanted) {
    const p = db.products.find((pr) => pr.id === id);
    if (!p) continue; // product vanished between checkout render and submit
    const available = sellableStock(p);
    const qty = Math.min(requested, available);
    if (qty <= 0) continue;
    resolved.push({ p, qty });
  }

  if (resolved.length === 0) {
    throw new OrderError('None of the items in your cart are available any more.');
  }
  const short = resolved.find(({ p, qty }) => qty < (wanted.get(p.id) ?? 0));
  if (short) {
    throw new OrderError(
      `Only ${short.qty} × ${short.p.name} left in stock. Please update your cart.`
    );
  }

  // Price snapshot + total come from the SAME resolved lines, so they can
  // never disagree with each other.
  const lines = resolved.map(({ p, qty }) => ({
    id: nextId('order_items'),
    product_id: p.id,
    product_name: p.name,
    price: roundMoney(p.price),
    quantity: qty,
  }));
  const total = roundMoney(lines.reduce((s, l) => s + l.price * l.quantity, 0));

  const id = nextId('orders');
  const order: Order = {
    id,
    customer_name: sanitize(data.customer_name),
    phone: sanitize(data.phone),
    email: sanitize(data.email),
    location: sanitize(data.location),
    notes: sanitize(data.notes),
    total,
    status: 'Pending',
    created_at: new Date().toISOString(),
    user_id: data.user_id,
    tracking_code: generateTrackingCode(),
  };

  db.orders.push(order);
  for (const l of lines) {
    db.order_items.push({ ...l, order_id: id });
    const p = resolved.find((r) => r.p.id === l.product_id)!.p;
    p.stock = Math.max(0, p.stock - l.quantity);
  }
  saveDB();
  return order;
}
