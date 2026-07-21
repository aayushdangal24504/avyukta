/**
 * Scroll3DHero — top-of-page, scroll-driven 3D showcase.
 *
 *   - A tall section (SECTIONS × 100vh) with a `position: sticky` 100vh scene.
 *     Normal page scroll is NEVER hijacked — when the tall section ends, the
 *     rest of the site continues below it.
 *   - Centre: a clean 3D rotating RING of the product photos. It slowly
 *     auto-spins (so it always looks 3D) AND the scroll drives extra rotation.
 *   - The ONLY text is the four marketing messages. They appear ONE AT A TIME,
 *     bottom-centre, in WHITE with no box/frame, each vanishing as the next
 *     arrives. No headline, no subtitle, no button.
 *   - Vertical gradient backdrop: light at the top (so the transparent navbar's
 *     dark text stays readable) → deep plum at the bottom (so the white text
 *     stays readable) → fades back to cream at the very bottom for a clean
 *     seam into the rest of the (light) site.
 *
 * Image source: live catalogue covers if >= 3 products are configured in
 * Supabase, else the curated brand photos bundled in src/assets/showcase.
 */

import { useEffect, useRef, useState } from 'react';
import { getDB, getSetting, getVisibleProducts } from '../lib/db';
import { useStore } from '../lib/store';

import s1 from '../assets/showcase/s1.jpg';
import s2 from '../assets/showcase/s2.jpg';
import s3 from '../assets/showcase/s3.jpg';
import s4 from '../assets/showcase/s4.jpg';
import s5 from '../assets/showcase/s5.jpg';
import s6 from '../assets/showcase/s6.jpg';

/** Viewport-heights the user scrolls while the scene is pinned. */
const SECTIONS = 3.2;
const BUNDLED = [s1, s2, s3, s4, s5, s6];

/** The four messages, in order. Only one is visible at any scroll position. */
const MESSAGES = [
  'Get yours now for cheap prices',
  'Order now, pay later',
  'Premium quality',
  'All over Nepal delivery',
] as const;

/** Scroll windows [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd].
 *  Windows touch but never overlap → the previous line is fully gone the
 *  instant the next one begins ("vanish when another comes"). */
const WINDOWS: [number, number, number, number][] = [
  [0.00, 0.05, 0.20, 0.25],
  [0.25, 0.30, 0.45, 0.50],
  [0.50, 0.55, 0.70, 0.75],
  [0.75, 0.80, 1.10, 1.20], // last one holds until the section ends
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Triangular-ish opacity envelope: 0 outside [a,d], ramps in [a,b], out [c,d]. */
function envelope(p: number, [a, b, c, d]: [number, number, number, number]) {
  if (p <= a || p >= d) return 0;
  const inT = b > a ? clamp01((p - a) / (b - a)) : 1;
  const outT = d > c ? clamp01(1 - (p - c) / (d - c)) : 1;
  return Math.min(inT, outT);
}

export function Scroll3DHero() {
  useStore();

  const [progress, setProgress] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => { BUNDLED.forEach((s) => { const i = new Image(); i.src = s; }); }, []);

  // Passive, rAF-throttled scroll progress (no hijacking).
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = clamp01(-rect.top / Math.max(1, total));
      setProgress(total > 0 ? scrolled : 0);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const onResize = () => { setVw(window.innerWidth); measure(); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Photo source priority:
  //   1) Admin-selected products (Settings → "3D Ring Photos"), in chosen order.
  //   2) Auto: visible product covers if >= 3, else the bundled brand photos.
  // Computed each render (cheap) so admin edits show up without a hard reload.
  const frames = (() => {
    const db = getDB();
    const ids = getSetting('ring_product_ids')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => n > 0);
    if (ids.length) {
      const imgs = ids
        .map((id) => db.products.find((p) => p.id === id))
        .map((p) => p?.images?.[0] || p?.images_detail?.[0] || '')
        .filter(Boolean);
      if (imgs.length) return imgs;
    }
    const live = getVisibleProducts()
      .map((p) => p.images?.[0] || p.images_detail?.[0] || '')
      .filter(Boolean);
    return live.length >= 3 ? live.slice(0, 8) : BUNDLED;
  })();

  const mobile = vw < 900;
  const n = frames.length;
  const ang = 360 / n;
  // Radius is deliberately much larger than the tile width so adjacent cards
  // on the ring never overlap (chord between neighbours = radius, since 60°).
  const tileW = mobile ? 132 : 220;
  const tileH = mobile ? 92 : 150;
  const radius = mobile ? 210 : 360;
  const ringTop = mobile ? '40%' : '45%';

  // Scroll adds up to 1.5 turns on top of the continuous idle spin.
  const scrollRot = progress * 540;
  // First-message hint chevron fades out almost immediately.
  const hintOpacity = 1 - clamp01((progress - 0.02) / 0.06);

  return (
    <section
      ref={sectionRef}
      aria-label="Avyukta — scroll to explore"
      style={{ height: `${SECTIONS * 100}vh`, position: 'relative' }}
    >
      {/* pinned scene */}
      <div
        className="sticky top-0 h-screen w-full overflow-hidden"
        style={{
          perspective: '1500px',
          background:
            'linear-gradient(180deg,' +
            '#fffaf0 0%, #fbe7eb 18%, #d8afbd 40%, #8a5a6b 62%,' +
            '#432933 78%, #341f29 88%, #5b3a46 95%, #fffaf0 100%)',
        }}
      >
        {/* ambient glows (subtle parallax) */}
        <div className="pointer-events-none absolute left-1/2 top-[42%] h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(210,145,188,.35) 0%, rgba(127,76,90,.18) 45%, transparent 72%)',
            transform: `translate(-50%, -50%) translateY(${progress * -40}px)`,
          }} />
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-[#fcd5ce]/40 blur-3xl"
          style={{ transform: `translateY(${progress * -50}px)` }} />
        <div className="pointer-events-none absolute -right-20 bottom-24 h-80 w-80 rounded-full bg-[#b56576]/25 blur-3xl"
          style={{ transform: `translateY(${progress * 60}px)` }} />

        {/* 3D layer */}
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
          {/* rotating ring */}
          <div
            className="absolute left-1/2"
            style={{ top: ringTop, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateX(12deg) rotateY(${scrollRot}deg)` }}
          >
            <div className="av-spin3d absolute" style={{ top: 0, left: 0, width: 0, height: 0 }}>
              {frames.map((src, i) => (
                <div
                  key={i}
                  className="absolute overflow-hidden rounded-2xl bg-white/5 shadow-[0_22px_45px_-12px_rgba(0,0,0,.6)] ring-1 ring-white/25"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: tileW,
                    height: tileH,
                    marginLeft: -tileW / 2,
                    marginTop: -tileH / 2,
                    transform: `rotateY(${i * ang}deg) translateZ(${radius}px)`,
                  }}
                >
                  <img src={src} alt="Avyukta handmade product" draggable={false} className="h-full w-full select-none object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
                </div>
              ))}
            </div>
          </div>

          {/* grounding glow under the ring */}
          <div className="pointer-events-none absolute left-1/2 h-8 w-[60vw] max-w-[420px] -translate-x-1/2 rounded-[50%] bg-black/35 blur-2xl"
            style={{ top: `calc(${ringTop} + ${mobile ? 110 : 150}px)` }} />
        </div>

        {/* the four messages — one at a time, white, bottom-centre, no frame */}
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6" style={{ bottom: '14vh' }}>
          <div className="relative h-[1.4em] w-full max-w-3xl" style={{ fontSize: 'clamp(1.4rem, 5vw, 2.75rem)' }}>
            {MESSAGES.map((text, i) => {
              const e = envelope(progress, WINDOWS[i]);
              if (e <= 0.001) return null;
              return (
                <p
                  key={i}
                  className="font-display absolute inset-0 m-0 text-center font-semibold leading-tight text-white"
                  style={{
                    opacity: e,
                    transform: `translateY(${(1 - e) * 26}px) scale(${0.92 + e * 0.08}) rotateX(${(1 - e) * 14}deg)`,
                    textShadow: '0 2px 22px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.45)',
                    letterSpacing: '0.3px',
                    willChange: 'transform, opacity',
                  }}
                >
                  {text}
                </p>
              );
            })}
          </div>
        </div>

        {/* wordless scroll cue (no text) */}
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: '5vh', opacity: hintOpacity }}>
          <svg className="av-bob" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}
