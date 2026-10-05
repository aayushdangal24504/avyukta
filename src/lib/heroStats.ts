/**
 * Hero stats — CALCULATED from the store's own database rows.
 *
 * The homepage hero used to render the free-text `hero_stats` setting, which
 * shipped with invented figures: "100% | Handmade", "1.2k+ | Happy gifts" and
 * "★ 4.9 | Avg. rating" — not one of them backed by data.
 *
 * Every stat below is derived from real rows instead:
 *
 *   Handmade designs → products that are visible in the storefront
 *   Gifts delivered  → units on orders whose status is Delivered
 *   Avg. rating      → mean of the explicit 1–5 ratings left in reviews
 *
 * A stat is returned ONLY when there is real data behind it: an empty store
 * shows no stats, a store with nothing delivered shows no delivery count, and
 * the rating appears with the first rated review — never before. No code path
 * here can invent a number.
 *
 * Pure module: it imports types only, so it runs under bare Node (tests) and is
 * safe to call during render.
 */
import type { DBShape, Order, OrderItem, Product } from './db';

export interface HeroStat {
  /** The figure shown large in the hero. */
  value: string;
  /** The caption underneath it. */
  label: string;
}

/** The slice of the DB the hero needs (Partial — a bad shape must never crash). */
export type HeroStatsSource = Partial<
  Pick<DBShape, 'products' | 'orders' | 'order_items' | 'settings'>
>;

/** Whole, non-negative units — tolerates string/garbage quantities from Postgres. */
function units(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 1200 → "1,200". Exact counts only — never a "1000+" style claim. */
function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** An order counts as delivered on any "Delivered…" status. */
function isDelivered(order: Order): boolean {
  return typeof order?.status === 'string' && order.status.startsWith('Delivered');
}

/**
 * Explicit customer ratings, read from the same "Name | rating | text" format
 * the storefront renders. Lines without a real 1–5 number are ignored, so an
 * unrated (legacy) review can neither raise nor lower the average.
 */
export function parseRatedReviews(raw: string): number[] {
  return (raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length < 3) return null; // legacy review — no rating attached
      const n = Number(parts[1]);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
    })
    .filter((n): n is number => n !== null);
}

/** Real hero stats, in display order. Omitted when there is nothing to back them. */
export function computeHeroStats(db: HeroStatsSource): HeroStat[] {
  const products = (db.products ?? []) as Product[];
  const orders = (db.orders ?? []) as Order[];
  const items = (db.order_items ?? []) as OrderItem[];
  const settings = db.settings ?? {};

  const stats: HeroStat[] = [];

  /* 1. Catalogue size — visible products, the same set the shop shows. */
  const designs = products.filter((p) => p?.is_visible).length;
  if (designs > 0) {
    stats.push({
      value: count(designs),
      label: designs === 1 ? 'Handmade design' : 'Handmade designs',
    });
  }

  /* 2. Gifts delivered — units on orders that actually reached the customer. */
  const deliveredOrders = new Set(orders.filter(isDelivered).map((o) => o.id));
  const delivered = items.reduce(
    (sum, item) => (deliveredOrders.has(item?.order_id) ? sum + units(item.quantity) : sum),
    0
  );
  if (delivered > 0) {
    stats.push({
      value: count(delivered),
      label: delivered === 1 ? 'Gift delivered' : 'Gifts delivered',
    });
  }

  /* 3. Average rating — only from reviews that carry an explicit rating. */
  const ratings = parseRatedReviews(settings.testimonials ?? '');
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    stats.push({ value: `★ ${avg.toFixed(1)}`, label: 'Avg. rating' });
  }

  return stats;
}
