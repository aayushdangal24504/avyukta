/**
 * Hero stats must be REAL numbers derived from the database.
 *
 * The homepage used to show hand-typed figures from the `hero_stats` setting
 * ("100% | Handmade", "1.2k+ | Happy gifts", "★ 4.9 | Avg. rating"). These
 * tests pin the replacement: every stat is counted from actual rows, and a stat
 * with nothing behind it is omitted rather than invented.
 *
 * Run with:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeHeroStats, parseRatedReviews, type HeroStatsSource } from './heroStats.ts';

/** Only the columns the hero reads matter — build them without the rest. */
const src = (shape: Record<string, unknown>) => shape as unknown as HeroStatsSource;

const visible = (id: number) => ({ id, is_visible: true });
const hidden = (id: number) => ({ id, is_visible: false });
const order = (id: number, status: string) => ({ id, status });
const item = (order_id: number, quantity: number) => ({ order_id, quantity });

/* -------------------------------------------------------------------------- */
/*  The live store, as it stands: 28 visible products, 3 orders (2 delivered). */
/* -------------------------------------------------------------------------- */

const LIVE_STORE = src({
  products: Array.from({ length: 28 }, (_, i) => visible(i + 1)),
  orders: [
    order(1, 'Delivered'),
    order(2, 'Delivered'),
    order(3, 'Confirmed and being prepared'),
  ],
  order_items: [item(1, 1), item(3, 1), item(2, 1), item(3, 1)],
  settings: { testimonials: 'Rita K. | The crochet bouquet made my mom cry happy tears.' },
});

test('the fake hero stats are gone: no "100%", "1.2k+" or "4.9" can be produced', () => {
  const flat = computeHeroStats(LIVE_STORE).map((s) => `${s.value} | ${s.label}`).join('\n');
  assert.ok(!/100%|1\.2k|4\.9/.test(flat), `still fabricating stats:\n${flat}`);
});

test('real counts replace them: 28 visible designs, 2 gifts delivered', () => {
  assert.deepEqual(computeHeroStats(LIVE_STORE), [
    { value: '28', label: 'Handmade designs' },
    { value: '2', label: 'Gifts delivered' },
  ]);
});

test('no rating stat until real ratings exist — unrated reviews are not a 5', () => {
  const labels = computeHeroStats(LIVE_STORE).map((s) => s.label);
  assert.ok(!labels.includes('Avg. rating'));
});

/* -------------------------------------------------------------------------- */
/*  Delivered count = units on delivered orders only.                          */
/* -------------------------------------------------------------------------- */

test('gifts delivered counts units, ignores undelivered and cancelled orders', () => {
  const stats = computeHeroStats(
    src({
      products: [visible(1)],
      orders: [
        order(1, 'Delivered'),
        order(2, 'Shipped(on the way)'),
        order(3, 'Cancelled'),
        order(4, 'Delivered'),
      ],
      order_items: [item(1, 2), item(2, 5), item(3, 9), item(4, 3)],
    })
  );
  assert.deepEqual(stats[1], { value: '5', label: 'Gifts delivered' });
});

test('a store that has shipped nothing shows no delivery count', () => {
  const stats = computeHeroStats(
    src({
      products: [visible(1)],
      orders: [order(1, 'Pending')],
      order_items: [item(1, 4)],
    })
  );
  assert.deepEqual(stats, [{ value: '1', label: 'Handmade design' }]);
});

test('hidden products are not counted, matching what the shop shows', () => {
  const stats = computeHeroStats(src({ products: [visible(1), visible(2), hidden(3)] }));
  assert.deepEqual(stats, [{ value: '2', label: 'Handmade designs' }]);
});

test('an empty store shows no stats at all', () => {
  assert.deepEqual(computeHeroStats(src({})), []);
  assert.deepEqual(computeHeroStats(src({ products: [], orders: [], order_items: [], settings: {} })), []);
});

test('orders that the reader cannot see fall back to catalogue stats only', () => {
  // With stricter RLS the storefront may receive zero order rows. That must
  // never surface a zero or an error — the delivery stat simply is not shown.
  const stats = computeHeroStats(src({ products: [visible(1), visible(2)], orders: [], order_items: [] }));
  assert.deepEqual(stats, [{ value: '2', label: 'Handmade designs' }]);
});

test('garbage quantities and string ids never corrupt the counts', () => {
  const stats = computeHeroStats(
    src({
      products: [visible(1)],
      orders: [order(1, 'Delivered'), order(2, 'Delivered')],
      order_items: [
        item(1, '2' as unknown as number),
        item(1, Number.NaN),
        item(2, -3),
        item(2, 0),
        item(2, 1.4),
      ],
    })
  );
  assert.deepEqual(stats[1], { value: '3', label: 'Gifts delivered' });
});

/* -------------------------------------------------------------------------- */
/*  Average rating comes from explicit ratings only.                           */
/* -------------------------------------------------------------------------- */

test('parseRatedReviews keeps explicit 1–5 ratings and drops unrated reviews', () => {
  const raw = [
    'Rita K. | 5 | Beautiful bouquet',
    'Legacy review without a rating',
    'Nour S. | 4 | Lovely hamper',
    'Aya T. | 0 | not a valid rating',
    'Jana M. | abc | not a number',
    'Sam P. | 6 | out of range',
  ].join('\n');
  assert.deepEqual(parseRatedReviews(raw), [5, 4]);
});

test('rated reviews produce a correct average', () => {
  const stats = computeHeroStats(
    src({
      products: [visible(1)],
      settings: { testimonials: 'Rita K. | 5 | x\nNour S. | 4 | y\nJana M. | 4 | z' },
    })
  );
  assert.deepEqual(stats[1], { value: '★ 4.3', label: 'Avg. rating' });
});

test('a single 5-star review shows 5.0, not a rounded-up fiction', () => {
  const stats = computeHeroStats(src({ settings: { testimonials: 'Rita K. | 5 | x' } }));
  assert.deepEqual(stats, [{ value: '★ 5.0', label: 'Avg. rating' }]);
});

/* -------------------------------------------------------------------------- */
/*  Labels                                                                     */
/* -------------------------------------------------------------------------- */

test('singular labels are used for a count of one', () => {
  const stats = computeHeroStats(
    src({ products: [visible(1)], orders: [order(1, 'Delivered')], order_items: [item(1, 1)] })
  );
  assert.deepEqual(stats, [
    { value: '1', label: 'Handmade design' },
    { value: '1', label: 'Gift delivered' },
  ]);
});

test('large counts are exact and thousands-separated', () => {
  const stats = computeHeroStats(
    src({
      products: Array.from({ length: 1200 }, (_, i) => visible(i + 1)),
      orders: [order(1, 'Delivered')],
      order_items: [item(1, 2500)],
    })
  );
  assert.deepEqual(stats, [
    { value: '1,200', label: 'Handmade designs' },
    { value: '2,500', label: 'Gifts delivered' },
  ]);
});
