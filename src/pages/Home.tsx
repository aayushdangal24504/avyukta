/** Storefront home — fully Supabase-driven.
 *  Every section is rendered only when its data exists; otherwise it's hidden.
 *  No hardcoded titles, copy, testimonials, stats, or images. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCategoriesSorted, getSetting, getVisibleProducts } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Reveal, SkeletonCard, Tilt, SafeImage } from '../components/ui';
import { RichText } from '../components/RichText';
import { ProductShowcase3D } from '../components/ProductShowcase3D';
import { Scroll3DHero } from '../components/Scroll3DHero';
import { ProductCard } from '../components/ProductCard';

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
  useStore();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [heroLocal, setHeroLocal] = useState(0);
  const [tIdx, setTIdx] = useState(0);
  const heroRef = useRef<HTMLElement>(null);

  const testimonials = parseTestimonials();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    // Parallax must be relative to the hero's OWN position (it now sits below the
    // 3D scroll hero), not the global scroll position — otherwise the offset would
    // be huge and the hero image would be shifted up and clipped by overflow-hidden.
    const fn = () => {
      const el = heroRef.current;
      setHeroLocal(el ? Math.max(0, -el.getBoundingClientRect().top) : 0);
    };
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    window.addEventListener('resize', fn);
    const ti = setInterval(
      () => setTIdx((i) => (i + 1) % Math.max(1, testimonials.length)),
      4500
    );
    return () => { clearTimeout(t); window.removeEventListener('scroll', fn); window.removeEventListener('resize', fn); clearInterval(ti); };
  }, [testimonials.length]);

  const products = getVisibleProducts();
  const cats = getCategoriesSorted();

  const featured = products.filter((p) => p.is_featured).slice(0, 4);
  const flaggedNew = products.filter((p) => p.is_new);
  const newest = (flaggedNew.length > 0
    ? flaggedNew
    : [...products].sort((a, b) => b.created_at.localeCompare(a.created_at))
  ).slice(0, 4);
  const bestSellers = products.filter((p) => p.is_best).slice(0, 4);

  /* ----- settings (all empty by default — nothing renders until configured) ----- */
  const tagline = getSetting('tagline');
  const heroTitle = getSetting('hero_title');
  const heroSubtitle = getSetting('hero_subtitle');
  const heroCta = getSetting('hero_cta');
  const heroCta2 = getSetting('hero_cta2');
  const stats = parseStats();

  const categoriesKicker = getSetting('categories_kicker');
  const categoriesTitle = getSetting('categories_title');
  const featuredKicker = getSetting('featured_kicker');
  const featuredTitle = getSetting('featured_title');
  const newTitle = getSetting('new_title');
  const bestTitle = getSetting('best_title');

  const aboutKicker = getSetting('about_kicker');
  const aboutTitle = getSetting('about_title');
  const aboutText = getSetting('about_text');
  const aboutPoints = getSetting('about_points').split('\n').map((x) => x.trim()).filter(Boolean);
  const aboutImage = getSetting('about_image');

  const testimonialsKicker = getSetting('testimonials_kicker');
  const testimonialsTitle = getSetting('testimonials_title');

  const ringImgs = products.slice(0, 6).map((p) => p.images?.[0]).filter(Boolean) as string[];
  const heroImage =
    getSetting('hero_image') ||
    bestSellers[0]?.images?.[0] ||
    featured[0]?.images?.[0] ||
    '';

  const hasAnyHeroContent = tagline || heroTitle || heroSubtitle || heroCta || heroCta2 || stats.length > 0;
  const hasAnyContent =
    hasAnyHeroContent || cats.length > 0 || products.length > 0 ||
    aboutKicker || aboutTitle || aboutText || aboutPoints.length > 0 ||
    testimonials.length > 0;

  const scrollToCategories = () => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' });

  /* --------- nothing configured yet → show a single welcoming empty state --------- */
  if (!hasAnyContent && !loading) {
    return (
      <div className="page-enter">
        <Scroll3DHero />
        <div className="mx-auto max-w-3xl px-6 py-24">
          <EmptyState
            icon="✨"
            title="Welcome"
            sub="No content has been added yet. Sign in to the admin panel to configure your store, add products, and publish content."
            action={
              <Link to="/admin/login" className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">
                Open admin
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      {/* ================= 3D ROAMING HERO (scroll-driven, top of page) ================= */}
      <Scroll3DHero />

      {/* ================================ HERO ================================ */}
      {hasAnyHeroContent && (
        <section ref={heroRef} className="relative overflow-hidden">
          <div className="blob absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#fcd5ce]/70" style={{ transform: `translateY(${heroLocal * 0.25}px)` }} />
          <div className="blob absolute -right-20 top-40 h-96 w-96 rounded-full bg-[#d291bc]/30" style={{ transform: `translateY(${heroLocal * 0.15}px)`, animationDelay: '-4s' }} />
          <div className="blob absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#b56576]/20" style={{ transform: `translateY(${heroLocal * 0.35}px)`, animationDelay: '-8s' }} />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
            <div style={{ transform: `translateY(${heroLocal * -0.06}px)` }}>
              {tagline && (
                <p className="anim-up inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-widest text-[#b56576] shadow-sm ring-1 ring-rose-100" style={{ animationDelay: '.05s' }}>
                  ✿ {tagline}
                </p>
              )}
              {heroTitle && (
                <h1 className="anim-up mt-5 whitespace-pre-line font-display text-4xl font-bold leading-tight text-[#41323a] sm:text-5xl lg:text-6xl" style={{ animationDelay: '.15s' }}>
                  {heroTitle.split('\n')[0]}
                  {heroTitle.includes('\n') && (
                    <>
                      {'\n'}
                      <span className="text-grad">{heroTitle.split('\n').slice(1).join('\n')}</span>
                    </>
                  )}
                </h1>
              )}
              {heroSubtitle && (
                <p className="anim-up mt-5 max-w-md leading-relaxed text-[#8c737e]" style={{ animationDelay: '.3s' }}>
                  <RichText text={heroSubtitle} />
                </p>
              )}
              {(heroCta || heroCta2) && (
                <div className="anim-up mt-8 flex flex-wrap gap-4" style={{ animationDelay: '.45s' }}>
                  {heroCta && <Link to="/shop" className="btn-grad rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide">{heroCta}</Link>}
                  {heroCta2 && <button onClick={scrollToCategories} className="btn-ghost rounded-full px-8 py-3.5 text-sm font-semibold">{heroCta2}</button>}
                </div>
              )}
              {stats.length > 0 && (
                <div className="anim-up mt-10 flex flex-wrap gap-8" style={{ animationDelay: '.6s' }}>
                  {stats.map((s) => (
                    <div key={s.l + s.n}>
                      <p className="font-display text-2xl font-bold text-[#7f4c5a]">{s.n}</p>
                      <p className="text-xs uppercase tracking-wider text-[#a98993]">{s.l}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* hero visual — only shown if at least one product image exists or a custom hero_image is set */}
            {(heroImage || ringImgs.length > 0) && (
              <div className="relative hidden h-[420px] md:block" style={{ transform: `translateY(${heroLocal * -0.12}px)`, perspective: '1100px' }}>
                {ringImgs.length > 0 && (
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
                )}
                <Tilt max={12} className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2">
                  <div className="floaty relative h-72 w-72">
                    <SafeImage
                      src={heroImage || null}
                      alt="Featured"
                      className="h-full w-full rounded-[2.5rem] shadow-2xl shadow-rose-300/50 ring-8 ring-white"
                      imgClassName="object-cover"
                    />
                  </div>
                </Tilt>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============================== CATEGORIES ============================== */}
      {cats.length > 0 && (
        <section id="categories" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-14">
          <Reveal>
            {categoriesKicker && <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{categoriesKicker}</p>}
            {categoriesTitle && <h2 className="mt-2 text-center font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{categoriesTitle}</h2>}
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
                    <SafeImage src={c.image} alt={c.name} className="h-full w-full" imgClassName="object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#41323a]/75 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                      <h3 className="font-display text-xl font-bold text-white">{c.name}</h3>
                      <p className="text-xs text-rose-100/90">{count} {count === 1 ? 'item' : 'items'}</p>
                    </div>
                  </button>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* ====================== 3D PRODUCT SHOWCASE (scroll-locked) ====================== */}
      {/* Auto-hides if no showcase_product_id is set in admin settings. */}
      <ProductShowcase3D />

      {/* ============================ FEATURED / NEW / BEST ============================ */}
      {(featured.length > 0 || newest.length > 0 || bestSellers.length > 0) && (
        <section className="mx-auto max-w-7xl px-6 py-14">
          {featured.length > 0 && (
            <>
              <Reveal>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    {featuredKicker && <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{featuredKicker}</p>}
                    {featuredTitle && <h2 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{featuredTitle}</h2>}
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
            </>
          )}

          {newest.length > 0 && newTitle && (
            <>
              <Reveal className="mt-16">
                <h2 className="font-display text-2xl font-bold text-[#41323a]">{newTitle}</h2>
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
            </>
          )}

          {bestSellers.length > 0 && bestTitle && (
            <>
              <Reveal className="mt-16">
                <h2 className="font-display text-2xl font-bold text-[#41323a]">{bestTitle}</h2>
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
      )}

      {/* ================================ ABOUT ================================ */}
      {(aboutKicker || aboutTitle || aboutText || aboutPoints.length > 0) && (
        <section className="relative overflow-hidden py-16">
          <div className="absolute inset-0 bg-gradient-to-br from-[#fcd5ce]/40 via-transparent to-[#d291bc]/15" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
            <Reveal>
              <Tilt max={8}>
                <SafeImage src={aboutImage} alt="About" className="aspect-square w-full rounded-[2.5rem] shadow-2xl shadow-rose-300/40 ring-8 ring-white" imgClassName="h-full w-full object-cover" />
              </Tilt>
            </Reveal>
            <Reveal delay={150}>
              {aboutKicker && <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{aboutKicker}</p>}
              {aboutTitle && <h2 className="mt-2 whitespace-pre-line font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{aboutTitle}</h2>}
              {aboutText && <p className="mt-5 leading-relaxed text-[#8c737e]"><RichText text={aboutText} /></p>}
              {aboutPoints.length > 0 && (
                <ul className="mt-6 space-y-3 text-sm text-[#6b5560]">
                  {aboutPoints.map((x) => (
                    <li key={x} className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[10px] text-white">✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {/* ============================= TESTIMONIALS ============================= */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 py-16 text-center">
          <Reveal>
            {testimonialsKicker && <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{testimonialsKicker}</p>}
            {testimonialsTitle && <h2 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{testimonialsTitle}</h2>}
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
