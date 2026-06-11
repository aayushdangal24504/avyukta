/** Product card with 3D tilt, add-to-cart fly animation and quick-view modal. */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Product, money } from '../lib/db';
import { useStore, flyToCart } from '../lib/store';
import { Tilt } from './ui';

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, toast, setCartOpen } = useStore();
  const nav = useNavigate();
  const imgRef = useRef<HTMLImageElement>(null);
  const [quick, setQuick] = useState(false);

  const add = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.stock <= 0) return toast('Sorry, this item is out of stock.', 'error');
    flyToCart(imgRef.current);
    addToCart(product.id);
    toast(`${product.name} added to cart 🌸`);
  };

  const buyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.stock <= 0) return toast('Sorry, this item is out of stock.', 'error');
    addToCart(product.id);
    nav('/checkout');
  };

  return (
    <>
      <Tilt max={7} className="h-full">
        <article
          onClick={() => nav(`/product/${product.id}`)}
          className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50 transition-shadow duration-300 hover:shadow-2xl hover:shadow-rose-200/60"
        >
          {/* image frame locked to the SAME ratio as the editor (290:224) on every screen size */}
          <div className="relative aspect-[290/224] overflow-hidden bg-[#fdf3ee]">
            {/* blurred copy of the same photo fills the frame edges — no bars, no cropping */}
            <img src={product.images[0]} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
            <img ref={imgRef} src={product.images[0]} alt={product.name} loading="lazy" className="relative h-full w-full object-contain transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {product.is_featured && (
                <span className="rounded-full bg-gradient-to-r from-[#b56576] to-[#d291bc] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">★ Featured</span>
              )}
              {product.is_new && (
                <span className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">🌷 New</span>
              )}
              {product.is_best && (
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">💖 Best Seller</span>
              )}
            </div>
            {product.stock <= 0 ? (
              <span className="absolute right-3 top-3 rounded-full bg-[#41323a]/80 px-3 py-1 text-[10px] font-bold text-white">Out of stock</span>
            ) : product.stock <= 5 ? (
              <span className="absolute right-3 top-3 rounded-full bg-amber-400/95 px-3 py-1 text-[10px] font-bold text-amber-900">Only {product.stock} left</span>
            ) : null}
            <button
              onClick={(e) => { e.stopPropagation(); setQuick(true); }}
              className="absolute bottom-3 right-3 translate-y-12 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-[#7f4c5a] opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
            >
              Quick view ✨
            </button>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <h3 className="font-display text-base font-semibold leading-snug text-[#5d4954]">{product.name}</h3>
            <p className="mt-1.5 font-display text-lg font-bold text-[#b56576]">{money(product.price)}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={add} className="btn-grad flex-1 rounded-full py-2.5 text-xs font-semibold tracking-wide">Add to Cart</button>
              <button onClick={buyNow} className="btn-ghost rounded-full px-4 py-2.5 text-xs font-semibold">Buy Now</button>
            </div>
          </div>
        </article>
      </Tilt>

      {/* quick view modal */}
      {quick && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#41323a]/50 p-4 backdrop-blur-sm" onClick={() => setQuick(false)}>
          <div className="anim-pop grid w-full max-w-3xl gap-0 overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            {/* full image, never cropped: same frame ratio as the shop card, blurred fill */}
            <div className="relative aspect-[290/224] self-center overflow-hidden bg-[#fdf3ee]">
              <img src={product.images[0]} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl" />
              <img src={product.images[0]} alt={product.name} className="relative h-full w-full object-contain" />
            </div>
            <div className="flex flex-col p-7">
              <button onClick={() => setQuick(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-sm transition hover:rotate-90">✕</button>
              <h3 className="font-display text-2xl font-bold text-[#5d4954]">{product.name}</h3>
              <p className="mt-1 font-display text-xl font-bold text-[#b56576]">{money(product.price)}</p>
              <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-[#8c737e]">{product.description}</p>
              <QuickQty product={product} onDone={() => { setQuick(false); setCartOpen(true); }} />
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function QuickQty({ product, onDone }: { product: Product; onDone: () => void }) {
  const [qty, setQty] = useState(1);
  const { addToCart, toast } = useStore();
  return (
    <div className="mt-auto pt-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-rose-50 px-2 py-1.5">
          <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-[#7f4c5a] shadow-sm active:scale-90">−</button>
          <span className="w-7 text-center text-sm font-semibold">{qty}</span>
          <button onClick={() => setQty(Math.min(product.stock || 99, qty + 1))} className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-[#7f4c5a] shadow-sm active:scale-90">+</button>
        </div>
        <button
          onClick={() => {
            if (product.stock <= 0) return toast('Out of stock', 'error');
            addToCart(product.id, qty);
            toast(`${product.name} added to cart 🌸`);
            onDone();
          }}
          className="btn-grad flex-1 rounded-full py-2.5 text-sm font-semibold"
        >
          Add to Cart
        </button>
      </div>
      <p className="mt-2 text-xs text-[#a98993]">{product.stock > 0 ? `${product.stock} in stock · handmade to order` : 'Currently out of stock'}</p>
    </div>
  );
}
