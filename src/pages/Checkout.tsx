/** Checkout: validated form, order summary, animated success confirmation. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createOrder, money, validPhone } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Spinner } from '../components/ui';

export default function Checkout() {
  const { cartProducts, cartTotal, clearCart, session, toast } = useStore();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', location: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<number | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your full name.';
    if (!validPhone(form.phone)) e.phone = 'Phone must be 7–15 digits.';
    if (form.location.trim().length < 5) e.location = 'Please enter a full delivery address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return toast('Please fix the highlighted fields.', 'error');
    setBusy(true);
    await new Promise((r) => setTimeout(r, 900)); // simulated request
    const id = createOrder(
      { customer_name: form.name, phone: form.phone, location: form.location, notes: form.notes, user_id: session?.role === 'customer' ? session.user_id : null },
      cartProducts.map((c) => ({ product_id: c.product.id, quantity: c.quantity }))
    );
    clearCart();
    setBusy(false);
    setDoneId(id);
  };

  /* ----------------------------- success view ----------------------------- */
  if (doneId) {
    return (
      <div className="page-enter mx-auto max-w-lg px-6 py-20 text-center">
        <div className="check-ring mx-auto grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] shadow-2xl shadow-rose-300/60">
          <svg viewBox="0 0 52 52" className="h-14 w-14">
            <path className="check-path" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M14 27l8 8 16-16" />
          </svg>
        </div>
        <h1 className="anim-up mt-8 font-display text-3xl font-bold text-[#41323a]" style={{ animationDelay: '.4s' }}>Order placed! 🌸</h1>
        <p className="anim-up mt-3 text-[#8c737e]" style={{ animationDelay: '.55s' }}>
          Thank you! Your order <span className="font-bold text-[#b56576]">#{doneId}</span> has been received.
          We'll call you shortly to confirm — payment is cash on delivery.
        </p>
        <div className="anim-up mt-8 flex justify-center gap-3" style={{ animationDelay: '.7s' }}>
          <Link to="/shop" className="btn-grad rounded-full px-7 py-3 text-sm font-semibold">Keep shopping</Link>
          <Link to="/account" className="btn-ghost rounded-full px-7 py-3 text-sm font-semibold">My orders</Link>
        </div>
      </div>
    );
  }

  if (cartProducts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState
          icon="🛍️"
          title="Your cart is empty"
          sub="Add a few handmade treasures before checking out."
          action={<button onClick={() => nav('/shop')} className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Go to shop</button>}
        />
      </div>
    );
  }

  const field = (k: keyof typeof form, label: string, placeholder: string, type = 'text') => (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">{label}</label>
      <input type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} className={`input-soft ${errors[k] ? 'border-red-400!' : ''}`} />
      {errors[k] && <p className="anim-fade mt-1 text-xs text-red-500">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="page-enter mx-auto max-w-6xl px-6 py-10">
      <h1 className="anim-up font-display text-3xl font-bold text-[#41323a] sm:text-4xl">Checkout 🎀</h1>
      <p className="anim-up mt-2 text-sm text-[#8c737e]" style={{ animationDelay: '.1s' }}>Cash on delivery / pay on confirmation — no online payment needed.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* form */}
        <form onSubmit={submit} className="anim-up space-y-5 rounded-3xl bg-white p-7 shadow-lg shadow-rose-100/60 ring-1 ring-rose-50 lg:col-span-3" style={{ animationDelay: '.15s' }}>
          {field('name', 'Full name *', 'e.g. Sara Malek')}
          {field('phone', 'Phone number *', '7–15 digits, e.g. 5550102030', 'tel')}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Location / address *</label>
            <textarea value={form.location} onChange={(e) => set('location', e.target.value)} rows={2} placeholder="Street, building, city…" className={`input-soft resize-none ${errors.location ? 'border-red-400!' : ''}`} />
            {errors.location && <p className="anim-fade mt-1 text-xs text-red-500">{errors.location}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Gift message, delivery time preference…" className="input-soft resize-none" />
          </div>
          <button type="submit" disabled={busy} className="btn-grad w-full rounded-full py-3.5 text-sm font-semibold tracking-wide disabled:opacity-70">
            {busy ? <span className="inline-flex items-center gap-2"><Spinner /> Placing your order…</span> : `Place Order · ${money(cartTotal)}`}
          </button>
        </form>

        {/* summary */}
        <aside className="anim-up h-fit rounded-3xl bg-gradient-to-br from-[#7f4c5a] to-[#b56576] p-7 text-white shadow-xl lg:col-span-2" style={{ animationDelay: '.25s' }}>
          <h2 className="font-display text-lg font-bold">Order Summary</h2>
          <ul className="mt-5 space-y-4">
            {cartProducts.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-3">
                <img src={product.images[0]} alt="" className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/30" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-rose-100/80">× {quantity}</p>
                </div>
                <span className="text-sm font-semibold">{money(product.price * quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 border-t border-white/20 pt-4 text-sm">
            <div className="flex justify-between text-rose-100/90"><span>Delivery</span><span>Free 🤍</span></div>
            <div className="flex justify-between font-display text-xl font-bold"><span>Total</span><span>{money(cartTotal)}</span></div>
          </div>
          <p className="mt-5 rounded-2xl bg-white/15 p-4 text-xs leading-relaxed text-rose-50">
            💝 We'll call you to confirm your order before crafting begins. Payment is collected in cash upon delivery.
          </p>
        </aside>
      </div>
    </div>
  );
}
