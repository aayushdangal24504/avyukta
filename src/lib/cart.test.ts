/**
 * Regression tests for the cart maths.
 *
 * These cover the exact bugs that were reported:
 *   - "I add 1 and 2 show up"
 *   - "2 items but the total is for 1"
 *   - "prices don't match"
 *
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addToLines,
  countUnits,
  maxSelectable,
  normalizeCart,
  removeLine,
  resolveCart,
  resolvedTotal,
  roundMoney,
  setLineQty,
  subtotalOf,
  toFiniteNumber,
  type CartLine,
} from './cart.ts';

const stockMap = (stock: Record<number, number>) => (id: number) =>
  id in stock ? { stock: stock[id] } : null;

test('toFiniteNumber coerces the string ids a stale cart can hold', () => {
  assert.equal(toFiniteNumber('5'), 5);
  assert.equal(toFiniteNumber(7), 7);
  assert.equal(toFiniteNumber(''), null);
  assert.equal(toFiniteNumber('abc'), null);
  assert.equal(toFiniteNumber(Number.NaN), null);
  assert.equal(toFiniteNumber(null), null);
  assert.equal(toFiniteNumber(undefined), null);
});

test('normalizeCart drops unusable lines instead of trusting localStorage', () => {
  const cart = normalizeCart([
    { product_id: 1, quantity: 2 },
    { product_id: '1', quantity: 3 }, // same product, id stored as a string
    { product_id: 2, quantity: 0 }, // zero quantity
    { product_id: 3, quantity: -4 }, // negative
    { product_id: 4, quantity: 'x' }, // garbage
    { product_id: 'nope', quantity: 1 }, // garbage id
    { product_id: 5, quantity: 1.4 }, // rounded to 1
    null,
    'not an object',
  ]);

  assert.deepEqual(cart, [
    { product_id: 1, quantity: 5 },
    { product_id: 5, quantity: 1 },
  ]);
});

test('normalizeCart never returns the same product twice', () => {
  // The bug: a cart holding "3" (string) alongside 3 (number) produced two
  // separate lines, so the badge counted both while the drawer showed one.
  const cart = normalizeCart([
    { product_id: 3, quantity: 1 },
    { product_id: '3', quantity: 1 },
  ]);
  assert.equal(cart.length, 1);
  assert.deepEqual(cart, [{ product_id: 3, quantity: 2 }]);
});

test('normalizeCart removes products that no longer exist', () => {
  const cart = normalizeCart(
    [
      { product_id: 1, quantity: 1 },
      { product_id: 99, quantity: 4 }, // deleted in the admin panel
    ],
    stockMap({ 1: 10 })
  );
  assert.deepEqual(cart, [{ product_id: 1, quantity: 1 }]);
});

test('normalizeCart clamps quantities to live stock', () => {
  const cart = normalizeCart(
    [
      { product_id: 1, quantity: 12 },
      { product_id: 2, quantity: 3 },
    ],
    stockMap({ 1: 5, 2: 0 })
  );
  assert.deepEqual(cart, [{ product_id: 1, quantity: 5 }]);
});

test('normalizeCart survives junk input', () => {
  assert.deepEqual(normalizeCart(null), []);
  assert.deepEqual(normalizeCart('nope'), []);
  assert.deepEqual(normalizeCart({}), []);
  assert.deepEqual(normalizeCart([{ quantity: 2 }]), []);
});

test('addToLines merges into the existing line instead of duplicating it', () => {
  let cart: CartLine[] = [];
  cart = addToLines(cart, 1, 1);
  cart = addToLines(cart, 1, 1);
  cart = addToLines(cart, 1, 1);
  assert.deepEqual(cart, [{ product_id: 1, quantity: 3 }]);
  assert.equal(cart.length, 1);
});

test('addToLines never exceeds available stock', () => {
  let cart = addToLines([], 1, 2, { stock: 3 });
  cart = addToLines(cart, 1, 5, { stock: 3 });
  assert.deepEqual(cart, [{ product_id: 1, quantity: 3 }]);

  // out of stock -> no line at all
  assert.deepEqual(addToLines([], 2, 1, { stock: 0 }), []);
});

test('addToLines ignores non-positive and unparseable quantities', () => {
  assert.deepEqual(addToLines([], 1, 0), []);
  assert.deepEqual(addToLines([], 1, -3), []);
  assert.deepEqual(addToLines([], 1, Number.NaN), []);
  assert.deepEqual(addToLines([], 1, '2' as never), [{ product_id: 1, quantity: 2 }]);
});

test('addToLines returns the same reference when nothing changes', () => {
  const cart = addToLines([], 1, 2, { stock: 2 });
  assert.equal(addToLines(cart, 1, 1, { stock: 2 }), cart, 'full cart must not re-render');
  assert.equal(addToLines(cart, 9, 1, { stock: 0 }), cart);
});

test('setLineQty sets an absolute number, and 0 removes the line', () => {
  const cart = addToLines([], 1, 2);
  assert.deepEqual(setLineQty(cart, 1, 5), [{ product_id: 1, quantity: 5 }]);
  assert.deepEqual(setLineQty(cart, 1, 0), []);
  assert.deepEqual(setLineQty(cart, 1, -1), []);
  // setting a line that is not there yet adds it (keeps +/- in sync)
  assert.deepEqual(setLineQty([], 2, 3), [{ product_id: 2, quantity: 3 }]);
});

test('setLineQty clamps to stock and drops the line when stock hits 0', () => {
  const cart = addToLines([], 1, 2);
  assert.deepEqual(setLineQty(cart, 1, 9, { stock: 4 }), [
    { product_id: 1, quantity: 4 },
  ]);
  assert.deepEqual(setLineQty(cart, 1, 9, { stock: 0 }), []);
});

test('setLineQty only touches the requested product', () => {
  const cart = addToLines(addToLines([], 1, 2), 2, 3);
  assert.deepEqual(setLineQty(cart, 2, 7), [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 7 },
  ]);
  assert.deepEqual(removeLine(cart, 1), [{ product_id: 2, quantity: 3 }]);
});

test('maxSelectable reports the remaining room correctly', () => {
  const cart = addToLines([], 1, 3, { stock: 5 });
  assert.equal(maxSelectable(1, cart, { stock: 5 }), 2);
  assert.equal(maxSelectable(1, addToLines(cart, 1, 1, { stock: 5 }), { stock: 5 }), 1);
  assert.equal(maxSelectable(1, cart, { stock: 0 }), 0);
});

test('countUnits is what the navbar badge shows', () => {
  assert.equal(countUnits([]), 0);
  assert.equal(
    countUnits([
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 3 },
    ]),
    5
  );
});

test('subtotalOf matches the sum of the per-line totals', () => {
  const prices: Record<number, number> = { 1: 249.5, 2: 100 };
  const lines: CartLine[] = [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ];
  const perLine = prices[1] * 2 + prices[2] * 1;
  assert.equal(subtotalOf(lines, (id) => prices[id]), perLine);
  assert.equal(subtotalOf(lines, (id) => prices[id]), 599);
});

test('subtotalOf rounds away float dust', () => {
  const lines: CartLine[] = [{ product_id: 1, quantity: 3 }];
  // 0.1 * 3 === 0.30000000000000004 without rounding
  assert.equal(subtotalOf(lines, () => 0.1), 0.3);
  assert.equal(subtotalOf(lines, () => 19.999), 60);
  assert.equal(subtotalOf(lines, () => 33.33), 99.99);
});

test('the displayed total always equals the sum of the displayed line totals', () => {
  // This is the "prices don't match" complaint: the drawer/checkout line
  // subtotals are rounded individually, so the grand total must equal their
  // sum exactly — not the unrounded float sum.
  const prices: Record<number, number> = { 1: 0.1, 2: 0.2, 3: 10.005 };
  const lines: CartLine[] = [
    { product_id: 1, quantity: 1 },
    { product_id: 2, quantity: 1 },
    { product_id: 3, quantity: 1 },
  ];
  const lineTotals = lines.map((l) => roundMoney(prices[l.product_id] * l.quantity));
  const sumOfLines = roundMoney(lineTotals.reduce((a, b) => a + b, 0));
  assert.equal(subtotalOf(lines, (id) => prices[id]), sumOfLines);
});

test('subtotalOf treats a missing/garbage price as zero, never NaN', () => {
  const lines: CartLine[] = [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ];
  const total = subtotalOf(lines, (id) => (id === 1 ? 10 : Number.NaN));
  assert.equal(total, 20);
  assert.ok(Number.isFinite(total));
});

test('roundMoney is stable', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(Number.NaN), 0);
  assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
});

test('a full add → bump → check flow stays consistent', () => {
  // Reproduces the reported journey: add one of each, then raise one, and make
  // sure badge count, line quantities and total all agree.
  const prices: Record<number, number> = { 1: 120, 2: 80 };
  const stock = stockMap({ 1: 4, 2: 4 });

  let lines: CartLine[] = [];
  lines = addToLines(lines, 1, 1, stock(1)!);
  lines = addToLines(lines, 2, 1, stock(2)!);
  lines = addToLines(lines, 1, 1, stock(1)!);

  assert.equal(lines.length, 2);
  assert.equal(countUnits(lines), 3);
  assert.equal(subtotalOf(lines, (id) => prices[id]), 120 * 2 + 80);

  // a cloud refresh that cut stock must clamp, not corrupt
  lines = normalizeCart(lines, stock);
  assert.deepEqual(lines, [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ]);
  assert.equal(countUnits(lines), 3);
  assert.equal(subtotalOf(lines, (id) => prices[id]), 320);
});

/* -------------------------------------------------------------------------- */
/*  Resolving the cart against the live catalog — the invariant that makes      */
/*  "the badge says 2 but the drawer shows 1 / the total is for 1" impossible.   */
/* -------------------------------------------------------------------------- */

const CATALOG = [
  { id: 1, name: 'Scarf', price: 250, available: 5 },
  { id: 2, name: 'Mug', price: 400, available: 3 },
  { id: 3, name: 'Sold out', price: 100, available: 0 },
  { id: 4, name: 'Unlisted', price: 999, available: 9 },
];

test('resolveCart drops lines whose product is gone or unbuyable', () => {
  // The catalog above deliberately omits product 99 and marks 3 as sold out.
  const lines: CartLine[] = [
    { product_id: 1, quantity: 2 },
    { product_id: 3, quantity: 1 }, // available = 0
    { product_id: 99, quantity: 4 }, // deleted
    { product_id: 2, quantity: 1 },
  ];
  const resolved = resolveCart(lines, CATALOG);
  assert.deepEqual(resolved.map((r) => r.product.id), [1, 2]);
  assert.equal(countUnits(resolved), 3);
});

test('the badge count, the row count and the total all come from one list', () => {
  const lines: CartLine[] = [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 3 },
    { product_id: 99, quantity: 7 }, // phantom — must NOT inflate the badge
  ];
  const resolved = resolveCart(lines, CATALOG);

  // badge
  assert.equal(countUnits(resolved), 5);
  // per-row figures shown in the drawer
  assert.deepEqual(resolved.map((r) => r.lineTotal), [500, 1200]);
  // grand total is exactly the sum of those rows
  assert.equal(resolvedTotal(resolved), 1700);
  assert.equal(
    resolvedTotal(resolved),
    resolved.reduce((s, r) => s + r.lineTotal, 0)
  );
});

test('resolveCart clamps a line down to the stock that is actually left', () => {
  const resolved = resolveCart([{ product_id: 2, quantity: 10 }], CATALOG);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].quantity, 3, 'only 3 Mug exist');
  assert.equal(resolved[0].remaining, 0, 'so nothing more can be added');
  assert.equal(resolved[0].lineTotal, 1200);
  assert.equal(countUnits(resolved), 3, 'badge must show 3, not 10');
  assert.equal(resolvedTotal(resolved), 1200);
});

test('remaining tracks how much more of a product can still be added', () => {
  const resolved = resolveCart([{ product_id: 1, quantity: 2 }], CATALOG);
  assert.equal(resolved[0].remaining, 3);
  const full = resolveCart([{ product_id: 1, quantity: 5 }], CATALOG);
  assert.equal(full[0].remaining, 0);
});

test('resolveCart is immune to junk in the stored cart', () => {
  const resolved = resolveCart(
    [
      { product_id: '1' as never, quantity: '2' as never },
      { product_id: 2, quantity: Number.NaN as never },
      { product_id: 3, quantity: -2 as never },
      null as never,
    ],
    CATALOG
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].product.id, 1);
  assert.equal(resolved[0].quantity, 2);
  assert.equal(resolvedTotal(resolved), 500);
});

test('the full reported journey: stale cart + deleted product + price change', () => {
  // What actually happened to the customer: a cart written by an older build
  // held a string id and a product that has since been removed, and the price
  // was later edited in the admin panel.
  const stale = [
    { product_id: 2, quantity: 2 }, // id stored as a string
    { product_id: '77', quantity: 3 }, // product deleted since
    { product_id: 1, quantity: 1 },
  ];
  const repaired = normalizeCart(stale, (id) => {
    const p = CATALOG.find((x) => x.id === id);
    return p ? { stock: p.available } : null;
  });
  assert.deepEqual(repaired, [
    { product_id: 2, quantity: 2 },
    { product_id: 1, quantity: 1 },
  ]);

  const resolved = resolveCart(repaired, CATALOG);
  assert.equal(countUnits(resolved), 3); // badge: 3
  assert.equal(resolved.length, 2); // drawer: 2 rows
  assert.equal(resolvedTotal(resolved), 250 * 1 + 400 * 2); // total: matches
  assert.equal(
    resolvedTotal(resolved),
    resolved.reduce((s, r) => s + r.lineTotal, 0)
  );
});

test('a price edited in the admin panel flows straight through to the total', () => {
  const before = resolveCart([{ product_id: 1, quantity: 2 }], CATALOG);
  assert.equal(resolvedTotal(before), 500);

  const repriced = CATALOG.map((p) => (p.id === 1 ? { ...p, price: 275 } : p));
  const after = resolveCart([{ product_id: 1, quantity: 2 }], repriced);
  assert.equal(resolvedTotal(after), 550);
  assert.equal(after[0].lineTotal, 550);
});
