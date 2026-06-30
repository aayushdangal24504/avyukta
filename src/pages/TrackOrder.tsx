/** Track Order — public lookup by tracking code (no login required). */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getOrderByTrackingCode, getOrderItems, money } from '../lib/db';
import { EmptyState, StatusBadge } from '../components/ui';

export default function TrackOrder() {
  const { code: urlCode } = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(urlCode || '');
  const order = urlCode ? getOrderByTrackingCode(urlCode) : null;
  const items = order ? getOrderItems(order.id) : [];

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    nav(`/track/${c}`);
  };

  return (
    <div className="page-enter mx-auto max-w-2xl px-6 py-12">
      <h1 className="anim-up font-display text-3xl font-bold text-[#41323a] sm:text-4xl">Track your order</h1>
      <p className="anim-up mt-2 text-sm text-[#a98993]" style={{ animationDelay: '.1s' }}>
        Enter your tracking code below. You can find it in your order confirmation email.
      </p>

      <form onSubmit={lookup} className="anim-up mt-6 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '.15s' }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your tracking code"
          className="input-soft flex-1 font-mono text-sm"
          autoFocus={!urlCode}
        />
        <button type="submit" className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Track</button>
      </form>

      {urlCode && !order && (
        <div className="mt-10">
          <EmptyState
            icon="🔍"
            title="Order not found"
            sub="Double-check your tracking code — it's case-sensitive. If you still can't find it, contact us with the email used to place the order."
            action={<Link to="/" className="btn-ghost rounded-full px-6 py-2.5 text-sm font-semibold">Back home</Link>}
          />
        </div>
      )}

      {order && (
        <div className="anim-up mt-8 space-y-5" style={{ animationDelay: '.2s' }}>
          <div className="rounded-3xl bg-white p-7 shadow-lg shadow-rose-100/60 ring-1 ring-rose-50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">Order</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-[#41323a]">#{order.id}</h2>
                <p className="mt-1 text-xs text-[#a98993]">Placed {new Date(order.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-rose-50/60 p-4 text-sm">
              <p><span className="font-semibold text-[#7f4c5a]">Customer:</span> {order.customer_name}</p>
              {order.phone && <p><span className="font-semibold text-[#7f4c5a]">Phone:</span> {order.phone}</p>}
              {order.email && <p><span className="font-semibold text-[#7f4c5a]">Email:</span> {order.email}</p>}
              {order.location && <p><span className="font-semibold text-[#7f4c5a]">Address:</span> {order.location}</p>}
              {order.notes && <p><span className="font-semibold text-[#7f4c5a]">Notes:</span> {order.notes}</p>}
              <p className="break-all"><span className="font-semibold text-[#7f4c5a]">Tracking code:</span> <code className="font-mono text-xs">{order.tracking_code}</code></p>
            </div>

            <ul className="mt-5 divide-y divide-rose-50">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between py-2.5 text-sm">
                  <span className="text-[#5d4954]">{i.product_name} <span className="text-[#a98993]">× {i.quantity}</span></span>
                  <span className="font-semibold">{money(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-rose-100 pt-3">
              <span className="font-semibold text-[#7f4c5a]">Total</span>
              <span className="font-display text-lg font-bold text-[#b56576]">{money(order.total)}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/shop" className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Continue shopping</Link>
            <Link to="/account" className="btn-ghost rounded-full px-7 py-2.5 text-sm font-semibold">My account</Link>
          </div>
        </div>
      )}
    </div>
  );
}
