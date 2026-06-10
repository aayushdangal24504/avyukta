/** Storefront home: parallax hero w/ 3D ring showcase, categories, featured, testimonials.
 *  All headings/texts are admin-editable via Settings (getSetting). */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCategoriesSorted, getSetting, getVisibleProducts } from '../lib/db';
import { useStore } from '../lib/store';
import { Reveal, SkeletonCard, Tilt } from '../components/ui';
import { ProductCard } from '../components/ProductCard';

/** Parse "Name | text" lines from the admin-editable testimonials setting. */
function parseTestimonials(): { name: string; text: string }[] {
  return getSetting('testimonials')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('|');
      return i === -1 ? { name: '', text: l } : { name: l.slice(0, i).trim(), text: l.slice(i + 1).trim() };
    });
}

/** Parse "value | label" lines from the admin-editable hero stats setting. */
function parseStats(): { n: string; l: string }[] {
  return getSetting('hero_stats')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('|');
      return i === -1 ? { n: l, l: '' } : { n: l.slice(0, i).trim(), l: l.slice(i + 1).trim() };
    });
}

export default function Home() {
  useStore(); // re-render on db changes
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [tIdx, setTIdx] = useState(0);

  const testimonials = parseTestimonials();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700); // skeleton shimmer moment
    const fn = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', fn, { passive: true });
    const ti = setInterval(() => setTIdx((i) => (i + 1) % Math.max(1, testimonials.length)), 4500);
    return () => { clearTimeout(t); window.removeEventListener('scroll', fn); clearInterval(ti); };
  }, [testimonials.length]);

  const products = getVisibleProducts();
  const featured = products.filter((p) => p.is_featured).slice(0, 4);
  // New Arrivals: products the admin flagged as "New Arrival 🌷";
  // falls back to the most recently added products if none are flagged.
  const flaggedNew = products.filter((p) => p.is_new);
  const newest = (flaggedNew.length > 0 ? flaggedNew : [...products].sort((a, b) => b.created_at.localeCompare(a.created_at))).slice(0, 4);
  // Best Sellers: only shown when the admin flags at least one product 💖
  const bestSellers = products.filter((p) => p.is_best).slice(0, 4);
  const cats = getCategoriesSorted();
  const heroTitle = getSetting('hero_title');
  const aboutTitle = getSetting('about_title');
  const aboutPoints = getSetting('about_points').split('\n').map((x) => x.trim()).filter(Boolean);
  const stats = parseStats();
  const ringImgs = products.slice(0, 6).map((p) => p.images[0]);

  // Smooth-scroll to the categories section (a plain href="#..." would fight the HashRouter)
  const scrollToCategories = () => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="page-enter">
      {/* ================================ HERO ================================ */}
      <section className="relative overflow-hidden">
        {/* parallax blobs */}
        <div className="blob absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#fcd5ce]/70" style={{ transform: `translateY(${scrollY * 0.25}px)` }} />
        <div className="blob absolute -right-20 top-40 h-96 w-96 rounded-full bg-[#d291bc]/30" style={{ transform: `translateY(${scrollY * 0.15}px)`, animationDelay: '-4s' }} />
        <div className="blob absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#b56576]/20" style={{ transform: `translateY(${scrollY * 0.35}px)`, animationDelay: '-8s' }} />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
          <div style={{ transform: `translateY(${scrollY * -0.06}px)` }}>
            <p className="anim-up inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-widest text-[#b56576] shadow-sm ring-1 ring-rose-100" style={{ animationDelay: '.05s' }}>
              ✿ {getSetting('tagline')}
            </p>
            <h1 className="anim-up mt-5 whitespace-pre-line font-display text-4xl font-bold leading-tight text-[#41323a] sm:text-5xl lg:text-6xl" style={{ animationDelay: '.15s' }}>
              {heroTitle.split('\n')[0]}{'\n'}
              <span className="text-grad">{heroTitle.split('\n')[1] || ''}</span>
            </h1>
            <p className="anim-up mt-5 max-w-md leading-relaxed text-[#8c737e]" style={{ animationDelay: '.3s' }}>
              {getSetting('hero_subtitle')}
            </p>
            <div className="anim-up mt-8 flex flex-wrap gap-4" style={{ animationDelay: '.45s' }}>
              <Link to="/shop" className="btn-grad rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide">{getSetting('hero_cta')}</Link>
              <button onClick={scrollToCategories} className="btn-ghost rounded-full px-8 py-3.5 text-sm font-semibold">{getSetting('hero_cta2')}</button>
            </div>
            <div className="anim-up mt-10 flex gap-8" style={{ animationDelay: '.6s' }}>
              {stats.map((s) => (
                <div key={s.l + s.n}>
                  <p className="font-display text-2xl font-bold text-[#7f4c5a]">{s.n}</p>
                  <p className="text-xs uppercase tracking-wider text-[#a98993]">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3D rotating showcase ring + tilt hero image */}
          <div className="relative hidden h-[420px] md:block" style={{ transform: `translateY(${scrollY * -0.12}px)`, perspective: '1100px' }}>
            <div className="ring3d absolute left-1/2 top-1/2 h-0 w-0">
              {ringImgs.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="absolute h-24 w-24 rounded-2xl object-cover shadow-xl ring-4 ring-white"
                  style={{ transform: `rotateY(${(360 / ringImgs.length) * i}deg) translateZ(230px) translate(-50%,-50%)` }}
                />
              ))}
            </div>
            <Tilt max={12} className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2">
              <div className="floaty relative h-72 w-72">
                {/* hero image prefers the #1 best seller, then featured, then a fallback */}
                <img src={bestSellers[0]?.images[0] || featured[0]?.images[0] || 'images/p1.jpg'} alt="Featured" className="h-full w-full rounded-[2.5rem] object-cover shadow-2xl shadow-rose-300/50 ring-8 ring-white" />
                <span className="absolute -right-4 -top-4 grid h-16 w-16 rotate-12 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-center text-[10px] font-bold leading-tight text-white shadow-lg">BEST<br />SELLER</span>
              </div>
            </Tilt>
          </div>
        </div>
      </section>

      {/* ============================== CATEGORIES ============================== */}
      <section id="categories" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-14">
        <Reveal>
          <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{getSetting('categories_kicker')}</p>
          <h2 className="mt-2 text-center font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{getSetting('categories_title')}</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {cats.map((c, i) => {
            const count = products.filter((p) => p.category_id === c.id).length;
            return (
              <Reveal key={c.id} delay={i * 120}>
                <button
                  onClick={() => nav(`/shop?cat=${c.id}`)}
                  className="group relative block h-64 w-full overflow-hidden rounded-3xl shadow-md transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-rose-300/50"
                >
                  <img src={c.image} alt={c.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#41323a]/75 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                    <h3 className="font-display text-xl font-bold text-white">{c.name}</h3>
                    <p className="text-xs text-rose-100/90">{count} {count === 1 ? 'piece' : 'pieces'} · shop now →</p>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ============================ FEATURED / NEW ============================ */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{getSetting('featured_kicker')}</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{getSetting('featured_title')}</h2>
            </div>
            <Link to="/shop" className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold">View all →</Link>
          </div>
        </Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : featured.map((p, i) => (
                <Reveal key={p.id} delay={i * 100}>
                  <ProductCard product={p} />
                </Reveal>
              ))}
        </div>

        <Reveal className="mt-16">
          <h2 className="font-display text-2xl font-bold text-[#41323a]">{getSetting('new_title')}</h2>
        </Reveal>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : newest.map((p, i) => (
                <Reveal key={p.id} delay={i * 100}>
                  <ProductCard product={p} />
                </Reveal>
              ))}
        </div>

        {/* Best Sellers — only shown when the admin flags products 💖 */}
        {bestSellers.length > 0 && (
          <>
            <Reveal className="mt-16">
              <h2 className="font-display text-2xl font-bold text-[#41323a]">{getSetting('best_title')}</h2>
            </Reveal>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                : bestSellers.map((p, i) => (
                    <Reveal key={p.id} delay={i * 100}>
                      <ProductCard product={p} />
                    </Reveal>
                  ))}
            </div>
          </>
        )}
      </section>

      {/* ================================ ABOUT ================================ */}
      <section className="relative overflow-hidden py-16">
        <div className="absolute inset-0 bg-gradient-to-br from-[#fcd5ce]/40 via-transparent to-[#d291bc]/15" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
          <Reveal>
            <Tilt max={8}>
              <img src="images/p4.jpg" alt="About AVYUKTA" className="rounded-[2.5rem] shadow-2xl shadow-rose-300/40 ring-8 ring-white" />
            </Tilt>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{getSetting('about_kicker')}</p>
            <h2 className="mt-2 whitespace-pre-line font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{aboutTitle}</h2>
            <p className="mt-5 whitespace-pre-line leading-relaxed text-[#8c737e]">{getSetting('about_text')}</p>
            <ul className="mt-6 space-y-3 text-sm text-[#6b5560]">
              {aboutPoints.map((x) => (
                <li key={x} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[10px] text-white">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ============================= TESTIMONIALS ============================= */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 py-16 text-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{getSetting('testimonials_kicker')}</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{getSetting('testimonials_title')}</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="relative mt-10 overflow-hidden">
              <div className="flex transition-transform duration-700" style={{ transform: `translateX(-${(tIdx % testimonials.length) * 100}%)`, transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)' }}>
                {testimonials.map((t, i) => (
                  <figure key={i} className="w-full shrink-0 px-2">
                    <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-lg shadow-rose-100/70 ring-1 ring-rose-50">
                      <p className="text-lg text-[#d291bc]">★★★★★</p>
                      <blockquote className="mt-3 font-display text-lg italic leading-relaxed text-[#5d4954]">“{t.text}”</blockquote>
                      {t.name && <figcaption className="mt-4 text-sm font-semibold text-[#b56576]">— {t.name}</figcaption>}
                    </div>
                  </figure>
                ))}
              </div>
              <div className="mt-6 flex justify-center gap-2">
                {testimonials.map((_, i) => (
                  <button key={i} onClick={() => setTIdx(i)} className={`h-2 rounded-full transition-all duration-300 ${i === tIdx % testimonials.length ? 'w-8 bg-[#b56576]' : 'w-2 bg-rose-200'}`} aria-label={`Slide ${i + 1}`} />
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      )}
    </div>
  );
}
