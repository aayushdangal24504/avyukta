/** Product detail: gallery, qty selector, fly-to-cart, related products. */
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDB, getVisibleProducts, money } from '../lib/db';
import { useStore, flyToCart } from '../lib/store';
import { EmptyState, Reveal, SafeImage } from '../components/ui';
import { ProductCard } from '../components/ProductCard';

export default function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { addToCart, toast, setCartOpen } = useStore();
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  const db = getDB();
  const product = db.products.find((p) => p.id === Number(id) && p.is_visible);

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <EmptyState
          icon="🥀"
          title="Product not found"
          sub="This item may have been removed or is no longer available."
          action={<Link to="/shop" className="btn-grad rounded-full px-6 py-2.5 text-sm font-semibold">Back to shop</Link>}
        />
      </div>
    );
  }

  const category = db.categories.find((c) => c.id === product.category_id);
  const related = getVisibleProducts().filter((p) => p.category_id === product.category_id && p.id !== product.id).slice(0, 4);
  const images = product.images || [];

  const add = () => {
    if (product.stock <= 0) return toast('Sorry, this item is out of stock.', 'error');
    flyToCart(imgRef.current);
    addToCart(product.id, qty);
    toast(`${product.name} added to cart 🌸`);
  };

  return (
    <div className="page-enter mx-auto max-w-7xl px-6 py-10">
      <nav className="anim-fade text-xs text-[#a98993]">
        <Link to="/" className="hover:text-[#b56576]">Home</Link> / <Link to="/shop" className="hover:text-[#b56576]">Shop</Link>
        {category && <> / <Link to={`/shop?cat=${category.id}`} className="hover:text-[#b56576]">{category.name}</Link></>} / <span className="text-[#7f4c5a]">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* gallery */}
        <div className="anim-up">
          <div className="overflow-hidden rounded-[2rem] shadow-xl shadow-rose-200/50 ring-1 ring-rose-100">
            {images[imgIdx] ? (
              <img ref={imgRef} src={images[imgIdx]} alt={product.name} className="block h-auto w-full" />
            ) : (
              <SafeImage src={null} className="aspect-[290/224] w-full" />
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-4 flex gap-3">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`h-20 w-20 overflow-hidden rounded-2xl transition-all ${i === imgIdx ? 'ring-2 ring-[#b56576] ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
                >
                  <SafeImage src={src} alt="" className="h-full w-full" imgClassName="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div className="anim-up" style={{ animationDelay: '.15s' }}>
          {category && <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">{category.name}</p>}
          <h1 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">{product.name}</h1>
          <p className="mt-3 font-display text-3xl font-bold text-[#b56576]">{money(product.price)}</p>

          <div className="mt-3">
            {product.stock > 5 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> In stock</span>
            ) : product.stock > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Only {product.stock} left</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Out of stock</span>
            )}
          </div>

          {product.description && <p className="mt-6 leading-relaxed text-[#8c737e]">{product.description}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-white px-2 py-2 shadow-sm ring-1 ring-rose-100">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 font-bold text-[#7f4c5a] transition active:scale-90">−</button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button onClick={() => setQty(Math.min(product.stock || 99, qty + 1))} className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 font-bold text-[#7f4c5a] transition active:scale-90">+</button>
            </div>
            <button onClick={add} disabled={product.stock <= 0} className="btn-grad rounded-full px-8 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Add to Cart 🛍️
            </button>
            <button
              onClick={() => { if (product.stock <= 0) return; addToCart(product.id, qty); nav('/checkout'); }}
              disabled={product.stock <= 0}
              className="btn-ghost rounded-full px-8 py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              Buy Now
            </button>
          </div>

          <button onClick={() => setCartOpen(true)} className="mt-4 text-xs text-[#a98993] underline-offset-2 hover:underline">View cart →</button>
        </div>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="mt-20">
          <Reveal>
            <h2 className="font-display text-2xl font-bold text-[#41323a]">You may also love 🌸</h2>
          </Reveal>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 90}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
