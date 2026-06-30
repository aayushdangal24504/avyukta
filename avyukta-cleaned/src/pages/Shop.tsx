/** Shop page: category filter, price/newest sort, search, pagination, quick view. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategoriesSorted, getVisibleProducts } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Reveal, SkeletonCard } from '../components/ui';
import { ProductCard } from '../components/ProductCard';

const PER_PAGE = 8;

export default function Shop() {
  useStore();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'newest' | 'low' | 'high'>('newest');
  const [q, setQ] = useState(params.get('q') || '');
  const cat = Number(params.get('cat')) || 0;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setPage(1), [cat, sort, q]);

  const cats = getCategoriesSorted();
  const filtered = useMemo(() => {
    let list = getVisibleProducts();
    if (cat) list = list.filter((p) => p.category_id === cat);
    if (q.trim()) list = list.filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(q.toLowerCase()));
    if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [cat, sort, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
            onClick={() => setParams({})}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!cat ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
          >
            All
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setParams({ cat: String(c.id) })}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${cat === c.id ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input-soft w-44! py-2!" />
          <select value={sort} onChange={(e) => setSort(e.target.value as never)} className="input-soft w-44! py-2!">
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
        <div className="mt-12 flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold transition-all ${n === page ? 'btn-grad' : 'bg-white text-[#7f4c5a] ring-1 ring-rose-200 hover:bg-rose-50'}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
