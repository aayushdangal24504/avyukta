/** Checkout — polished multi-step flow.
 *
 *  1) Shipping     — name, phone, email, address, notes
 *  2) Review       — confirm items, address, payment method
 *  3) Place Order  — final submit. After the order is created we transition
 *                    to a "Payment / Confirmation" interstitial that shows the
 *                    admin-editable `checkout_payment_message` and requires the
 *                    customer to press "I Confirm" before the final success
 *                    page is shown.
 *
 *  UX: every step auto-scrolls to the top with a smooth animation. The success
 *  page is laid out to fit within the desktop viewport without scrolling.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createOrder,
  getOrderItems,
  getSetting,
  money,
  validPhone,
} from '../lib/db';
import { useStore } from '../lib/store';
import { sendOrderEmails } from '../lib/email';
import { EmptyState, SafeImage, Spinner } from '../components/ui';
import { RichText } from '../components/RichText';

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/* ----------------------------- scroll helper ------------------------------ */
function useScrollToTop(deps: unknown[]) {
  useEffect(() => {
    // smooth scroll, with a fallback to instant when prefers-reduced-motion
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // also scroll the document element (some browsers)
    document.documentElement.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ----------------------------- step indicator ----------------------------- */
function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Shipping' },
    { n: 2, label: 'Review' },
    { n: 3, label: 'Place Order' },
  ] as const;
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((s, i) => {
        const isActive = s.n === current;
        const isDone = s.n < current;
        return (
          <li key={s.n} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-all duration-300 ${
                  isDone
                    ? 'bg-gradient-to-br from-[#b56576] to-[#d291bc] text-white shadow'
                    : isActive
                    ? 'bg-white text-[#b56576] ring-2 ring-[#b56576] shadow'
                    : 'bg-white/70 text-rose-300 ring-1 ring-rose-200'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? '✓' : s.n}
              </div>
              <span
                className={`hidden text-xs font-semibold sm:inline ${
                  isActive ? 'text-[#7f4c5a]' : 'text-rose-300'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-6 transition-colors duration-300 sm:w-10 ${
                  isDone ? 'bg-[#b56576]' : 'bg-rose-200'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------- checkout ------------------------------- */
export default function Checkout() {
  const { cartProducts, cartTotal, clearCart, session, toast } = useStore();
  const nav = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    location: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /** After the order is placed we set this and show the "I Confirm" interstitial.
   *  Only when `confirmed === true` do we reveal the success page. */
  const [pending, setPending] = useState<{
    id: number;
    trackingCode: string;
    email: string;
    items: { name: string; quantity: number; price: number; image: string }[];
    total: number;
    customer: { name: string; phone: string; email: string; location: string; notes: string };
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);

  // admin-editable copy (auto-syncs — re-reads on every render because it's a settings read)
  const checkoutPayment = getSetting('checkout_payment_message');
  const emailHelper = getSetting('checkout_email_helper');
  const footerNote = getSetting('checkout_footer_note');
  const successTitle = getSetting('success_title') || '🎉 Order Placed Successfully!';
  const successMessage =
    getSetting('success_message') ||
    'Thank you for your order. We have sent a confirmation email with your tracking details. Our team will reach out shortly to confirm payment and delivery.';
  const trackingNote =
    getSetting('tracking_note') ||
    '💡 Save or copy your tracking number to keep track of your order through this site.';

  // Always start at the top on mount and on every step change
  useScrollToTop([step, confirmed, !!pending]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validateShipping = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your full name.';
    if (!validPhone(form.phone)) e.phone = 'Phone must be 7–15 digits.';
    if (!validEmail(form.email)) e.email = 'Please enter a valid email address.';
    if (form.location.trim().length < 5) e.location = 'Please enter a full delivery address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (step === 1) {
      if (!validateShipping()) {
        toast('Please fix the highlighted fields.', 'error');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };
  const goBack = () => {
    if (step === 1) return;
    setStep((s) => (s === 3 ? 2 : 1));
  };

  const placeOrder = async () => {
    if (busy || pending) return; // disable duplicate submissions
    setBusy(true);
    try {
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

      // fire-and-await email
      const trackingUrl = `${window.location.origin}${window.location.pathname}#/track/${order.tracking_code}`;
      const result = await sendOrderEmails({
        order,
        items: getOrderItems(order.id),
        trackingUrl,
      });
      if (!result.ok && result.warning) {
        console.warn('Email dispatch issue:', result.warning);
      }

      // snapshot cart for the success page
      const itemsSnapshot = cartProducts.map((c) => ({
        name: c.product.name,
        quantity: c.quantity,
        price: c.product.price,
        image: c.product.images?.[0] || '',
      }));
      const totalSnapshot = cartTotal;

      clearCart();

      setPending({
        id: order.id,
        trackingCode: order.tracking_code,
        email: order.email,
        items: itemsSnapshot,
        total: totalSnapshot,
        customer: {
          name: form.name,
          phone: form.phone,
          email: form.email,
          location: form.location,
          notes: form.notes,
        },
      });
      setConfirmed(false);
    } catch (e) {
      toast(`Could not place order: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = () => {
    if (confirming || confirmed) return;
    setConfirming(true);
    // small UX beat so the button shows feedback
    window.setTimeout(() => {
      setConfirmed(true);
      setConfirming(false);
    }, 280);
  };

  /* --------------------- FINAL: confirmation page (success) --------------------- */
  if (pending && confirmed) {
    return <SuccessPage order={pending} successTitle={successTitle} successMessage={successMessage} trackingNote={trackingNote} checkoutPayment={checkoutPayment} />;
  }

  /* --------------------- INTERSTITIAL: payment / confirmation message --------------------- */
  if (pending && !confirmed) {
    return (
      <PaymentConfirmationStep
        order={pending}
        checkoutPayment={checkoutPayment}
        footerNote={footerNote}
        confirming={confirming}
        onConfirm={handleConfirm}
      />
    );
  }

  /* --------------------- Empty cart guard --------------------- */
  if (cartProducts.length === 0) {
    return (
      <div className="page-enter mx-auto max-w-3xl px-6 py-16">
        <EmptyState
          icon="🛍️"
          title="Your cart is empty"
          sub="Add a few items before checking out."
          action={
            <button
              onClick={() => nav('/shop')}
              className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold"
            >
              Go to shop
            </button>
          }
        />
      </div>
    );
  }

  /* --------------------- form helpers --------------------- */
  const field = (
    k: keyof typeof form,
    label: string,
    placeholder: string,
    type = 'text',
    as: 'input' | 'textarea' = 'input',
    rows = 2,
  ) => (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">
        {label}
      </label>
      {as === 'input' ? (
        <input
          type={type}
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder={placeholder}
          className={`input-soft ${errors[k] ? '!border-red-400' : ''}`}
        />
      ) : (
        <textarea
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={`input-soft resize-none ${errors[k] ? '!border-red-400' : ''}`}
        />
      )}
      {errors[k] && <p className="anim-fade mt-1 text-xs text-red-500">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="page-enter mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div ref={topRef} />

      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#d291bc]">
          Secure checkout
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-[#41323a] sm:text-4xl">
          Checkout 🎀
        </h1>
        <div className="mt-5">
          <Stepper current={step} />
        </div>
      </div>

      {checkoutPayment && step === 1 && (
        <div className="anim-up mx-auto mt-6 max-w-3xl rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-rose-100">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#7f4c5a]">
            📜 Order Confirmation &amp; Payment
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6b5560]">
            <RichText text={checkoutPayment} />
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* LEFT: form / step content */}
        <div className="anim-up rounded-3xl bg-white p-5 shadow-lg shadow-rose-100/60 ring-1 ring-rose-50 sm:p-7 lg:col-span-3">
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                goNext();
              }}
              noValidate
              className="space-y-5"
            >
              <h2 className="font-display text-xl font-bold text-[#41323a]">
                📦 Shipping details
              </h2>
              {field('name', 'Full name *', 'Your full name')}
              {field('phone', 'Phone number *', '7–15 digits', 'tel')}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">
                  Email address *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder={
                    emailHelper ||
                    'Please enter your active email address to receive order confirmation & tracking updates.'
                  }
                  className={`input-soft ${errors.email ? '!border-red-400' : ''}`}
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="anim-fade mt-1 text-xs text-red-500">{errors.email}</p>
                )}
                {emailHelper && !errors.email && (
                  <p className="mt-1 text-[11px] text-[#a98993]">{emailHelper}</p>
                )}
              </div>
              {field('location', 'Location / address *', 'Street, building, city…', 'text', 'textarea', 2)}
              {field('notes', 'Notes (optional)', 'Gift message, delivery time preference…', 'text', 'textarea', 2)}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Link
                  to="/shop"
                  className="text-sm font-semibold text-rose-400 transition hover:text-[#b56576]"
                >
                  ← Continue shopping
                </Link>
                <button
                  type="submit"
                  className="btn-grad rounded-full px-7 py-3 text-sm font-semibold tracking-wide"
                >
                  Next: Review →
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-display text-xl font-bold text-[#41323a]">🔎 Review your order</h2>

              <div className="rounded-2xl bg-rose-50/60 p-4 ring-1 ring-rose-100 sm:p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#7f4c5a]">
                  Ship to
                </p>
                <p className="mt-2 text-sm font-semibold text-[#41323a]">{form.name}</p>
                <p className="text-sm text-[#6b5560]">{form.phone} · {form.email}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-[#6b5560]">{form.location}</p>
                {form.notes && (
                  <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs italic text-[#7f4c5a] ring-1 ring-rose-100">
                    Note: {form.notes}
                  </p>
                )}
                <button
                  onClick={() => setStep(1)}
                  className="mt-3 text-xs font-semibold text-[#b56576] hover:underline"
                >
                  Edit
                </button>
              </div>

              <div className="rounded-2xl bg-rose-50/60 p-4 ring-1 ring-rose-100 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#7f4c5a]">
                    Items ({cartProducts.length})
                  </p>
                  <button
                    onClick={() => setStep(1)}
                    className="text-xs font-semibold text-[#b56576] hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <ul className="mt-3 divide-y divide-white/60">
                  {cartProducts.map(({ product, quantity }) => (
                    <li key={product.id} className="flex items-center gap-3 py-2.5">
                      <SafeImage
                        src={product.images?.[0]}
                        alt=""
                        className="h-12 w-12 rounded-xl"
                        imgClassName="object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#5d4954]">
                          {product.name}
                        </p>
                        <p className="text-xs text-[#a98993]">× {quantity}</p>
                      </div>
                      <span className="text-sm font-semibold text-[#5d4954]">
                        {money(product.price * quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-rose-100 sm:p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#7f4c5a]">
                  Payment method
                </p>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-rose-50/60 p-3 ring-1 ring-rose-100">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-sm text-white">
                    💵
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#5d4954]">
                      About payment
                    </p>
                    <p className="text-xs text-[#a98993]">
                      **Payment details will be discussed via message or call after we review and confirm your order.**

                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={goBack}
                  className="btn-ghost rounded-full px-6 py-3 text-sm font-semibold"
                >
                  ← Back
                </button>
                <button
                  onClick={goNext}
                  className="btn-grad rounded-full px-7 py-3 text-sm font-semibold tracking-wide"
                >
                  Next: Place order →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-display text-xl font-bold text-[#41323a]">✨ Ready to place your order</h2>

              <div className="rounded-2xl bg-rose-50/60 p-5 ring-1 ring-rose-100">
                <p className="text-sm leading-relaxed text-[#6b5560]">
                 **No payment is required at this time. We will review and confirm your order first, then contact you by message or phone call with the payment details.**

                </p>
              </div>

              <ul className="space-y-2 text-sm text-[#5d4954]">
                <li className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[10px] text-white">✓</span>
                  Free delivery across the valley
                </li>
                <li className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[10px] text-white">✓</span>
                  Secure packaging for handmade items
                </li>
                <li className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-[10px] text-white">✓</span>
                 You will recieve Message or call about confirmation &amp; tracking code
                </li>
              </ul>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={goBack}
                  className="btn-ghost rounded-full px-6 py-3 text-sm font-semibold"
                  disabled={busy}
                >
                  ← Back
                </button>
                <button
                  onClick={placeOrder}
                  disabled={busy || !!pending}
                  className="btn-grad w-full max-w-xs rounded-full py-3.5 text-sm font-semibold tracking-wide disabled:opacity-70"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Placing your order…
                    </span>
                  ) : (
                    `Place Order · ${money(cartTotal)}`
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: order summary (sticky on desktop) */}
        <aside className="anim-up h-fit rounded-3xl bg-gradient-to-br from-[#7f4c5a] to-[#b56576] p-5 text-white shadow-xl sm:p-7 lg:sticky lg:top-24 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Order Summary</h2>
          <ul className="mt-5 space-y-4">
            {cartProducts.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-3">
                <SafeImage
                  src={product.images?.[0]}
                  alt=""
                  className="h-12 w-12 rounded-xl ring-2 ring-white/30"
                  imgClassName="object-cover"
                />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-rose-100/80">× {quantity}</p>
                </div>
                <span className="text-sm font-semibold">
                  {money(product.price * quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 border-t border-white/20 pt-4 text-sm">
            <div className="flex justify-between text-rose-100/90">
              <span>Delivery</span>
              <span>Free 🤍</span>
            </div>
            <div className="flex justify-between font-display text-xl font-bold">
              <span>Total</span>
              <span>{money(cartTotal)}</span>
            </div>
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

/* =========================================================================
 *   PAYMENT / CONFIRMATION INTERSTITIAL
 * ========================================================================= */
function PaymentConfirmationStep({
  order,
  checkoutPayment,
  footerNote,
  confirming,
  onConfirm,
}: {
  order: {
    id: number;
    trackingCode: string;
    email: string;
    total: number;
  };
  checkoutPayment: string;
  footerNote: string;
  confirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="page-enter mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full rounded-[1.75rem] bg-white p-6 shadow-xl shadow-rose-100/70 ring-1 ring-rose-50 sm:p-10">
        {/* header badge */}
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#fcd5ce] to-[#f8b4c0] text-2xl shadow">
          📜
        </div>
        <h1 className="anim-up mt-5 text-center font-display text-2xl font-bold text-[#41323a] sm:text-3xl">
          Payment &amp; Confirmation
        </h1>
        <p className="anim-up mx-auto mt-2 max-w-md text-center text-sm text-[#8c737e]">
          Your order <span className="font-mono font-semibold text-[#b56576]">#{order.id}</span> has been placed. Please read the
          confirmation message below and tap <strong>I Confirm</strong> to finalize.
        </p>

        {/* order ref strip */}
        <div className="anim-up mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-2xl bg-rose-50/60 px-4 py-3 text-xs text-[#5d4954] ring-1 ring-rose-100">
          <span>
            Order: <span className="font-mono font-bold text-[#b56576]">#{order.id}</span>
          </span>
          <span className="hidden h-3 w-px bg-rose-200 sm:inline-block" />
          <span>
            Tracking:{' '}
            <span className="font-mono font-semibold text-[#5d4954]">
              {order.trackingCode}
            </span>
          </span>
          <span className="hidden h-3 w-px bg-rose-200 sm:inline-block" />
          <span>
            Total: <span className="font-semibold text-[#b56576]">{money(order.total)}</span>
          </span>
        </div>

        {/* message body */}
        <div className="anim-up mt-6 max-h-[42vh] overflow-y-auto rounded-2xl border border-rose-100 bg-gradient-to-br from-[#fffaf0] to-[#fff3ef] p-5 text-sm leading-relaxed text-[#5d4954] shadow-inner sm:p-6">
          {checkoutPayment ? (
            <RichText text={checkoutPayment} />
          ) : (
            <p className="italic text-rose-400">
              (No confirmation message has been set. Add one in
              <span className="font-mono"> Admin → Settings → Checkout messaging</span>.)
            </p>
          )}
          {footerNote && (
            <div className="mt-4 border-t border-rose-100 pt-4 text-xs text-[#a98993]">
              <RichText text={footerNote} />
            </div>
          )}
        </div>

        <button
          onClick={onConfirm}
          disabled={confirming}
          className="btn-grad mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold tracking-wide disabled:opacity-70"
        >
          {confirming ? (
            <>
              <Spinner /> Confirming…
            </>
          ) : (
            <>I Confirm ✓</>
          )}
        </button>
        <p className="mt-3 text-center text-[11px] text-rose-300">
          By tapping &ldquo;I Confirm&rdquo; you acknowledge the message above.
        </p>
      </div>
    </div>
  );
}

/* =========================================================================
 *   FINAL CONFIRMATION PAGE
 * ========================================================================= */
function SuccessPage({
  order,
  successTitle,
  successMessage,
  trackingNote,
  checkoutPayment,
}: {
  order: {
    id: number;
    trackingCode: string;
    email: string;
    total: number;
    items: { name: string; quantity: number; price: number; image: string }[];
    customer: { name: string; phone: string; email: string; location: string; notes: string };
  };
  successTitle: string;
  successMessage: string;
  trackingNote: string;
  checkoutPayment: string;
}) {
  const trackUrl = `#/track/${order.trackingCode}`;

  return (
    <div className="page-enter mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="rounded-[1.75rem] bg-white p-5 shadow-xl shadow-rose-100/70 ring-1 ring-rose-50 sm:p-8">
        {/* success hero — compact, fits viewport on desktop */}
        <div className="flex flex-col items-center text-center">
          <div className="check-ring grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] shadow-xl shadow-rose-300/60 sm:h-20 sm:w-20">
            <svg viewBox="0 0 52 52" className="h-9 w-9 sm:h-11 sm:w-11">
              <path
                className="check-path"
                fill="none"
                stroke="#fff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 27l8 8 16-16"
              />
            </svg>
          </div>
          <h1 className="anim-up mt-4 font-display text-2xl font-bold text-[#41323a] sm:text-3xl">
            {successTitle}
          </h1>
          <p className="anim-up mx-auto mt-2 max-w-md text-sm text-[#8c737e] sm:text-base">
            <RichText text={successMessage} />
          </p>
        </div>

        {/* order meta strip */}
        <div className="anim-up mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-gradient-to-r from-[#fcd5ce] to-[#f8b4c0] px-4 py-2.5 text-xs font-semibold text-[#7f4c5a] shadow-sm ring-1 ring-rose-200">
          <span>Order: <span className="font-mono font-bold text-[#b56576]">#{order.id}</span></span>
          <span className="hidden h-3 w-px bg-rose-200 sm:inline-block" />
          <span>Tracking: <span className="font-mono">{order.trackingCode}</span></span>
        </div>

        {/* details: two columns on sm+ */}
        <div className="anim-up mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-rose-50/60 p-4 ring-1 ring-rose-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7f4c5a]">
              Customer
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[#41323a]">
              {order.customer.name}
            </p>
            <p className="text-xs text-[#6b5560]">{order.customer.phone}</p>
            <p className="text-xs text-[#6b5560]">{order.customer.email}</p>
          </div>
          <div className="rounded-2xl bg-rose-50/60 p-4 ring-1 ring-rose-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7f4c5a]">
              Ship to
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm text-[#5d4954]">
              {order.customer.location}
            </p>
            {order.customer.notes && (
              <p className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] italic text-[#7f4c5a] ring-1 ring-rose-100">
                {order.customer.notes}
              </p>
            )}
          </div>
        </div>

        {/* items */}
        {order.items.length > 0 && (
          <div className="anim-up mt-3 rounded-2xl bg-white p-4 ring-1 ring-rose-100">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#7f4c5a]">
                Your order
              </p>
              <span className="text-[10px] font-semibold text-rose-300">
                {order.items.length} item{order.items.length > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="mt-2 divide-y divide-rose-50">
              {order.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <SafeImage
                    src={it.image}
                    alt=""
                    className="h-10 w-10 rounded-lg"
                    imgClassName="object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#5d4954]">
                      {it.name}
                    </p>
                    <p className="text-xs text-[#a98993]">× {it.quantity}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#5d4954]">
                    {money(it.price * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-rose-100 pt-2">
              <span className="text-xs font-semibold text-[#7f4c5a]">Total</span>
              <span className="font-display text-base font-bold text-[#b56576]">
                {money(order.total)}
              </span>
            </div>
          </div>
        )}

        {/* payment method + delivery */}
        <div className="anim-up mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-rose-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7f4c5a]">
              Payment
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-sm text-white">
                💵
              </div>
              <div>
                <p className="text-sm font-semibold text-[#5d4954]">Cash on Delivery</p>
                <p className="text-[11px] text-[#a98993]">Pay when your order arrives</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-rose-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7f4c5a]">
              Estimated delivery
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-sm text-white">
                🚚
              </div>
              <div>
                <p className="text-sm font-semibold text-[#5d4954]">2–4 business days</p>
                <p className="text-[11px] text-[#a98993]">Hand-packed with care 🤍</p>
              </div>
            </div>
          </div>
        </div>

        {/* tracking tip */}
        <div className="anim-up mt-3 rounded-xl bg-gradient-to-r from-[#fcd5ce] to-[#f8b4c0] px-3.5 py-2.5 text-center text-xs font-semibold leading-relaxed text-[#7f4c5a] ring-1 ring-rose-200">
          <RichText text={trackingNote} />
        </div>

        {/* admin payment message reminder (collapsed) */}
        {checkoutPayment && (
          <details className="anim-up mt-3 rounded-2xl bg-rose-50/40 ring-1 ring-rose-100 group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-semibold text-[#7f4c5a]">
              <span>📜 View payment &amp; confirmation message</span>
              <span className="transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="border-t border-rose-100 px-4 py-3 text-xs leading-relaxed text-[#5d4954]">
              <RichText text={checkoutPayment} />
            </div>
          </details>
        )}

        {/* CTAs */}
        <div className="anim-up mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            to="/shop"
            className="btn-grad rounded-full px-6 py-3 text-sm font-semibold"
          >
            Continue shopping
          </Link>
          <Link
            to={trackUrl}
            className="btn-ghost rounded-full px-6 py-3 text-sm font-semibold"
          >
            Track order
          </Link>
        </div>
      </div>
    </div>
  );
}
