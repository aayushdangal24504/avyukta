/**
 * Apple-AirPods-style scroll-locked image-sequence showcase.
 *
 * How it works:
 *   - When the section enters the viewport, we position: sticky it.
 *   - The user's scroll wheel/touch input is captured and converted into a
 *     0..1 progress value through the animation.
 *   - Progress maps to:
 *       * which "rotation frame" (image from product.images_detail) is shown
 *       * subtle parallax / float / glow on the product
 *       * a final color/variant cross-fade to a second product's main image
 *       * a card slide-in with title, description, price, CTA
 *   - Only when progress reaches 1.0 (or 0.0 when scrolling back up) does
 *     normal page scrolling resume.
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

/** Pixels of "fake scroll" needed to play the entire animation through once. */
const SCROLL_DISTANCE = 2400; // tweak to make the showcase slower/faster
/** Hold the final frame this long before unlocking page scroll. */
const HOLD_AT_END_MS = 250;

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
  const [progress, setProgress] = useState(0);

  // Preload all frames so scrubbing doesn't flicker on first paint
  useEffect(() => {
    if (frames.length === 0) return;
    frames.forEach((src) => { const img = new Image(); img.src = src; });
    if (variantCover) { const img = new Image(); img.src = variantCover; }
  }, [frames, variantCover]);

  // The scroll-lock engine
  useEffect(() => {
    if (!product || frames.length === 0) return;

    const section = sectionRef.current;
    if (!section) return;

    let virtualScroll = 0; // accumulated scroll while locked
    let isLocked = false;
    let touchY = 0;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const updateProgress = () => {
      const p = clamp(virtualScroll / SCROLL_DISTANCE, 0, 1);
      setProgress(p);
    };

    const lock = () => {
      if (isLocked) return;
      isLocked = true;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    };

    const unlock = () => {
      if (!isLocked) return;
      isLocked = false;
      document.body.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    };

    const tryEngage = () => {
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight;
      // Engage when the section's top is near the top of the viewport
      // AND we haven't completed the animation in the current direction.
      const inView = rect.top <= 8 && rect.bottom > viewport * 0.5;
      if (inView && !isLocked) {
        // Decide starting progress based on scroll direction:
        // scrolling DOWN into section → start at 0; UP into section → start at 1
        const cs = (window.scrollY || document.documentElement.scrollTop);
        virtualScroll = (cs >= lastScrollY) ? 0 : SCROLL_DISTANCE;
        updateProgress();
        lock();
      }
    };

    let lastScrollY = window.scrollY;

    const onWheel = (e: WheelEvent) => {
      if (!isLocked) return;
      e.preventDefault();

      virtualScroll += e.deltaY;
      virtualScroll = clamp(virtualScroll, 0, SCROLL_DISTANCE);
      updateProgress();

      // Animation finished? hold a moment then release scroll downward.
      if (virtualScroll >= SCROLL_DISTANCE && e.deltaY > 0) {
        if (!holdTimer) {
          holdTimer = setTimeout(() => {
            unlock();
            // Scroll just past the section so we don't immediately re-engage
            window.scrollBy({ top: 4, behavior: 'auto' });
            holdTimer = null;
          }, HOLD_AT_END_MS);
        }
      } else if (virtualScroll <= 0 && e.deltaY < 0) {
        if (!holdTimer) {
          holdTimer = setTimeout(() => {
            unlock();
            window.scrollBy({ top: -4, behavior: 'auto' });
            holdTimer = null;
          }, HOLD_AT_END_MS);
        }
      } else if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!isLocked) return;
      touchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isLocked) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      const delta = (touchY - y) * 2.4; // touch sensitivity multiplier
      touchY = y;

      virtualScroll = clamp(virtualScroll + delta, 0, SCROLL_DISTANCE);
      updateProgress();

      if (virtualScroll >= SCROLL_DISTANCE && delta > 0) {
        if (!holdTimer) {
          holdTimer = setTimeout(() => { unlock(); window.scrollBy({ top: 4 }); holdTimer = null; }, HOLD_AT_END_MS);
        }
      } else if (virtualScroll <= 0 && delta < 0) {
        if (!holdTimer) {
          holdTimer = setTimeout(() => { unlock(); window.scrollBy({ top: -4 }); holdTimer = null; }, HOLD_AT_END_MS);
        }
      }
    };

    const onScroll = () => {
      lastScrollY = window.scrollY;
      tryEngage();
    };

    // Engage on first paint too
    tryEngage();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      if (holdTimer) clearTimeout(holdTimer);
      unlock();
    };
  }, [product, frames.length]);

  // Nothing configured / product missing → render nothing
  if (!product || frames.length === 0) return null;

  /* ---------------- compute visual values from progress 0..1 ---------------- */
  // Frames rotate during the first 80% of the animation.
  const rotateProgress = clamp(progress / 0.8, 0, 1);
  const frameIdx = Math.min(frames.length - 1, Math.floor(rotateProgress * frames.length));
  const currentFrame = frames[frameIdx];

  // Variant cross-fade kicks in during the final 20% (if a variant is set)
  const variantMix = variant ? clamp((progress - 0.8) / 0.2, 0, 1) : 0;

  // Subtle 3D-feeling micro-movements driven by progress
  const tilt = -10 + progress * 6;        // -10° → -4°
  const yFloat = Math.sin(progress * Math.PI) * -22; // gentle arc up/down
  const scale = 0.92 + progress * 0.12;    // 0.92 → 1.04
  const glowOpacity = 0.25 + Math.sin(progress * Math.PI) * 0.5; // peaks mid-animation

  // Title / card animation
  const titleY = (1 - clamp(progress / 0.35, 0, 1)) * 50; // slides up first
  const titleOpacity = clamp(progress / 0.25, 0, 1);
  const ctaScale = clamp((progress - 0.6) / 0.3, 0, 1); // CTA pops near end

  return (
    <section
      ref={sectionRef}
      className="relative w-full"
      style={{ height: '100vh', background: 'linear-gradient(160deg, #fffaf0 0%, #fff0f3 100%)' }}
      aria-label="Featured product showcase"
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

      {/* progress bar (very subtle, top of section) */}
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

            {/* color/variant swatches if a variant is configured */}
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
            style={{ transform: `scale(${0.85 + ctaScale * 0.15})`, opacity: 0.4 + ctaScale * 0.6, transition: 'transform .15s linear, opacity .15s linear' }}
          >
            <Link
              to={`/product/${variantMix >= 0.5 && variant ? variant.id : product.id}`}
              className="btn-grad rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide"
            >
              {ctaLabel} →
            </Link>
          </div>

          <p className="mt-6 hidden text-[11px] uppercase tracking-[0.25em] text-[#bba3ab] md:block">
            ↓ Keep scrolling to rotate
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
            {/* base product (rotation frame) */}
            <img
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
        </div>
      </div>

      {/* mobile "scroll to rotate" hint */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.25em] text-[#bba3ab] md:hidden">
        ↑ Swipe to rotate
      </p>
    </section>
  );
}
