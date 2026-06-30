/**
 * Single-step image editor used before uploading product images.
 * You adjust the picture ONCE inside a real shop-card mock-up (290:224,
 * the exact frame used in the shop) — and the SAME image is used everywhere:
 * shop card, quick view and inside the product page. One version, no confusion.
 * Exports a high-res JPEG matching the preview pixel-for-pixel (blur fill baked in).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from './ui';

const ASPECT = 290 / 224; // exact shop-card image frame ratio
const OUT_W = 1160;       // exported resolution (4× card width)
const MAX_ZOOM = 4;

export function ImageCropper({
  file,
  busy,
  onSave,
  onCancel,
  productName = 'Your product',
  productPrice = '',
}: {
  file: File;
  busy: boolean; // parent shows uploading state
  onSave: (blob: Blob) => void;
  onCancel: () => void;
  productName?: string;
  productPrice?: string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(290);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const frameH = frameW / ASPECT;

  /* load the selected file */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setOffset({ x: 0, y: 0 }); };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* keep frame size in sync (responsive on small screens) */
  useEffect(() => {
    const measure = () => setFrameW(frameRef.current?.clientWidth || 290);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  /* ESC cancels */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCancel, busy]);

  /* geometry: at zoom=1 the FULL image fits inside the frame (nothing cropped) */
  const fit = img ? Math.min(frameW / img.width, frameH / img.height) : 1;
  const scale = fit * zoom;
  const drawW = img ? img.width * scale : 0;
  const drawH = img ? img.height * scale : 0;

  const clampOffset = useCallback(
    (o: { x: number; y: number }, z = zoom) => {
      if (!img) return o;
      const s = fit * z;
      const mx = Math.abs(img.width * s - frameW) / 2;
      const my = Math.abs(img.height * s - frameH) / 2;
      return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
    },
    [img, fit, frameW, frameH, zoom]
  );

  const setZoomClamped = (z: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(nz);
    setOffset((o) => clampOffset(o, nz));
  };

  /* drag + pinch (pointer events work on mouse & touch) */
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = (e: React.WheelEvent) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 0.93));
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
      dragRef.current = null;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setZoomClamped(pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist));
    }
  };

  /* export: render exactly the frame contents (with blurred fill) to a canvas */
  const save = () => {
    if (!img) return;
    const outH = Math.round(OUT_W / ASPECT);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    // blurred-edge fill: empty areas covered by a blurred copy of the SAME picture
    const coverScale = Math.max(OUT_W / img.width, outH / img.height) * 1.12;
    const bw = img.width * coverScale;
    const bh = img.height * coverScale;
    ctx.save();
    ctx.filter = 'blur(36px) saturate(1.05) brightness(1.02)';
    ctx.drawImage(img, (OUT_W - bw) / 2, (outH - bh) / 2, bw, bh);
    ctx.restore();
    ctx.filter = 'none';
    const sf = OUT_W / frameW;
    ctx.drawImage(img, (frameW / 2 - drawW / 2 + offset.x) * sf, (frameH / 2 - drawH / 2 + offset.y) * sf, drawW * sf, drawH * sf);
    canvas.toBlob((b) => { if (b) onSave(b); }, 'image/jpeg', 0.88);
  };

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-[#241b20]/70 p-4 backdrop-blur-sm" onClick={() => !busy && onCancel()}>
      <div className="anim-pop my-4 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-[#41323a]">Adjust your image ✂️</h3>
        <p className="mt-0.5 text-xs text-[#a98993]">
          One adjustment for everywhere — the shop card and the product page use this exact same picture.
          Your full photo is shown; zoom in only if you want to fill the frame.
        </p>

        {/* the shop card itself is the adjustment surface, at the exact shop size */}
        <div className="mx-auto mt-5 w-[290px] max-w-full overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-rose-100">
          <div
            ref={frameRef}
            className="relative w-full cursor-grab touch-none overflow-hidden bg-[#fdf3ee] active:cursor-grabbing"
            style={{ aspectRatio: '290 / 224' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          >
            {img ? (
              <>
                {/* blurred fill behind — matches the exported result */}
                <img src={img.src} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover blur-xl" />
                <img
                  src={img.src}
                  alt="Adjust"
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{ width: drawW, height: drawH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
                />
              </>
            ) : (
              <div className="skeleton absolute inset-0" />
            )}
            {img && zoom === 1 && offset.x === 0 && offset.y === 0 && (
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-[#7f4c5a] shadow">
                ✋ Drag to position
              </span>
            )}
          </div>
          {/* card body mock — matches the real ProductCard layout */}
          <div className="p-4">
            <h4 className="font-display truncate text-sm font-semibold text-[#5d4954]">{productName || 'Your product'}</h4>
            <p className="mt-1 font-display text-base font-bold text-[#b56576]">{productPrice ? `Rs. ${productPrice}` : 'Rs. 0.00'}</p>
            <div className="mt-3 flex gap-2">
              <span className="btn-grad pointer-events-none flex-1 rounded-full py-2 text-center text-[10px] font-semibold">Add to Cart</span>
              <span className="btn-ghost pointer-events-none rounded-full px-3 py-2 text-[10px] font-semibold">Buy Now</span>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#bba3ab]">
          ✓ Exact shop-card size — the product page shows this same picture
        </p>

        {/* zoom slider */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-[#a98993]">−</span>
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => setZoomClamped(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-rose-100 accent-[#b56576]"
            aria-label="Zoom"
          />
          <span className="text-sm text-[#a98993]">+</span>
          <span className="w-12 text-right text-xs font-semibold text-[#7f4c5a]">{zoom.toFixed(2)}×</span>
        </div>

        {/* actions */}
        <div className="mt-5 flex items-center gap-3 border-t border-rose-50 pt-4">
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} disabled={busy} className="rounded-full bg-rose-50 px-5 py-2.5 text-xs font-semibold text-[#7f4c5a] transition hover:bg-rose-100 disabled:opacity-50">
            ↺ Reset
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="ml-auto rounded-full px-5 py-2.5 text-xs font-semibold text-[#a98993] transition hover:bg-rose-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !img} className="btn-grad rounded-full px-7 py-2.5 text-xs font-semibold disabled:opacity-70">
            {busy ? <span className="inline-flex items-center gap-2"><Spinner /> Uploading…</span> : '✓ Save & Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
