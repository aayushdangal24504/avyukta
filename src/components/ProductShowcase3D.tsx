/**
 * ProductShowcase3D — a self-rotating 3D-style product showcase.
 *
 * How it works now:
 *   - The scene is a tall section with a `position: sticky` 100vh stage, so the
 *     page scrolls normally (this used to hijack the wheel and lock
 *     `document.body`, which trapped the page and fought with keyboard
 *     scrolling).
 *   - THE MODEL ALWAYS ROTATES ON ITS OWN. A requestAnimationFrame loop
 *     advances through the product's image sequence (its "rotation frames")
 *     continuously, whether or not the visitor touches the scrollbar. This is
 *     the whole point of the section: it must never sit frozen on frame 0.
 *   - Scrolling ADDS rotation on top of the idle spin and drives the copy
 *     reveals (title, description, price, CTA) and the optional cross-fade into
 *     a second product.
 *   - The loop pauses when the section scrolls out of view, when the tab is
 *     hidden, and when the visitor prefers reduced motion.
 *
 * Data source (admin-configurable):
 *   settings.showcase_product_id        → main product (Supabase product.id)
 *   settings.showcase_variant_id        → optional second product to "transition" into
 *   settings.showcase_subtitle          → optional kicker text
 *   settings.showcase_cta_label         → optional CTA button label
 *
 * Frames source:
 *   We use product.images_detail if it has >= 4 images, otherwise product.images.
 *   The more frames you upload (12-30 ideal), the smoother the rotation.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDB, getSetting, money, Product } from '../lib/db';
import { useStore } from '../lib/store';
import { RichText } from './RichText';

/** Viewport-heights the scene stays pinned while the visitor scrolls through it. */
const PIN_VH = 2.2;
/** Seconds for one full idle revolution of the product. */
const SECONDS_PER_TURN = 7;
/** Extra revolutions contributed by scrolling through the whole section. */
const SCROLL_TURNS = 1.25;
/** Easing factor for the scroll → progress chase (lower = smoother/laggier). */
const SCROLL_EASE = 0.12;
/** Below this the displayed progress is snapped to the target to stop jitter. */
const PROGRESS_EPSILON = 0.0002;

function clamp(v: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/** Pick the best frame array from a product (detail crops preferred). */
function getFrames(p: Product | null): string[] {
  if (!p) return [];
  const detail = (p.images_detail || []).filter(Boolean);
  if (detail.length >= 4) return detail;
  return (p.images || []).filter(Boolean);
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function ProductShowcase3D() {
  useStore(); // re-render when DB changes

  const db = getDB();
  const showcaseId = parseInt(getSetting('showcase_product_id') || '0', 10);
  const variantId = parseInt(getSetting('showcase_variant_id') || '0', 10);
  const subtitle = getSetting('showcase_subtitle');
  const ctaLabel = getSetting('showcase_cta_label') || 'Shop now';

  const product = db.products.find((p) => p.id === showcaseId && p.is_visible) || null;
  const variant = variantId ? db.products.find((p) => p.id === variantId && p.is_visible) : null;

  const frames = useMemo(() => getFrames(product), [product]);
  const variantCover = variant?.images?.[0] || variant?.images_detail?.[0] || '';

  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // eased scroll progress 0..1
  const [frameIdx, setFrameIdx] = useState(0); // which rotation frame is showing

  // Preload all frames so scrubbing doesn't flicker on first paint
  useEffect(() => {
    if (frames.length === 0) return;
    frames.forEach((src) => { const img = new Image(); img.src = src; });
    if (variantCover) { const img = new Image(); img.src = variantCover; }
  }, [frames, variantCover]);

  /* ------------------------------------------------------------------ *
   *  The animation engine: idle auto-rotation + eased scroll progress.
   *  One rAF loop drives both so they can never disagree.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduce = prefersReducedMotion();
    const canSpin = frames.length > 1 && !reduce;

    // Raw (un-eased) scroll target, derived from the section's own box.
    const targetRef = { current: 0 };
    const displayRef = { current: 0 };
    // Continuous revolution counter — this is what makes the model rotate by
    // itself. It keeps counting up forever; only the frame we *show* wraps.
    const turnsRef = { current: 0 };
    const lastTimeRef = { current: 0 };
    const lastFrameRef = { current: 0 };
    const lastProgressRef = { current: -1 };

    let visible = true;
    let hidden = document.visibilityState === 'hidden';
    let raf = 0;

    const readScroll = () => {
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      targetRef.current = travel > 0 ? clamp(-rect.top / travel) : 0;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (hidden || !visible) return;

      // --- idle rotation: one full turn every SECONDS_PER_TURN seconds ---
      if (canSpin) {
        if (lastTimeRef.current === 0) lastTimeRef.current = now;
        const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); // ignore tab-switch gaps
        lastTimeRef.current = now;
        turnsRef.current += dt / SECONDS_PER_TURN;
      }

      // --- scroll contributes extra turns on top of the idle spin --------
      const totalTurns = turnsRef.current + displayRef.current * SCROLL_TURNS;
      const idx =
        frames.length > 0 ? Math.floor(((totalTurns % 1) + 1) % 1 * frames.length) % frames.length : 0;
      if (idx !== lastFrameRef.current) {
        lastFrameRef.current = idx;
        setFrameIdx(idx);
      }

      // --- eased scroll progress -----------------------------------------
      const d = displayRef.current + (targetRef.current - displayRef.current) * SCROLL_EASE;
      displayRef.current = Math.abs(targetRef.current - d) < PROGRESS_EPSILON ? targetRef.current : d;
      if (Math.abs(displayRef.current - lastProgressRef.current) > 0.0005) {
        lastProgressRef.current = displayRef.current;
        setProgress(displayRef.current);
      }
    };

    // Only burn frames while the section is actually on screen.
    const io = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0.01 }
    );
    io.observe(section);

    const onVisibility = () => { hidden = document.visibilityState === 'hidden'; };
    const onScroll = () => { readScroll(); };
    const onResize = () => { readScroll(); };

    readScroll();
    displayRef.current = targetRef.current;
    setProgress(targetRef.current);
    raf = requestAnimationFrame(tick);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [frames.length]);

  // Reset to the first frame when the showcase product changes.
  useEffect(() => {
    setFrameIdx(0);
    setProgress(0);
  }, [product?.id]);

  // Nothing configured / product missing → render nothing
  if (!product || frames.length === 0) return null;

  const currentFrame = frames[Math.min(frameIdx, frames.length - 1)] ?? frames[0];

  // Variant cross-fade kicks in during the final 20% of the scroll (if set)
  const variantMix = variant ? clamp((progress - 0.8) / 0.2, 0, 1) : 0;

  // A product with a single image has no frame sequence to spin through, so
  // give it a gentle scroll-driven sway instead of leaving it dead still.
  const singleFrame = frames.length < 2;
  const sway = singleFrame ? Math.sin(progress * Math.PI * 2) * 3 : 0;
  const drift = singleFrame ? Math.cos(progress * Math.PI * 2) * 8 : 0;

  const tilt = -10 + progress * 6 + sway;                 // -10° → -4°
  const yFloat = Math.sin(progress * Math.PI) * -22 + drift;
  const scale = 0.92 + progress * 0.12;
  const glowOpacity = 0.25 + Math.sin(progress * Math.PI) * 0.5;

  // Copy reveals: fully legible from the start, they just settle in.
  const titleY = (1 - clamp(progress / 0.35, 0, 1)) * 26;
  const titleOpacity = 0.55 + clamp(progress / 0.3, 0, 1) * 0.45;
  const ctaScale = clamp((progress - 0.15) / 0.35, 0, 1);
  const hintOpacity = 1 - clamp(progress / 0.25, 0, 1);

  return (
    <section
      ref={sectionRef}
      className="relative w-full"
      style={{ height: `${PIN_VH * 100}vh` }}
      aria-label={`${product.name} — rotating 3D showcase`}
    >
      {/* pinned stage */}
      <div
        className="sticky top-0 h-screen w-full overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fffaf0 0%, #fff0f3 100%)' }}
      >
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(248,180,192,.55) 0%, rgba(252,213,206,.25) 50%, transparent 75%)',
            opacity: glowOpacity,
            transition: 'opacity .12s linear',
          }}
        />

        {/* progress bar pinned to the top of the viewport */}
        <div aria-hidden className="absolute left-0 top-0 z-30 h-[3px] w-full bg-rose-100/40">
          <div
            className="h-full bg-gradient-to-r from-[#b56576] to-[#d291bc]"
            style={{ width: `${progress * 100}%`, transition: 'width .08s linear' }}
          />
        </div>

        <div className="relative z-10 mx-auto grid h-full max-w-7xl grid-cols-1 items-center gap-6 px-6 md:grid-cols-2">
          {/* ----------------------- TEXT SIDE (left) ----------------------- */}
          <div
            className="order-2 md:order-1"
            style={{
              transform: `translateY(${titleY}px)`,
              opacity: titleOpacity,
              transition: 'transform .15s linear, opacity .15s linear',
            }}
          >
            {subtitle && (
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">
                <RichText text={subtitle} />
              </p>
            )}
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[#41323a] sm:text-4xl lg:text-5xl">
              {product.name}
            </h2>
            {product.description && (
              <p className="mt-4 max-w-md leading-relaxed text-[#8c737e]">
                <RichText text={product.description} />
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="font-display text-2xl font-bold text-[#b56576]">
                {money(product.price)}
              </span>

              {variant && (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[#a98993]">Colours</span>
                  <div className="flex gap-1.5">
                    <span
                      className="block h-6 w-6 rounded-full ring-2 ring-white shadow"
                      style={{
                        backgroundImage: `url(${frames[0]})`,
                        backgroundSize: 'cover',
                        outline: variantMix < 0.5 ? '2px solid #b56576' : 'none',
                      }}
                      title={product.name}
                    />
                    <span
                      className="block h-6 w-6 rounded-full ring-2 ring-white shadow"
                      style={{
                        backgroundImage: `url(${variantCover})`,
                        backgroundSize: 'cover',
                        outline: variantMix >= 0.5 ? '2px solid #b56576' : 'none',
                      }}
                      title={variant.name}
                    />
                  </div>
                </div>
              )}
            </div>

            <div
              className="mt-7 inline-block"
              style={{
                transform: `scale(${0.88 + ctaScale * 0.12})`,
                opacity: 0.7 + ctaScale * 0.3,
                transition: 'transform .15s linear, opacity .15s linear',
              }}
            >
              <Link
                to={`/product/${variantMix >= 0.5 && variant ? variant.id : product.id}`}
                className="btn-grad rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide"
              >
                {ctaLabel} →
              </Link>
            </div>

            <p
              className="mt-6 hidden text-[11px] uppercase tracking-[0.25em] text-[#bba3ab] md:block"
              style={{ opacity: hintOpacity }}
            >
              ↓ Keep scrolling to rotate faster
            </p>
          </div>

          {/* ----------------------- PRODUCT SIDE (right) ----------------------- */}
          <div className="order-1 grid h-[50vh] place-items-center md:order-2 md:h-full">
            <div
              className="relative aspect-square w-[78%] max-w-[460px]"
              style={{
                transform: `translateY(${yFloat}px) rotate(${tilt}deg) scale(${scale})`,
                transition: 'transform .12s linear',
                willChange: 'transform',
              }}
            >
              {/* rotating product (frame sequence) */}
              <img
                key={currentFrame}
                src={currentFrame}
                alt={product.name}
                draggable={false}
                className="absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_25px_45px_rgba(180,100,120,0.35)]"
                style={{ opacity: 1 - variantMix * 0.85, transition: 'opacity .15s linear' }}
              />
              {/* variant cross-fade overlay */}
              {variant && variantCover && (
                <img
                  src={variantCover}
                  alt={variant.name}
                  draggable={false}
                  className="absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_25px_45px_rgba(180,100,120,0.35)]"
                  style={{ opacity: variantMix, transition: 'opacity .15s linear' }}
                />
              )}

              {/* soft floor shadow */}
              <div
                aria-hidden
                className="absolute -bottom-6 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-full bg-[#41323a]/15 blur-xl"
                style={{ transform: `translateX(-50%) scaleX(${1 - Math.abs(progress - 0.5) * 0.4})` }}
              />
            </div>

            {/* frame dots — shows the rotation is running, and how far round it is */}
            {frames.length > 1 && frames.length <= 24 && (
              <div
                aria-hidden
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 md:bottom-10"
              >
                {frames.map((_, i) => (
                  <span
                    key={i}
                    className={`block rounded-full transition-all duration-300 ${
                      i === frameIdx ? 'h-1.5 w-5 bg-[#b56576]' : 'h-1.5 w-1.5 bg-[#b56576]/25'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* mobile "scroll to rotate" hint */}
        <p
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.25em] text-[#bba3ab] md:hidden"
          style={{ opacity: hintOpacity }}
        >
          ↑ Swipe to rotate
        </p>
      </div>
    </section>
  );
}
