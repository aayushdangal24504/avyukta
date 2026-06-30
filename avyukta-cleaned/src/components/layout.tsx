/** Storefront chrome: navbar with live search & cart badge, slide-in cart drawer, footer.
 *  All copy is pulled from Supabase settings — empty values render nothing. */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getSetting, getVisibleProducts, money } from '../lib/db';
import { SafeImage } from './ui';
import { RichText } from './RichText';

export function Logo({ light = false }: { light?: boolean }) {
  const logo = getSetting('logo');
  const name = getSetting('store_name');
  return (
    <Link to="/" className="flex items-center gap-2">
      {logo ? (
        <img src={logo} alt="logo" className="h-9 w-9 rounded-full object-cover ring-2 ring-[#fcd5ce]" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-lg text-[#bba3ab] ring-1 ring-rose-100" aria-label="No logo">
          ·
        </span>
      )}
      {name && (
        <span className={`font-display text-xl font-bold tracking-[0.18em] ${light ? 'text-white' : 'text-[#7f4c5a]'}`}>
          {name}
        </span>
      )}
    </Link>
  );
}

/* --------------------------------- Navbar -------------------------------- */
export function Navbar() {
  const { cartCount, setCartOpen, session, logout } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const nav = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const results = query.trim()
    ? getVisibleProducts().filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const links = (
    <>
      <NavLink to="/" end className={({ isActive }) => `navlink text-sm font-medium ${isActive ? 'active text-[#b56576]' : 'text-[#6b5560]'}`}>Home</NavLink>
      <NavLink to="/shop" className={({ isActive }) => `navlink text-sm font-medium ${isActive ? 'active text-[#b56576]' : 'text-[#6b5560]'}`}>Shop</NavLink>
      <NavLink to="/track" className={({ isActive }) => `navlink text-sm font-medium ${isActive ? 'active text-[#b56576]' : 'text-[#6b5560]'}`}>Track Order</NavLink>
      <NavLink to="/account" className={({ isActive }) => `navlink text-sm font-medium ${isActive ? 'active text-[#b56576]' : 'text-[#6b5560]'}`}>
        {session && session.role === 'customer' ? 'My Orders' : 'Account'}
      </NavLink>
    </>
  );

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#fffaf0]/90 shadow-md shadow-rose-100/60 backdrop-blur-lg' : 'bg-transparent'}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3.5 sm:px-6">
        <Logo />

        <nav className="ml-6 hidden items-center gap-7 md:flex">{links}</nav>

        {/* live search */}
        <div ref={boxRef} className="relative ml-auto hidden w-64 lg:block">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Search…"
            className="input-soft py-2! pl-9"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rose-300">⌕</span>
          {showResults && query.trim() && (
            <div className="anim-fade absolute mt-2 w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-rose-100">
              {results.length === 0 && <p className="p-4 text-sm text-rose-300">No matches for “{query}”</p>}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setShowResults(false); setQuery(''); nav(`/product/${p.id}`); }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#fff3ef]"
                >
                  <SafeImage src={p.images?.[0]} alt="" className="h-10 w-10 rounded-lg" imgClassName="object-cover" />
                  <span className="flex-1 text-sm font-medium text-[#5d4954]">{p.name}</span>
                  <span className="text-xs font-semibold text-[#b56576]">{money(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* cart button */}
        <button
          id="cart-btn"
          onClick={() => setCartOpen(true)}
          className="relative ml-auto grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow-md ring-1 ring-rose-100 transition hover:scale-105 active:scale-95 lg:ml-0"
          aria-label="Open cart"
        >
          🛍️
          {cartCount > 0 && (
            <span className="anim-pop absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] px-1 text-[10px] font-bold text-white shadow">
              {cartCount}
            </span>
          )}
        </button>

        {session && session.role === 'customer' && (
          <button onClick={() => logout()} className="hidden text-xs font-medium text-rose-400 transition hover:text-[#b56576] md:block">
            Logout
          </button>
        )}

        {/* hamburger */}
        <button onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-md ring-1 ring-rose-100 md:hidden" aria-label="Menu">
          <div className="space-y-1.5">
            <span className={`block h-0.5 w-5 rounded bg-[#7f4c5a] transition-all ${open ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 rounded bg-[#7f4c5a] transition-all ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 rounded bg-[#7f4c5a] transition-all ${open ? '-translate-y-2 -rotate-45' : ''}`} />
          </div>
        </button>
      </div>

      {/* mobile menu */}
      <div className={`overflow-hidden transition-all duration-300 md:hidden ${open ? 'max-h-72' : 'max-h-0'}`}>
        <nav className="flex flex-col gap-4 bg-[#fffaf0]/95 px-6 pb-5 pt-2 backdrop-blur" onClick={() => setOpen(false)}>
          {links}
          <input
            placeholder="Search…"
            className="input-soft"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { nav(`/shop?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`); setOpen(false); }
            }}
          />
          {session && session.role === 'customer' && (
            <button onClick={logout} className="text-left text-sm font-medium text-rose-400">Logout ({session.username})</button>
          )}
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------ Cart drawer ------------------------------ */
export function CartDrawer() {
  const { cartOpen, setCartOpen, cartProducts, setQty, removeFromCart, cartTotal } = useStore();
  const nav = useNavigate();
  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-[#41323a]/40 backdrop-blur-sm transition-opacity duration-300 ${cartOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setCartOpen(false)}
      />
      <aside
        className={`fixed right-0 top-0 z-[95] flex h-full w-full max-w-md flex-col bg-[#fffaf0] shadow-2xl transition-transform duration-500 ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)' }}
      >
        <div className="flex items-center justify-between border-b border-rose-100 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-[#7f4c5a]">Your Cart 🌸</h2>
          <button onClick={() => setCartOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow ring-1 ring-rose-100 transition hover:rotate-90">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cartProducts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl">🌷</span>
              <p className="font-display text-lg font-semibold text-[#7f4c5a]">Your cart is empty</p>
              <button onClick={() => { setCartOpen(false); nav('/shop'); }} className="btn-grad mt-2 rounded-full px-6 py-2.5 text-sm font-semibold">
                Browse the shop
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {cartProducts.map(({ product, quantity }) => (
                <li key={product.id} className="anim-fade flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-rose-50">
                  <SafeImage src={product.images?.[0]} alt={product.name} className="h-20 w-20 rounded-xl" imgClassName="object-cover" />
                  <div className="flex flex-1 flex-col">
                    <p className="text-sm font-semibold text-[#5d4954]">{product.name}</p>
                    <p className="text-xs font-medium text-[#b56576]">{money(product.price)}</p>
                    <div className="mt-auto flex items-center gap-2">
                      <button onClick={() => setQty(product.id, quantity - 1)} className="grid h-7 w-7 place-items-center rounded-full bg-[#fcd5ce]/60 text-sm font-bold text-[#7f4c5a] transition active:scale-90">−</button>
                      <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                      <button onClick={() => setQty(product.id, Math.min(quantity + 1, product.stock || 99))} className="grid h-7 w-7 place-items-center rounded-full bg-[#fcd5ce]/60 text-sm font-bold text-[#7f4c5a] transition active:scale-90">+</button>
                      <button onClick={() => removeFromCart(product.id)} className="ml-auto text-xs text-rose-300 transition hover:text-red-500">Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cartProducts.length > 0 && (
          <div className="border-t border-rose-100 px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-[#a98993]">Subtotal</span>
              <span className="font-display text-xl font-bold text-[#7f4c5a]">{money(cartTotal)}</span>
            </div>
            <button onClick={() => { setCartOpen(false); nav('/checkout'); }} className="btn-grad w-full rounded-full py-3 text-sm font-semibold tracking-wide">
              Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

/* --------------------------------- Footer -------------------------------- */
export function Footer() {
  const name = getSetting('store_name');
  const tagline = getSetting('tagline');
  const phone = getSetting('phone');
  const address = getSetting('address');
  const email = getSetting('email');
  const website = getSetting('website');
  const hours = getSetting('business_hours');
  const instagram = getSetting('instagram');
  const facebook = getSetting('facebook');
  const tiktok = getSetting('tiktok');
  const whatsapp = getSetting('whatsapp');
  const paymentText = getSetting('payment_text');

  const socials: [string, string][] = [
    ['Instagram', instagram],
    ['Facebook', facebook],
    ['TikTok', tiktok],
    ['WhatsApp', whatsapp],
  ].filter(([, url]) => !!url) as [string, string][];

  const hasContact = phone || address || email || website || hours;
  const hasBrand = name || tagline;

  return (
    <footer className="relative z-10 mt-20 bg-gradient-to-br from-[#7f4c5a] to-[#4f3340] text-rose-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {hasBrand && (
          <div>
            {name && <p className="font-display text-2xl font-bold tracking-[0.18em] text-white">✿ {name}</p>}
            {tagline && <p className="mt-3 text-sm leading-relaxed text-rose-200/80">{tagline}</p>}
          </div>
        )}

        {hasContact && (
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#fcd5ce]">Contact</h4>
            {phone && (
              <p className="text-sm text-rose-200/80">
                📞 <a href={`tel:${phone.replace(/\s+/g, '')}`} className="underline-offset-2 hover:underline hover:text-white">{phone}</a>
              </p>
            )}
            {email && (
              <p className="mt-2 text-sm text-rose-200/80">
                ✉️ <a href={`mailto:${email}`} className="underline-offset-2 hover:underline hover:text-white">{email}</a>
              </p>
            )}
            {website && (
              <p className="mt-2 text-sm text-rose-200/80">
                🌐 <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline hover:text-white">{website}</a>
              </p>
            )}
            {address && <p className="mt-2 text-sm text-rose-200/80">📍 {address}</p>}
            {hours && <p className="mt-2 whitespace-pre-line text-sm text-rose-200/80">🕒 {hours}</p>}
          </div>
        )}

        {socials.length > 0 && (
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#fcd5ce]">Follow us</h4>
            <div className="flex flex-wrap gap-3">
              {socials.map(([n, url]) => (
                <a key={n} href={url} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium transition hover:-translate-y-1 hover:bg-white/20">
                  {n}
                </a>
              ))}
            </div>
          </div>
        )}

        {paymentText && (
          <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/10">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#fcd5ce]">💝 Payment</h4>
            <p className="text-sm leading-relaxed text-rose-200/80"><RichText text={paymentText} /></p>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-rose-200/60">
        © {new Date().getFullYear()}{name ? ` ${name}` : ''} ·{' '}
        <Link to="/track" className="underline-offset-2 hover:underline hover:text-white">Track order</Link> ·{' '}
        <Link to="/admin/login" className="underline-offset-2 hover:underline">Admin</Link>
      </div>
    </footer>
  );
}
