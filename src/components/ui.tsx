/** Shared UI primitives: Reveal, Petals, Toasts, Skeleton, counters, NoImage. */
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';

/* ------------- IntersectionObserver scroll-triggered reveal ------------- */
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => el.classList.add('in'), delay);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

/* --------------------- floating flower petals background ------------------ */
export function Petals({ count = 14 }: { count?: number }) {
  const petals = Array.from({ length: count }, (_, i) => {
    const size = 10 + Math.random() * 16;
    return {
      id: i,
      left: Math.random() * 100,
      size,
      fall: 9 + Math.random() * 14,
      sway: 2.4 + Math.random() * 2.5,
      delay: -Math.random() * 20,
      hue: ['#fcd5ce', '#f6bdc8', '#e8a2b8', '#fde2d4'][i % 4],
      rot: Math.random() * 360,
    };
  });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
      {petals.map((p) => (
        <svg
          key={p.id}
          className="petal"
          style={{ left: `${p.left}vw`, animationDuration: `${p.fall}s, ${p.sway}s`, animationDelay: `${p.delay}s, ${p.delay}s`, width: p.size, height: p.size, transform: `rotate(${p.rot}deg)` }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <path d="M12 2C16 6 18 11 12 22C6 11 8 6 12 2Z" fill={p.hue} opacity="0.85" />
        </svg>
      ))}
    </div>
  );
}

/* ------------------------------ toast stack ------------------------------ */
export function ToastStack() {
  const { toasts } = useStore();
  return (
    <div className="fixed right-4 top-20 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl backdrop-blur ${
            t.type === 'success' ? 'bg-white/95 text-[#7f4c5a] ring-1 ring-rose-200' : 'bg-red-50/95 text-red-700 ring-1 ring-red-200'
          }`}
        >
          <span className={`grid h-6 w-6 place-items-center rounded-full text-white ${t.type === 'success' ? 'bg-gradient-to-br from-[#b56576] to-[#d291bc]' : 'bg-red-500'}`}>
            {t.type === 'success' ? '✓' : '!'}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- skeleton cards ----------------------------- */
export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="skeleton h-56 w-full" />
      <div className="space-y-3 p-5">
        <div className="skeleton h-4 w-3/4 rounded-full" />
        <div className="skeleton h-4 w-1/3 rounded-full" />
        <div className="skeleton h-9 w-full rounded-xl" />
      </div>
    </div>
  );
}

/* ----------------------- animated number counter ------------------------- */
export function Counter({ value, prefix = '', decimals = 0, duration = 1400 }: { value: number; prefix?: string; decimals?: number; duration?: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(value * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {n.toFixed(decimals)}
    </span>
  );
}

/* --------------------------- 3D tilt container ---------------------------- */
export function Tilt({ children, max = 10, className = '' }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${px * max * 2}deg) rotateX(${-py * max * 2}deg) translateZ(8px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = 'rotateY(0) rotateX(0) translateZ(0)';
  };
  return (
    <div className={`tilt-wrap ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div ref={ref} className="tilt h-full">
        {children}
      </div>
    </div>
  );
}

/* ----------------------------- empty state ----------------------------- */
export function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="anim-pop flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-[#fcd5ce]/50 text-4xl">{icon}</div>
      <h3 className="font-display text-xl font-semibold text-[#7f4c5a]">{title}</h3>
      {sub && <p className="max-w-sm text-sm text-[#a98993]">{sub}</p>}
      {action}
    </div>
  );
}

/* ----------------------------- status badge ----------------------------- */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-700 ring-amber-300',
    Confirmed: 'bg-blue-100 text-blue-700 ring-blue-300',
    Shipped: 'bg-purple-100 text-purple-700 ring-purple-300',
    Delivered: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
    Cancelled: 'bg-red-100 text-red-700 ring-red-300',
  };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${map[status] || map.Pending}`}>{status}</span>;
}

/* spinner for loading buttons */
export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white align-middle" />;
}

/**
 * NoImage — neutral placeholder area shown anywhere a product/category image
 * is missing. NEVER renders a demo image, just a soft empty state with the
 * label "No image".
 */
export function NoImage({ className = '', label }: { className?: string; label?: string }) {
  const text = label || 'No image';
  return (
    <div
      role="img"
      aria-label={text}
      className={`flex items-center justify-center bg-rose-50/60 text-[#bba3ab] ${className}`}
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-7 7" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{text}</span>
      </div>
    </div>
  );
}

/**
 * SafeImage — renders an <img> if `src` is a non-empty string, otherwise
 * renders <NoImage/>. Drop-in replacement to enforce "no demo image" rule.
 */
export function SafeImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  fallbackClassName = '',
  loading,
  label,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  loading?: 'eager' | 'lazy';
  label?: string;
}) {
  if (!src) {
    return <NoImage className={`${className} ${fallbackClassName}`} label={label} />;
  }
  return <img src={src} alt={alt || ''} loading={loading} className={`${className} ${imgClassName}`} />;
}
