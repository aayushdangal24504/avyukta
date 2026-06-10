/** Admin dashboard: animated stat counters, 7-day sales chart, recent orders, low stock. */
import { Link } from 'react-router-dom';
import { getDB, money } from '../lib/db';
import { useStore } from '../lib/store';
import { Counter, StatusBadge } from '../components/ui';

export default function Dashboard() {
  useStore();
  const db = getDB();
  const orders = [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const revenue = db.orders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);
  const pending = db.orders.filter((o) => o.status === 'Pending').length;
  const lowStock = db.products.filter((p) => p.stock <= 5);

  // orders per day, last 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const count = db.orders.filter((o) => o.created_at.slice(0, 10) === key).length;
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), count };
  });
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  const stats = [
    { label: 'Total Orders', value: db.orders.length, icon: '📦', grad: 'from-[#b56576] to-[#d291bc]' },
    { label: 'Total Revenue', value: revenue, icon: '💰', grad: 'from-emerald-500 to-teal-400', money: true },
    { label: 'Total Products', value: db.products.length, icon: '🎁', grad: 'from-violet-500 to-fuchsia-400' },
    { label: 'Pending Orders', value: pending, icon: '⏳', grad: 'from-amber-500 to-orange-400' },
  ];

  return (
    <div className="page-enter space-y-8">
      <div className="anim-up">
        <h1 className="font-display text-3xl font-bold text-[#41323a]">Dashboard</h1>
        <p className="mt-1 text-sm text-[#a98993]">Here's how your handmade empire is doing today 🌸</p>
      </div>

      {/* stat cards with animated counters */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-100" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="flex items-center justify-between">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${s.grad} text-xl text-white shadow-lg`}>{s.icon}</span>
            </div>
            <p className="mt-4 font-display text-3xl font-bold text-[#41323a]">
              {s.money ? <Counter value={s.value} prefix="$" decimals={2} /> : <Counter value={s.value} />}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#a98993]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* sales chart */}
        <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50 xl:col-span-2" style={{ animationDelay: '.3s' }}>
          <h2 className="font-display text-lg font-bold text-[#41323a]">Orders — last 7 days</h2>
          <div className="mt-6 flex h-48 items-end gap-3">
            {days.map((d, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-bold text-[#b56576] opacity-0 transition group-hover:opacity-100">{d.count}</span>
                <div
                  className="w-full rounded-t-xl bg-gradient-to-t from-[#b56576] to-[#d291bc] transition-all duration-700 hover:opacity-80"
                  style={{ height: `${Math.max(6, (d.count / maxCount) * 100)}%`, animation: `fadeUp .8s ${0.4 + i * 0.08}s cubic-bezier(.22,1,.36,1) both` }}
                />
                <span className="text-[10px] font-medium uppercase text-[#a98993]">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* low stock alerts */}
        <div className="anim-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.38s' }}>
          <h2 className="font-display text-lg font-bold text-[#41323a]">⚠️ Low stock</h2>
          {lowStock.length === 0 ? (
            <p className="mt-5 text-sm text-[#a98993]">All products are well stocked 🎉</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-amber-50/70 p-3 ring-1 ring-amber-100">
                  <img src={p.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#5d4954]">{p.name}</p>
                    <p className="text-xs font-semibold text-amber-600">{p.stock === 0 ? 'OUT OF STOCK' : `${p.stock} left`}</p>
                  </div>
                  <Link to="/admin/products" className="text-xs font-semibold text-[#b56576] hover:underline">Restock</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* recent orders */}
      <div className="anim-up overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.45s' }}>
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-display text-lg font-bold text-[#41323a]">Recent orders</h2>
          <Link to="/admin/orders" className="text-xs font-semibold text-[#b56576] hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
              <tr>
                <th className="px-6 py-3">ID</th><th className="px-6 py-3">Customer</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Total</th><th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                  <td className="px-6 py-3.5 font-semibold text-[#7f4c5a]">#{o.id}</td>
                  <td className="px-6 py-3.5">{o.customer_name}</td>
                  <td className="px-6 py-3.5 text-[#a98993]">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3.5 font-semibold">{money(o.total)}</td>
                  <td className="px-6 py-3.5"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
