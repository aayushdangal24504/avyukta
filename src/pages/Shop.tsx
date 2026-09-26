/** Shop page: category filter, price/newest sort, search, pagination, quick view. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategoriesSorted, getVisibleProducts } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Reveal, SkeletonCard } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { trackSearch, trackCategoryClick } from '../lib/analytics';

const PER_PAGE = 8;

export default function Shop() {
  // Re-render when the catalog changes (admin edit, cloud sync from another
  // device). The filtered list below is memoised, so without this bump the grid
  // could keep showing a stale product list after a sync.
  const { dbVersion } = useStore();
  const [params, setParams] = useSearchParams();
  const prevCat = useRef(Number(params.get('cat')) || 0);
  const prevQ = useRef(params.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'newest' | 'low' | 'high'>('newest');
  const [q, setQ] = useState(params.get('q') || '');
  const cat = Number(params.get('cat')) || 0;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Track category changes
  useEffect(() => {
    if (cat && cat !== prevCat.current) {
      const cats = getCategoriesSorted();
      const catName = cats.find((c) => c.id === cat)?.name;
      trackCategoryClick(cat, catName);
    }
    prevCat.current = cat;
  }, [cat]);

  // Track search queries
  useEffect(() => {
    if (q.trim() && q !== prevQ.current) {
      trackSearch(q.trim());
    }
    prevQ.current = q;
  }, [q]);

  const cats = getCategoriesSorted();
  const filtered = useMemo(() => {
    let list = getVisibleProducts();
    if (cat) list = list.filter((p) => p.category_id === cat);
    if (q.trim()) list = list.filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(q.toLowerCase()));
    if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [cat, sort, q, dbVersion]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Clamp during render rather than in an effect: changing the filter used to
  // paint one frame of "page 4 of 2" (an empty grid) before setPage(1) landed.
  const currentPage = Math.min(Math.max(1, page), pages);
  const visible = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div className="page-enter mx-auto max-w-7xl px-6 py-10">
      <Reveal>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">The collection</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-[#41323a]">Shop Handmade ✿</h1>
      </Reveal>

      {/* toolbar */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setPage(1); setParams({}); }}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!cat ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
          >
            All
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => { setPage(1); setParams(cat === c.id ? {} : { cat: String(c.id) }); }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${cat === c.id ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search…"
            aria-label="Search products"
            className="input-soft w-44! py-2!"
          />
          <select
            value={sort}
            onChange={(e) => { setPage(1); setSort(e.target.value as typeof sort); }}
            aria-label="Sort products"
            className="input-soft w-44! cursor-pointer py-2!"
          >
            <option value="newest">Sort: Newest</option>
            <option value="low">Price: Low → High</option>
            <option value="high">Price: High → Low</option>
          </select>
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon="🌷" title="No products found" sub="Try a different search or category — or check back soon, we're always crafting something new." />
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((p, i) => (
            <Reveal key={p.id} delay={(i % 4) * 80}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      )}

      {/* pagination */}
      {pages > 1 && (
        <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
          <button
            onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            disabled={currentPage <= 1}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#7f4c5a] ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            ‹
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              aria-label={`Page ${n}`}
              aria-current={n === currentPage}
              className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold transition-all ${n === currentPage ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            disabled={currentPage >= pages}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#7f4c5a] ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
