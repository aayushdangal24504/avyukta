/**
 * Cart maths — pure, dependency-free and unit-tested.
 *
 * The cart is the one place in this app where a small mistake shows up
 * immediately to the customer ("I added 1, it says 3" / "2 items, total for 1").
 * Every rule therefore lives here as a pure function so it can be reasoned
 * about and tested without rendering anything:
 *
 *   - `product_id` is ALWAYS a finite number. A cart that was hand-edited,
 *     written by an older build, or synced from a different device can hold
 *     "5" instead of 5 — that used to make `find()` miss and silently create a
 *     SECOND line for the same product.
 *   - `quantity` is ALWAYS a positive integer. Zero/negative/NaN lines are
 *     dropped, never stored.
 *   - A product appears AT MOST ONCE. Duplicates are merged.
 *   - Quantities are clamped to available stock, so the badge, the drawer and
 *     the order total can never disagree with what actually exists.
 *   - All money maths is rounded to 2 decimals at the boundary, so
 *     `Rs. 0.1 * 3` can never surface as `Rs. 0.30000000000000004`.
 */

export interface CartLine {
  product_id: number;
  quantity: number;
}

export interface CartLimits {
  /** Max units allowed for a product. `0`/missing means "no stock left". */
  stock?: number;
}

/** Coerce anything into a finite number, or `null` when that is impossible. */
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Round to 2 decimals without the usual float dust (1.005 -> 1.01). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Max units a customer may hold of `productId` given what is already in the
 * cart and how much stock exists. Always at least 0.
 */
export function maxSelectable(
  productId: number,
  current: CartLine[],
  limits: CartLimits
): number {
  const stock = limits.stock;
  if (stock === undefined || stock === null) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  const already = current.find((l) => l.product_id === productId)?.quantity ?? 0;
  return Math.max(0, Math.floor(stock) - already);
}

/**
 * Turn anything (a parsed localStorage blob, a cloud payload, a hand-edited
 * value) into a trustworthy cart.
 *
 * - keeps insertion order of first appearance
 * - merges duplicate lines of the same product
 * - drops lines with an unusable id or a non-positive quantity
 * - clamps each line to the product's stock when a resolver is supplied
 */
export function normalizeCart(
  raw: unknown,
  resolve?: (id: number) => CartLimits | null | undefined
): CartLine[] {
  if (!Array.isArray(raw)) return [];

  const merged = new Map<number, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = toFiniteNumber(row.product_id);
    if (id === null) continue;
    const productId = Math.trunc(id);
    if (!Number.isFinite(productId) || productId <= 0) continue;

    const qty = toFiniteNumber(row.quantity);
    if (qty === null) continue;
    // Round rather than floor so "2" typed as 2.0000001 is not dropped to 2.
    const units = Math.round(qty);
    if (units <= 0) continue;

    merged.set(productId, (merged.get(productId) ?? 0) + units);
  }

  const out: CartLine[] = [];
  for (const [productId, units] of merged) {
    const limit = resolve?.(productId);
    if (limit === null || limit === undefined) {
      // Resolver supplied but the product is gone / not sellable -> drop it.
      if (resolve) continue;
      out.push({ product_id: productId, quantity: units });
      continue;
    }
    const stock = toFiniteNumber(limit.stock);
    if (stock === null) {
      out.push({ product_id: productId, quantity: units });
      continue;
    }
    const capped = Math.min(units, Math.max(0, Math.floor(stock)));
    if (capped > 0) out.push({ product_id: productId, quantity: capped });
  }
  return out;
}

/**
 * Add `qty` units of `productId`, clamped to the remaining stock.
 * Returns the same array reference when nothing changes so React can bail out
 * of a re-render (important: the store persists the cart on every change).
 */
export function addToLines(
  lines: CartLine[],
  productId: number,
  qty: number,
  limits: CartLimits = {}
): CartLine[] {
  const units = Math.round(toFiniteNumber(qty) ?? 0);
  if (units <= 0) return lines;
  const room = maxSelectable(productId, lines, limits);
  if (room <= 0) return lines;

  const existing = lines.find((l) => l.product_id === productId);
  if (!existing) {
    return [...lines, { product_id: productId, quantity: Math.min(units, room) }];
  }
  return lines.map((l) =>
    l.product_id === productId
      ? { ...l, quantity: l.quantity + Math.min(units, room) }
      : l
  );
}

/** Set an absolute quantity. `0` (or less) removes the line. */
export function setLineQty(
  lines: CartLine[],
  productId: number,
  qty: number,
  limits: CartLimits = {}
): CartLine[] {
  const units = Math.round(toFiniteNumber(qty) ?? 0);
  if (units <= 0) return lines.filter((l) => l.product_id !== productId);

  const stock = toFiniteNumber(limits.stock);
  const capped =
    stock === null ? units : Math.min(units, Math.max(0, Math.floor(stock)));

  const exists = lines.some((l) => l.product_id === productId);
  if (capped <= 0) return exists ? lines.filter((l) => l.product_id !== productId) : lines;
  if (!exists) return [...lines, { product_id: productId, quantity: capped }];
  return lines.map((l) => (l.product_id === productId ? { ...l, quantity: capped } : l));
}

export function removeLine(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((l) => l.product_id !== productId);
}

/** Total number of units in the cart — this is what the navbar badge shows. */
export function countUnits<T extends { quantity: number }>(lines: readonly T[]): number {
  return lines.reduce((sum, l) => sum + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
}

/**
 * Subtotal for the given lines. `priceOf` returns the CURRENT unit price.
 * Rounded once, at the end, to avoid float drift.
 */
export function subtotalOf(
  lines: CartLine[],
  priceOf: (productId: number) => number
): number {
  const raw = lines.reduce((sum, l) => {
    const price = toFiniteNumber(priceOf(l.product_id));
    if (price === null) return sum;
    return sum + price * l.quantity;
  }, 0);
  return roundMoney(raw);
}

/* -------------------------------------------------------------------------- */
/*                        resolving cart against the catalog                    */
/* -------------------------------------------------------------------------- */

export interface SellableProduct {
  id: number;
  price: number;
  /** Units that can actually be bought right now (0 when hidden or out). */
  available: number;
}

export interface ResolvedLine<T extends SellableProduct> {
  product: T;
  quantity: number;
  /** Units of this product still addable on top of `quantity`. */
  remaining: number;
  /** Rounded price × quantity — the figure the drawer/checkout line shows. */
  lineTotal: number;
}

/**
 * Join the stored cart to the live catalog.
 *
 * This is the single place that decides what the customer actually sees, and
 * the badge count, the drawer rows and the order total are all derived from its
 * output — which is what guarantees they can never disagree. Lines for products
 * that were deleted, hidden, or that ran out of stock are dropped here rather
 * than lingering in storage.
 */
export function resolveCart<T extends SellableProduct>(
  lines: readonly (CartLine | null | undefined)[],
  products: readonly T[]
): ResolvedLine<T>[] {
  const byId = new Map<number, T>();
  for (const p of products) {
    const id = toFiniteNumber(p.id);
    if (id !== null) byId.set(id, p);
  }

  const out: ResolvedLine<T>[] = [];
  for (const line of lines) {
    if (!line) continue;
    const rawId = toFiniteNumber((line as CartLine).product_id);
    if (rawId === null) continue;
    const product = byId.get(rawId);
    if (!product) continue;
    const available = Math.max(0, Math.floor(toFiniteNumber(product.available) ?? 0));
    if (available <= 0) continue;
    const quantity = Math.min(Math.max(0, Math.round(toFiniteNumber(line.quantity) ?? 0)), available);
    if (quantity <= 0) continue;
    const price = toFiniteNumber(product.price) ?? 0;
    out.push({
      product,
      quantity,
      remaining: available - quantity,
      lineTotal: roundMoney(price * quantity),
    });
  }
  return out;
}

/** Grand total for a resolved cart: the sum of the rounded line totals. */
export function resolvedTotal(lines: readonly { lineTotal: number }[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + toFiniteNumber(l.lineTotal)!, 0));
}
