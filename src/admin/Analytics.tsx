/**
 * AVYUKTA — Site Analytics Dashboard (Admin)
 *
 * Pure CSS charts — no external charting library needed.
 * Shows: page views, unique visitors, clicks, orders, conversion funnel,
 * top pages, top products, top searches, hourly heat, session metrics.
 */

import { useEffect, useState, useMemo } from 'react';
import { getDB } from '../lib/db';
import { useStore } from '../lib/store';
import { Counter } from '../components/ui';
import type { AnalyticsEvent } from '../lib/analytics';
import {
  getAllEvents,
  countByType,
  uniqueVisitors,
  groupByDay,
  topPages,
  topProducts,
  topSearches,
  topCategories,
  conversionFunnel,
  hourlyDistribution,
  avgSessionDuration,
  bounceRate,
  pagesPerSession,
} from '../lib/analytics';

/* ========================= helpers ========================= */

type Range = '7d' | '14d' | '30d' | '90d' | 'all';

function rangeLabel(r: Range): string {
  return { '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' }[r];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function friendlyPage(hash: string): string {
  const h = hash.replace('#', '');
  if (h === '/' || h === '') return 'Home';
  if (h.startsWith('/shop')) return 'Shop';
  if (h.startsWith('/product/')) return 'Product #' + h.split('/product/')[1];
  if (h === '/checkout') return 'Checkout';
  if (h === '/account') return 'Account';
  if (h.startsWith('/track')) return 'Track Order';
  return h;
}

/* ========================= CSS chart components ========================= */

/** Vertical bar chart. */
function BarChart({
  labels,
  values,
  color = '#b56576',
  height = 180,
  showValues = false,
}: {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {labels.map((label, i) => {
        const h = Math.max(4, (values[i] / max) * 100);
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-1">
            {showValues && values[i] > 0 && (
              <span className="text-[9px] font-bold text-[#b56576] opacity-0 transition group-hover:opacity-100">
                {values[i]}
              </span>
            )}
            <div
              className="w-full rounded-t-lg transition-all duration-500 hover:opacity-80"
              style={{
                height: `${h}%`,
                background: `linear-gradient(to top, ${color}, ${color}cc)`,
                animation: `fadeUp .6s ${0.1 + i * 0.03}s cubic-bezier(.22,1,.36,1) both`,
              }}
            />
            <span className="w-full truncate text-center text-[9px] font-medium text-[#a98993]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bar chart (for rankings). */
function HorizontalBar({
  label,
  value,
  max,
  color = '#b56576',
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="max-w-[65%] truncate font-medium text-[#5d4954]">{label}</span>
        <span className="font-bold text-[#7f4c5a]">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-rose-50">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }}
        />
      </div>
    </div>
  );
}

/** Heatmap grid (24 hours × rows). */
function Heatmap({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const intensity = (c: number) => {
    if (c === 0) return 'bg-rose-50/60';
    const t = c / max;
    if (t < 0.25) return 'bg-[#fcd5ce]/50';
    if (t < 0.5) return 'bg-[#f6bdc8]/60';
    if (t < 0.75) return 'bg-[#e8a2b8]/70';
    return 'bg-[#b56576]';
  };
  return (
    <div>
      <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
        {data.map((d) => (
          <div key={d.hour} className="group relative">
            <div
              className={`aspect-square rounded-md transition-all hover:ring-2 hover:ring-[#b56576] ${intensity(d.count)}`}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-[#41323a] px-2 py-1 text-[9px] text-white opacity-0 shadow transition group-hover:opacity-100">
              {d.hour}:00 — {d.count} events
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] text-[#a98993]">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>11 PM</span>
      </div>
    </div>
  );
}

/** Funnel visualization. */
function FunnelChart({ data }: { data: { step: string; count: number; rate: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.max(8, (d.count / max) * 100);
        return (
          <div key={d.step} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#5d4954]">
                <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[9px] font-bold text-white">
                  {i + 1}
                </span>
                {d.step}
              </span>
              <span className="font-bold text-[#7f4c5a]">
                {d.count} <span className="text-[9px] font-normal text-[#a98993]">({d.rate})</span>
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-rose-50">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, #b56576, #d291bc)`,
                  animation: `fadeUp .6s ${0.1 + i * 0.1}s cubic-bezier(.22,1,.36,1) both`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ========================= Main Component ========================= */

export default function Analytics() {
  useStore();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'products' | 'visitors' | 'events'>('overview');

  const db = getDB();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const fromDate =
          range === 'all'
            ? undefined
            : daysAgo({ '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[range]);
        const evs = await getAllEvents(fromDate);
        setEvents(evs);
      } catch {
        setEvents([]);
      }
      setLoading(false);
    })();
  }, [range]);

  /* -------- computed data -------- */
  const data = useMemo(() => {
    if (events.length === 0) {
      return {
        totalEvents: 0,
        pageViews: 0,
        visitors: 0,
        totalClicks: 0,
        orders: 0,
        searchCount: 0,
        byType: {} as Record<string, number>,
        byDay: {} as Record<string, AnalyticsEvent[]>,
        pages: [] as { page: string; count: number }[],
        products: [] as { product_id: number; views: number; cartAdds: number; buys: number }[],
        searches: [] as { query: string; count: number }[],
        categories: [] as { category_id: number; count: number }[],
        funnel: [] as { step: string; count: number; rate: string }[],
        hourly: [] as { hour: number; count: number }[],
        avgDuration: 0,
        bounce: 0,
        pagesSess: 0,
      };
    }

    const byType = countByType(events);
    const pageViews = byType['page_visit'] || 0;
    const totalClicks = (byType['click_product'] || 0) + (byType['click_add_to_cart'] || 0) +
      (byType['click_buy_now'] || 0) + (byType['click_category'] || 0) +
      (byType['click_search'] || 0) + (byType['click_cta'] || 0) + (byType['click_quick_view'] || 0);

    return {
      totalEvents: events.length,
      pageViews,
      visitors: uniqueVisitors(events),
      totalClicks,
      orders: byType['order_placed'] || 0,
      searchCount: byType['search_query'] || 0,
      byType,
      byDay: groupByDay(events),
      pages: topPages(events, 10),
      products: topProducts(events, 10),
      searches: topSearches(events, 10),
      categories: topCategories(events, 10),
      funnel: conversionFunnel(events),
      hourly: hourlyDistribution(events),
      avgDuration: avgSessionDuration(events),
      bounce: bounceRate(events),
      pagesSess: pagesPerSession(events),
    };
  }, [events]);

  /* -------- daily chart data -------- */
  const dailyChart = useMemo(() => {
    const days = Object.keys(data.byDay).sort();
    if (days.length === 0) {
      // Show last 7 empty days
      const labels: string[] = [];
      const views: number[] = [];
      const visitors: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        views.push(0);
        visitors.push(0);
      }
      return { labels, views, visitors };
    }

    const labels: string[] = [];
    const views: number[] = [];
    const visitors: number[] = [];

    days.forEach((day) => {
      const d = new Date(day);
      labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      const dayEvents = data.byDay[day];
      views.push(dayEvents.filter((e) => e.event_type === 'page_visit').length);
      visitors.push(new Set(dayEvents.map((e) => e.session_id)).size);
    });

    return { labels, views, visitors };
  }, [data.byDay]);

  /* -------- event breakdown chart -------- */
  const eventTypeChart = useMemo(() => {
    const typeLabels: Record<string, string> = {
      page_visit: 'Page Visits',
      click_product: 'Product Clicks',
      click_add_to_cart: 'Add to Cart',
      click_buy_now: 'Buy Now',
      click_checkout: 'Checkout',
      click_category: 'Category Clicks',
      click_search: 'Search Clicks',
      search_query: 'Searches',
      view_product: 'Product Views',
      click_cta: 'CTA Clicks',
      click_quick_view: 'Quick Views',
      order_placed: 'Orders',
      session_start: 'Sessions',
    };
    return Object.entries(data.byType)
      .map(([type, count]) => ({ label: typeLabels[type] || type, count }))
      .sort((a, b) => b.count - a.count);
  }, [data.byType]);

  /* -------- stat cards -------- */
  const stats = [
    { label: 'Page Views', value: data.pageViews, icon: '👁️', grad: 'from-[#b56576] to-[#d291bc]' },
    { label: 'Unique Visitors', value: data.visitors, icon: '👥', grad: 'from-violet-500 to-fuchsia-400' },
    { label: 'Total Clicks', value: data.totalClicks, icon: '🖱️', grad: 'from-blue-500 to-cyan-400' },
    { label: 'Orders', value: data.orders, icon: '📦', grad: 'from-emerald-500 to-teal-400' },
  ];

  const sessionStats = [
    { label: 'Avg Session', value: formatDuration(data.avgDuration), icon: '⏱️' },
    { label: 'Bounce Rate', value: data.bounce + '%', icon: '↩️' },
    { label: 'Pages / Session', value: String(data.pagesSess), icon: '📄' },
    { label: 'Searches', value: String(data.searchCount), icon: '🔍' },
  ];

  /* -------- product lookup -------- */
  const productLookup = useMemo(() => {
    const map = new Map<number, string>();
    db.products.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [db.products]);

  const categoryLookup = useMemo(() => {
    const map = new Map<number, string>();
    db.categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [db.categories]);

  /* -------- tabs -------- */
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'pages', label: 'Pages', icon: '📄' },
    { id: 'products', label: 'Products', icon: '🎁' },
    { id: 'visitors', label: 'Visitors', icon: '👥' },
    { id: 'events', label: 'Events', icon: '📋' },
  ] as const;

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Site Analytics</h1>
          <p className="mt-1 text-sm text-[#a98993]">
            Track visits, clicks, conversions & visitor behavior 📈
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '14d', '30d', '90d', 'all'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                range === r
                  ? 'bg-gradient-to-r from-[#b56576] to-[#d291bc] text-white shadow'
                  : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'
              }`}
            >
              {rangeLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-rose-50">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-gradient-to-r from-[#b56576] to-[#d291bc] text-white shadow'
                : 'text-[#a98993] hover:bg-rose-50 hover:text-[#7f4c5a]'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-rose-200 border-t-[#b56576]" />
          <p className="mt-4 text-sm text-[#a98993]">Loading analytics data…</p>
        </div>
      ) : data.totalEvents === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-rose-50">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-4xl">📊</div>
          <h3 className="mt-4 font-display text-xl font-semibold text-[#7f4c5a]">No analytics data yet</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-[#a98993]">
            Analytics tracking is active. Visit your store pages and interactions will start appearing here.
            {range !== 'all' && ' Try selecting "All time" to see any data.'}
          </p>
        </div>
      ) : (
        <>
          {/* ======================== OVERVIEW TAB ======================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((s, i) => (
                  <div
                    key={s.label}
                    className="anim-up rounded-3xl bg-white p-5 shadow-sm ring-1 ring-rose-50 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-100"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${s.grad} text-lg text-white shadow-lg`}>
                        {s.icon}
                      </span>
                    </div>
                    <p className="mt-3 font-display text-2xl font-bold text-[#41323a]">
                      <Counter value={s.value} />
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a98993]">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Session stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sessionStats.map((s) => (
                  <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-50">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-lg">{s.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-[#41323a]">{s.value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a98993]">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                {/* Daily traffic chart */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50 xl:col-span-2" style={{ animationDelay: '.2s' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-[#41323a]">Daily Traffic</h2>
                    <div className="flex gap-3 text-[10px] font-semibold">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#b56576]" /> Page Views</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d291bc]" /> Visitors</span>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#a98993]">Page Views</p>
                      <BarChart labels={dailyChart.labels} values={dailyChart.views} color="#b56576" showValues />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#a98993]">Unique Visitors</p>
                      <BarChart labels={dailyChart.labels} values={dailyChart.visitors} color="#d291bc" showValues />
                    </div>
                  </div>
                </div>

                {/* Conversion funnel */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.3s' }}>
                  <h2 className="font-display text-lg font-bold text-[#41323a]">🎯 Conversion Funnel</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">From visit to order</p>
                  <div className="mt-5">
                    <FunnelChart data={data.funnel} />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                {/* Hourly heatmap */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.35s' }}>
                  <h2 className="font-display text-lg font-bold text-[#41323a]">⏰ Activity by Hour</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">When visitors are most active</p>
                  <div className="mt-4">
                    <Heatmap data={data.hourly} />
                  </div>
                </div>

                {/* Event breakdown */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.4s' }}>
                  <h2 className="font-display text-lg font-bold text-[#41323a]">📋 Event Breakdown</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Total: {data.totalEvents} events recorded</p>
                  <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {eventTypeChart.map((ev) => (
                      <HorizontalBar
                        key={ev.label}
                        label={ev.label}
                        value={ev.count}
                        max={eventTypeChart[0]?.count || 1}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                {/* Top pages */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.45s' }}>
                  <h2 className="font-display text-lg font-bold text-[#41323a]">📄 Top Pages</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Most visited pages</p>
                  <div className="mt-4 space-y-3">
                    {data.pages.length === 0 ? (
                      <p className="text-sm text-[#a98993]">No page views yet</p>
                    ) : (
                      data.pages.map((p) => (
                        <HorizontalBar
                          key={p.page}
                          label={friendlyPage(p.page)}
                          value={p.count}
                          max={data.pages[0]?.count || 1}
                          color="#b56576"
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Top searches */}
                <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.5s' }}>
                  <h2 className="font-display text-lg font-bold text-[#41323a]">🔍 Top Searches</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">What visitors are looking for</p>
                  <div className="mt-4 space-y-3">
                    {data.searches.length === 0 ? (
                      <p className="text-sm text-[#a98993]">No searches recorded yet</p>
                    ) : (
                      data.searches.map((s) => (
                        <HorizontalBar
                          key={s.query}
                          label={`"${s.query}"`}
                          value={s.count}
                          max={data.searches[0]?.count || 1}
                          color="#d291bc"
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== PAGES TAB ======================== */}
          {activeTab === 'pages' && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Page views bar chart */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">Page Views by Day</h2>
                  <div className="mt-5">
                    <BarChart
                      labels={dailyChart.labels}
                      values={dailyChart.views}
                      color="#b56576"
                      height={200}
                      showValues
                    />
                  </div>
                </div>

                {/* Page ranking */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">Page Rankings</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Sorted by total visits</p>
                  <div className="mt-5 space-y-3">
                    {data.pages.map((p) => (
                      <HorizontalBar
                        key={p.page}
                        label={friendlyPage(p.page)}
                        value={p.count}
                        max={data.pages[0]?.count || 1}
                      />
                    ))}
                    {data.pages.length === 0 && <p className="text-sm text-[#a98993]">No data</p>}
                  </div>
                </div>
              </div>

              {/* Pages table */}
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50">
                <div className="px-6 py-4">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">Detailed Page Stats</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
                      <tr>
                        <th className="px-6 py-3">Page</th>
                        <th className="px-6 py-3">Path</th>
                        <th className="px-6 py-3 text-right">Visits</th>
                        <th className="px-6 py-3 text-right">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pages.map((p) => (
                        <tr key={p.page} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                          <td className="px-6 py-3 font-medium text-[#5d4954]">{friendlyPage(p.page)}</td>
                          <td className="px-6 py-3 font-mono text-xs text-[#a98993]">{p.page || '/'}</td>
                          <td className="px-6 py-3 text-right font-bold text-[#7f4c5a]">{p.count}</td>
                          <td className="px-6 py-3 text-right text-[#a98993]">
                            {data.pageViews > 0 ? ((p.count / data.pageViews) * 100).toFixed(1) : '0'}%
                          </td>
                        </tr>
                      ))}
                      {data.pages.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-[#a98993]">No page data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================== PRODUCTS TAB ======================== */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Top products by views */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">🏆 Top Products</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">By total interactions</p>
                  <div className="mt-5 space-y-4">
                    {data.products.length === 0 ? (
                      <p className="text-sm text-[#a98993]">No product interactions yet</p>
                    ) : (
                      data.products.map((p) => {
                        const name = productLookup.get(p.product_id) || `Product #${p.product_id}`;
                        return (
                          <div key={p.product_id} className="rounded-2xl bg-rose-50/50 p-4 ring-1 ring-rose-100">
                            <div className="flex items-center justify-between">
                              <span className="max-w-[70%] truncate text-sm font-semibold text-[#5d4954]">{name}</span>
                              <span className="text-[10px] font-bold text-[#a98993]">ID: {p.product_id}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-lg font-bold text-[#b56576]">{p.views}</p>
                                <p className="text-[9px] font-semibold uppercase text-[#a98993]">Views</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-[#d291bc]">{p.cartAdds}</p>
                                <p className="text-[9px] font-semibold uppercase text-[#a98993]">Cart Adds</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-emerald-600">{p.buys}</p>
                                <p className="text-[9px] font-semibold uppercase text-[#a98993]">Buy Now</p>
                              </div>
                            </div>
                            {/* conversion bar */}
                            {p.views > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[9px] text-[#a98993]">
                                  <span>View → Cart</span>
                                  <span>{((p.cartAdds / p.views) * 100).toFixed(1)}%</span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#b56576] to-[#d291bc]"
                                    style={{ width: `${Math.min(100, (p.cartAdds / p.views) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Top categories */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">📂 Category Engagement</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Which categories get the most clicks</p>
                  <div className="mt-5 space-y-3">
                    {data.categories.length === 0 ? (
                      <p className="text-sm text-[#a98993]">No category clicks yet</p>
                    ) : (
                      data.categories.map((c) => (
                        <HorizontalBar
                          key={c.category_id}
                          label={categoryLookup.get(c.category_id) || `Category #${c.category_id}`}
                          value={c.count}
                          max={data.categories[0]?.count || 1}
                          color="#d291bc"
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Products interaction table */}
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50">
                <div className="px-6 py-4">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">Product Interaction Detail</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
                      <tr>
                        <th className="px-6 py-3">Product</th>
                        <th className="px-6 py-3 text-right">Views</th>
                        <th className="px-6 py-3 text-right">Cart Adds</th>
                        <th className="px-6 py-3 text-right">Buy Now</th>
                        <th className="px-6 py-3 text-right">Conv. Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => {
                        const name = productLookup.get(p.product_id) || `Product #${p.product_id}`;
                        return (
                          <tr key={p.product_id} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                            <td className="px-6 py-3 font-medium text-[#5d4954]">{name}</td>
                            <td className="px-6 py-3 text-right font-semibold">{p.views}</td>
                            <td className="px-6 py-3 text-right font-semibold">{p.cartAdds}</td>
                            <td className="px-6 py-3 text-right font-semibold">{p.buys}</td>
                            <td className="px-6 py-3 text-right font-bold text-[#b56576]">
                              {p.views > 0 ? ((p.cartAdds / p.views) * 100).toFixed(1) : '0'}%
                            </td>
                          </tr>
                        );
                      })}
                      {data.products.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-[#a98993]">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================== VISITORS TAB ======================== */}
          {activeTab === 'visitors' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Unique Visitors', value: data.visitors, icon: '👥' },
                  { label: 'Total Sessions', value: data.byType['session_start'] || 0, icon: '🔗' },
                  { label: 'Avg Duration', value: formatDuration(data.avgDuration), icon: '⏱️' },
                  { label: 'Bounce Rate', value: data.bounce + '%', icon: '↩️' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-50">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-lg">{s.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-[#41323a]">{s.value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a98993]">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Visitors over time */}
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                <h2 className="font-display text-lg font-bold text-[#41323a]">Visitors Over Time</h2>
                <div className="mt-5">
                  <BarChart
                    labels={dailyChart.labels}
                    values={dailyChart.visitors}
                    color="#8b5cf6"
                    height={200}
                    showValues
                  />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                {/* Session quality */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">📊 Session Quality</h2>
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#5d4954]">Pages per Session</span>
                        <span className="font-bold text-[#b56576]">{data.pagesSess}</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-rose-50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#b56576] to-[#d291bc]"
                          style={{ width: `${Math.min(100, data.pagesSess * 20)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#5d4954]">Bounce Rate</span>
                        <span className="font-bold text-[#b56576]">{data.bounce}%</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-rose-50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-400"
                          style={{ width: `${data.bounce}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#5d4954]">Avg Session Duration</span>
                        <span className="font-bold text-[#b56576]">{formatDuration(data.avgDuration)}</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-rose-50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400"
                          style={{ width: `${Math.min(100, (data.avgDuration / 300) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity heatmap */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">⏰ When Visitors Are Active</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Hover for details</p>
                  <div className="mt-4">
                    <Heatmap data={data.hourly} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== EVENTS TAB ======================== */}
          {activeTab === 'events' && (
            <div className="space-y-6">
              {/* Event type breakdown chart */}
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50">
                <h2 className="font-display text-lg font-bold text-[#41323a]">All Event Types</h2>
                <p className="mt-1 text-[10px] text-[#a98993]">
                  {data.totalEvents} total events • {Object.keys(data.byType).length} event types
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {eventTypeChart.map((ev) => (
                    <div key={ev.label} className="rounded-2xl bg-rose-50/50 p-4 ring-1 ring-rose-100">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#5d4954]">{ev.label}</span>
                        <span className="font-display text-xl font-bold text-[#b56576]">{ev.count}</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-rose-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#b56576] to-[#d291bc]"
                          style={{ width: `${(ev.count / data.totalEvents) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[9px] text-[#a98993]">
                        {((ev.count / data.totalEvents) * 100).toFixed(1)}% of all events
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent events log */}
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50">
                <div className="px-6 py-4">
                  <h2 className="font-display text-lg font-bold text-[#41323a]">📋 Recent Event Log</h2>
                  <p className="mt-1 text-[10px] text-[#a98993]">Last {Math.min(events.length, 50)} events</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
                      <tr>
                        <th className="px-6 py-3">Time</th>
                        <th className="px-6 py-3">Event</th>
                        <th className="px-6 py-3">Page</th>
                        <th className="px-6 py-3">Product</th>
                        <th className="px-6 py-3">Session</th>
                        <th className="px-6 py-3">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.slice(0, 50).map((ev) => {
                        const ts = new Date(ev.created_at);
                        return (
                          <tr key={ev.id} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                            <td className="whitespace-nowrap px-6 py-3 text-xs text-[#a98993]">
                              {ts.toLocaleDateString()} {ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-3">
                              <span className="inline-block rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-[#7f4c5a] ring-1 ring-rose-200">
                                {ev.event_type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-3 font-mono text-xs text-[#a98993]">{friendlyPage(ev.page)}</td>
                            <td className="px-6 py-3 text-xs text-[#5d4954]">
                              {ev.product_id ? (productLookup.get(ev.product_id) || `#${ev.product_id}`) : '—'}
                            </td>
                            <td className="px-6 py-3 font-mono text-[10px] text-[#a98993]">
                              {ev.session_id.slice(0, 10)}…
                            </td>
                            <td className="max-w-[200px] truncate px-6 py-3 text-xs text-[#a98993]">
                              {ev.query || (ev.meta && Object.keys(ev.meta).length > 0
                                ? Object.entries(ev.meta)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ')
                                : '—')}
                            </td>
                          </tr>
                        );
                      })}
                      {events.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-[#a98993]">No events</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {events.length > 50 && (
                  <div className="border-t border-rose-50 px-6 py-3 text-center text-xs text-[#a98993]">
                    Showing 50 of {events.length} events. Export or filter by date range for more.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
