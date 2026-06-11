import { schedulePush } from './supabase';

/**
 * AVYUKTA — client-side database layer.
 * Mirrors the SQL schema: users, categories, products, orders, order_items, settings.
 * Persisted in localStorage. All reads/writes go through this module
 * (the equivalent of parameterized queries — no raw string interpolation anywhere).
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
  images: string[];        // shop-card crops (grid thumbnails)
  images_detail: string[]; // product-page crops (large photo inside the item)
  is_featured: boolean;
  is_new: boolean; // shown in the "New Arrivals" section + "New" badge
  is_best: boolean; // shown in the "Best Sellers" section + "Best Seller" badge
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
  location: string;
  notes: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  user_id: number | null;
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

/* ---------- password hashing (FNV-1a + salt rounds, demo-grade) ---------- */
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

/* --------------------------- default settings ---------------------------- */
/** Every storefront text the admin can edit lives here. Old saved databases
 *  automatically fall back to these defaults for any missing key. */
export const SETTING_DEFAULTS: Record<string, string> = {
  store_name: 'AVYUKTA',
  tagline: 'Handmade with love, gifted with meaning',
  hero_title: 'Gifts made by hand,\nstraight from the heart',
  hero_subtitle: 'Discover one-of-a-kind handmade candles, crochet flowers, resin keepsakes and luxury hampers — crafted slowly, lovingly, just for you.',
  hero_cta: 'Shop the Collection',
  hero_cta2: 'Explore Categories',
  hero_stats: '100% | Handmade\n1.2k+ | Happy gifts\n★ 4.9 | Avg. rating',
  categories_kicker: 'Curated with love',
  categories_title: 'Shop by Category',
  featured_kicker: 'Hand-picked for you',
  featured_title: 'Featured Treasures',
  new_title: 'New Arrivals 🌷',
  best_title: 'Best Sellers 💖',
  about_kicker: 'Our story',
  about_title: 'Every piece begins\nwith a feeling 🤍',
  about_text: 'AVYUKTA was born from a small desk, a glue gun, and an enormous love for making people feel seen. Each candle is poured by hand, every petal crocheted one loop at a time, and all our hampers are arranged like tiny works of art — because gifts should carry meaning, not barcodes.',
  about_points: 'Hand-crafted in small batches\nPersonalization on every order\nEco-friendly wrapping & materials\nCash on delivery — pay when it arrives',
  testimonials_kicker: 'Love letters',
  testimonials_title: 'What our customers say',
  testimonials: 'Rita K. | The crochet bouquet made my mom cry happy tears. Insanely beautiful packaging too — it felt like unwrapping a treasure.\nNour S. | Ordered the gift hamper for my best friend’s birthday. The attention to detail is unreal. Will absolutely order again!\nJana M. | Candles smell divine and the pressed-flower frame is now the prettiest thing in my living room. Fast, kind service.\nAya T. | You can feel the love in every piece. The resin necklace gets me compliments every single day. Thank you AVYUKTA! 🌸',
  payment_text: 'Cash on delivery — pay when your gift arrives. We confirm every order personally by phone.',
  phone: '+1 (555) 010-2030',
  address: '24 Blossom Street, Artisan Quarter',
  instagram: 'https://instagram.com/avyukta',
  facebook: 'https://facebook.com/avyukta',
  whatsapp: 'https://wa.me/15550102030',
  logo: '',
};

/* ------------------------------- seed data ------------------------------- */
function seed(): DBShape {
  const now = new Date();
  const day = (n: number) => new Date(now.getTime() - n * 864e5).toISOString();
  const db: DBShape = {
    users: [
      { id: 1, username: 'admin', password_hash: hashPassword('admin123'), role: 'admin', created_at: day(30) },
    ],
    categories: [
      { id: 1, name: 'Candles & Aromas', image: 'images/cat1.jpg', sort_order: 0 },
      { id: 2, name: 'Crochet & Fabric', image: 'images/cat2.jpg', sort_order: 1 },
      { id: 3, name: 'Gift Hampers', image: 'images/cat3.jpg', sort_order: 2 },
    ],
    products: [
      { id: 1, name: 'Rose Petal Candle Set', description: 'A trio of hand-poured soy candles infused with rose, vanilla and amber. Each candle is topped with real dried rose petals and burns for 30+ hours. Comes in a beautiful keepsake box — the perfect cozy gift.', price: 34.99, stock: 18, category_id: 1, images: ['images/p1.jpg'], images_detail: ['images/p1.jpg'], is_featured: true, is_new: false, is_best: true, is_visible: true, created_at: day(20) },
      { id: 2, name: 'Crochet Tulip Bouquet', description: 'A bouquet of everlasting tulips and roses, hand-crocheted petal by petal with premium soft yarn. Wrapped in kraft paper with a satin ribbon. Flowers that never wilt — love that never fades.', price: 42.5, stock: 9, category_id: 2, images: ['images/p2.jpg'], images_detail: ['images/p2.jpg'], is_featured: true, is_new: false, is_best: true, is_visible: true, created_at: day(15) },
      { id: 3, name: 'Pressed Flower Resin Jewelry', description: 'Delicate pendant & earring set with real pressed wildflowers preserved in crystal-clear resin. Every piece is one of a kind, hand-set with hypoallergenic rose-gold findings.', price: 28.0, stock: 14, category_id: 3, images: ['images/p3.jpg'], images_detail: ['images/p3.jpg'], is_featured: true, is_new: false, is_best: true, is_visible: true, created_at: day(12) },
      { id: 4, name: 'Blush Luxury Gift Hamper', description: 'Our signature hamper: handmade chocolates, a mini soy candle, dried flowers and a hand-written note card, beautifully arranged in a reusable blush box. Fully customizable on request.', price: 64.99, stock: 6, category_id: 3, images: ['images/p4.jpg'], images_detail: ['images/p4.jpg'], is_featured: true, is_new: true, is_best: false, is_visible: true, created_at: day(9) },
      { id: 5, name: 'Botanical Pressed Flower Frame', description: 'Real garden roses and wildflowers, pressed by hand and arranged into a golden frame. A romantic piece of wall art that keeps a moment of spring alive forever.', price: 39.0, stock: 11, category_id: 3, images: ['images/p5.jpg'], images_detail: ['images/p5.jpg'], is_featured: false, is_new: true, is_best: false, is_visible: true, created_at: day(6) },
      { id: 6, name: 'Rose & Lavender Soap Bars', description: 'Cold-process artisan soaps with rose petals, lavender buds, shea butter and essential oils. Gentle, nourishing and almost too pretty to use. Set of three, wrapped with twine.', price: 19.5, stock: 3, category_id: 1, images: ['images/p6.jpg'], images_detail: ['images/p6.jpg'], is_featured: false, is_new: true, is_best: false, is_visible: true, created_at: day(3) },
    ],
    orders: [
      { id: 1, customer_name: 'Sara Malek', phone: '7785551234', location: '12 Rosewood Lane, Springfield', notes: 'Please gift wrap 💝', total: 77.49, status: 'Delivered', created_at: day(6), user_id: null },
      { id: 2, customer_name: 'Lina Haddad', phone: '5550192834', location: '8 Maple Court, Riverdale', notes: '', total: 42.5, status: 'Shipped', created_at: day(3), user_id: null },
      { id: 3, customer_name: 'Maya Aoun', phone: '96170123456', location: 'Beirut, Achrafieh, Sassine Sq.', notes: 'Call before delivery', total: 93.99, status: 'Pending', created_at: day(1), user_id: null },
    ],
    order_items: [
      { id: 1, order_id: 1, product_id: 1, product_name: 'Rose Petal Candle Set', price: 34.99, quantity: 1 },
      { id: 2, order_id: 1, product_id: 3, product_name: 'Pressed Flower Resin Jewelry', price: 28.0, quantity: 1 },
      { id: 3, order_id: 1, product_id: 6, product_name: 'Rose & Lavender Soap Bars', price: 19.5, quantity: 1 },
      { id: 4, order_id: 2, product_id: 2, product_name: 'Crochet Tulip Bouquet', price: 42.5, quantity: 1 },
      { id: 5, order_id: 3, product_id: 4, product_name: 'Blush Luxury Gift Hamper', price: 64.99, quantity: 1 },
      { id: 6, order_id: 3, product_id: 6, product_name: 'Rose & Lavender Soap Bars', price: 19.5, quantity: 1 },
    ],
    settings: { ...SETTING_DEFAULTS },
    seq: { users: 1, categories: 3, products: 6, orders: 3, order_items: 6 },
  };
  return db;
}

/* ------------------------------ persistence ------------------------------ */
let cache: DBShape | null = null;

export function getDB(): DBShape {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = JSON.parse(raw) as DBShape;
      // migration: older saved data may predate the is_new / is_best / images_detail fields
      cache.products.forEach((p) => {
        if (typeof p.is_new !== 'boolean') p.is_new = false;
        if (typeof p.is_best !== 'boolean') p.is_best = false;
        if (!Array.isArray(p.images_detail)) p.images_detail = [...p.images];
      });
      return cache;
    }
  } catch {
    /* corrupted — reseed */
  }
  cache = seed();
  saveDB();
  return cache;
}

export function saveDB() {
  if (cache) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(cache));
    } catch {
      // storage quota exceeded (large images) — keep in-memory copy alive
      console.warn('AVYUKTA: storage quota exceeded; data kept in memory only.');
    }
    schedulePush(cache); // mirror changes to Supabase (no-op until a key is configured)
  }
  window.dispatchEvent(new CustomEvent('avyukta-db-change'));
}

/** Replace the whole in-memory db (used when hydrating from Supabase).
 *  Persists locally and re-renders, but does NOT push back to the cloud. */
export function replaceCache(shape: DBShape) {
  cache = shape;
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent('avyukta-db-change'));
}

export function nextId(table: keyof DBShape['seq']): number {
  const db = getDB();
  // collision-proof: never go below the highest id actually present
  // (protects against stale counters when data arrived from the cloud or another tab)
  const rows = (db as unknown as Record<string, { id: number }[]>)[table] || [];
  const maxExisting = rows.reduce((m, r) => Math.max(m, r.id), 0);
  db.seq[table] = Math.max(db.seq[table] || 0, maxExisting) + 1;
  return db.seq[table];
}

/** Re-read the db from localStorage (called when ANOTHER TAB writes changes,
 *  so this tab never holds stale data that could overwrite newer rows). */
export function reloadFromStorage() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = JSON.parse(raw) as DBShape;
      window.dispatchEvent(new CustomEvent('avyukta-db-change'));
    }
  } catch { /* keep current cache */ }
}

export function resetDB() {
  cache = seed();
  saveDB();
}

/* -------------------------------- helpers -------------------------------- */
export const sanitize = (s: string) => s.replace(/[<>]/g, '').trim(); // XSS guard for stored strings
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
export function getSetting(key: string, fallback = ''): string {
  return getDB().settings[key] ?? SETTING_DEFAULTS[key] ?? fallback;
}

/** Create an order + its items, decrement stock. Returns the new order id. */
export function createOrder(
  data: { customer_name: string; phone: string; location: string; notes: string; user_id: number | null },
  items: { product_id: number; quantity: number }[]
): number {
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
  db.orders.push({
    id,
    customer_name: sanitize(data.customer_name),
    phone: sanitize(data.phone),
    location: sanitize(data.location),
    notes: sanitize(data.notes),
    total: Math.round(total * 100) / 100,
    status: 'Pending',
    created_at: new Date().toISOString(),
    user_id: data.user_id,
  });
  resolved.forEach(({ p, qty }) => {
    db.order_items.push({ id: nextId('order_items'), order_id: id, product_id: p.id, product_name: p.name, price: p.price, quantity: qty });
    p.stock = Math.max(0, p.stock - qty);
  });
  saveDB();
  return id;
}
