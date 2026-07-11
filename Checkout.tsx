/** Checkout: validated form, order summary, email + tracking, async email send. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createOrder, getOrderItems, getSetting, money, validPhone } from '../lib/db';
import { useStore } from '../lib/store';
import { sendOrderEmails } from '../lib/email';
import { EmptyState, SafeImage, Spinner } from '../components/ui';
import { RichText } from '../components/RichText';

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function Checkout() {
  const { cartProducts, cartTotal, clearCart, session, toast } = useStore();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', email: '', location: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    id: number;
    trackingCode: string;
    email: string;
    items: { name: string; quantity: number; price: number; image: string }[];
    total: number;
  } | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // editable copy (admin → Settings)
  const checkoutPayment = getSetting('checkout_payment_message');
  const emailHelper = getSetting('checkout_email_helper');
  const footerNote = getSetting('checkout_footer_note');

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your full name.';
    if (!validPhone(form.phone)) e.phone = 'Phone must be 7–15 digits.';
    if (!validEmail(form.email)) e.email = 'Please enter a valid email address.';
    if (form.location.trim().length < 5) e.location = 'Please enter a full delivery address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return toast('Please fix the highlighted fields.', 'error');
    setBusy(true);
    try {
      // 1) Create the order
      const order = createOrder(
        {
          customer_name: form.name,
          phone: form.phone,
          email: form.email,
          location: form.location,
          notes: form.notes,
          user_id: session?.role === 'customer' ? session.user_id : null,
        },
        cartProducts.map((c) => ({ product_id: c.product.id, quantity: c.quantity })),
      );

      // 2) Fire-and-await emails (function gracefully no-ops if not deployed)
      const trackingUrl = `${window.location.origin}${window.location.pathname}#/track/${order.tracking_code}`;
      const result = await sendOrderEmails({
        order,
        items: getOrderItems(order.id),
        trackingUrl,
      });
      if (!result.ok && result.warning) {
        // Show a soft warning but don't fail the checkout
        console.warn('Email dispatch issue:', result.warning);
      }

      // Snapshot the cart BEFORE we clear it, so the success page can show "your order"
      const itemsSnapshot = cartProducts.map((c) => ({
        name: c.product.name,
        quantity: c.quantity,
        price: c.product.price,
        image: c.product.images?.[0] || '',
      }));
      const totalSnapshot = cartTotal;

      clearCart();
      setDone({
        id: order.id,
        trackingCode: order.tracking_code,
        email: order.email,
        items: itemsSnapshot,
        total: totalSnapshot,
      });
    } catch (e) {
      toast(`Could not place order: ${(e as Error).message}`, 'error');
    }
    setBusy(false);
  };

  /* ----------------------------- success view ----------------------------- */
  if (done) {
    const successTitle = getSetting('success_title') || '🎉 Order Received Successfully!';
    const successMessage =
      getSetting('success_message') ||
      'Thank you for your order.\n\nA confirmation email containing your order details and tracking information has been sent to your email address.\n\nOur team will review your order and contact you shortly to confirm the details, discuss delivery arrangements, and finalize payment options.\n\nPlease keep an eye on your email and phone for updates.';
    const trackUrl = `#/track/${done.trackingCode}`;
    return (
      <div className="page-enter mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-rose-100/70 ring-1 ring-rose-50 sm:p-12">
          <div className="check-ring mx-auto grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] shadow-2xl shadow-rose-300/60">
            <svg viewBox="0 0 52 52" className="h-12 w-12">
              <path className="check-path" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M14 27l8 8 16-16" />
            </svg>
          </div>
          <h1 className="anim-up mt-8 text-center font-display text-3xl font-bold text-[#41323a]" style={{ animationDelay: '.3s' }}>
            {successTitle}
          </h1>
          <p className="anim-up mx-auto mt-4 max-w-md text-center text-[#8c737e]" style={{ animationDelay: '.45s' }}>
            <RichText text={successMessage} />
          </p>

          <div className="anim-up mt-8 grid gap-3 rounded-2xl bg-rose-50/60 p-5 text-sm" style={{ animationDelay: '.55s' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#7f4c5a]">Order number</span>
              <span className="font-mono font-bold text-[#b56576]">#{done.id}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#7f4c5a]">Tracking number</span>
              <span className="font-mono text-xs text-[#5d4954] break-all">{done.trackingCode}</span>
            </div>

            {/* Highlighted note (admin-editable: `tracking_note`) */}
            <div className="mt-1 rounded-xl bg-gradient-to-r from-[#fcd5ce] to-[#f8b4c0] px-4 py-3 text-center text-xs font-semibold leading-relaxed text-[#7f4c5a] shadow-sm ring-1 ring-rose-200">
              <RichText text={getSetting('tracking_note') || '💡 Save or copy your tracking number to keep track of your order through this site.'} />
            </div>
          </div>

          {done.items.length > 0 && (
            <div className="anim-up mt-4 rounded-2xl bg-white p-5 ring-1 ring-rose-100" style={{ animationDelay: '.6s' }}>
              <p className="mb-3 text-sm font-semibold text-[#7f4c5a]">Your order</p>
              <ul className="divide-y divide-rose-50">
                {done.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <SafeImage src={it.image} alt="" className="h-12 w-12 rounded-lg" imgClassName="object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#5d4954]">{it.name}</p>
                      <p className="text-xs text-[#a98993]">× {it.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#5d4954]">{money(it.price * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-rose-100 pt-3">
                <span className="text-sm font-semibold text-[#7f4c5a]">Total</span>
                <span className="font-display text-lg font-bold text-[#b56576]">{money(done.total)}</span>
              </div>
            </div>
          )}

          <div className="anim-up mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '.7s' }}>
            <Link to="/shop" className="btn-grad rounded-full px-7 py-3 text-sm font-semibold">Continue shopping</Link>
            <Link to={trackUrl} className="btn-ghost rounded-full px-7 py-3 text-sm font-semibold">Track order</Link>
          </div>
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
          sub="Add a few items before checking out."
          action={<button onClick={() => nav('/shop')} className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Go to shop</button>}
        />
      </div>
    );
  }

  const field = (k: keyof typeof form, label: string, placeholder: string, type = 'text') => (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className={`input-soft ${errors[k] ? 'border-red-400!' : ''}`}
      />
      {errors[k] && <p className="anim-fade mt-1 text-xs text-red-500">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="page-enter mx-auto max-w-6xl px-6 py-10">
      <h1 className="anim-up font-display text-3xl font-bold text-[#41323a] sm:text-4xl">Checkout 🎀</h1>

      {checkoutPayment && (
        <div className="anim-up mt-4 rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-rose-100" style={{ animationDelay: '.1s' }}>
          <h2 className="font-display text-base font-bold text-[#7f4c5a]">Order Confirmation &amp; Payment</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6b5560]"><RichText text={checkoutPayment} /></p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* form */}
        <form onSubmit={submit} noValidate className="anim-up space-y-5 rounded-3xl bg-white p-7 shadow-lg shadow-rose-100/60 ring-1 ring-rose-50 lg:col-span-3" style={{ animationDelay: '.15s' }}>
          {field('name', 'Full name *', 'Your full name')}
          {field('phone', 'Phone number *', '7–15 digits', 'tel')}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Email Address *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder={emailHelper || 'Please enter your active email address to receive order confirmation, tracking updates, and important information about your order.'}
              className={`input-soft ${errors.email ? 'border-red-400!' : ''}`}
              autoComplete="email"
            />
            {errors.email && <p className="anim-fade mt-1 text-xs text-red-500">{errors.email}</p>}
            {emailHelper && !errors.email && (
              <p className="mt-1 text-[11px] text-[#a98993]">{emailHelper}</p>
            )}
          </div>

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
                <SafeImage src={product.images?.[0]} alt="" className="h-12 w-12 rounded-xl ring-2 ring-white/30" imgClassName="object-cover" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-rose-100/80">× {quantity}</p>
                </div>
                <span className="text-sm font-semibold">{money(product.price * quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 border-t border-white/20 pt-4 text-sm">
            <div className="flex justify-between text-rose-100/90"><span>Delivery</span><span>N/A 🤍</span></div>
            <div className="flex justify-between font-display text-xl font-bold"><span>Total</span><span>{money(cartTotal)}</span></div>
          </div>
          {footerNote && (
            <p className="mt-5 rounded-2xl bg-white/15 p-4 text-xs leading-relaxed text-rose-50">
              <RichText text={footerNote} />
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
