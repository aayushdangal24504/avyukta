/** Admin orders: search, status dropdown w/ color badges, details modal, export, delete. */
import { useState } from 'react';
import { getDB, saveDB, getOrderItems, money, Order, OrderStatus } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, StatusBadge } from '../components/ui';

const STATUSES: OrderStatus[] = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

export default function AdminOrders() {
  const { toast } = useStore();
  const db = getDB();
  const [q, setQ] = useState('');
  const [view, setView] = useState<Order | null>(null);
  const [confirmDel, setConfirmDel] = useState<Order | null>(null);

  const orders = [...db.orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((o) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        o.customer_name.toLowerCase().includes(needle) ||
        (o.phone || '').includes(needle) ||
        (o.email || '').toLowerCase().includes(needle) ||
        (o.tracking_code || '').toLowerCase().includes(needle)
      );
    });

  const setStatus = (o: Order, status: OrderStatus) => {
    o.status = status;
    saveDB();
    toast(`Order #${o.id} → ${status}`);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    db.orders = db.orders.filter((o) => o.id !== confirmDel.id);
    db.order_items = db.order_items.filter((i) => i.order_id !== confirmDel.id);
    saveDB();
    toast('Order deleted.');
    setConfirmDel(null);
  };

  /** Export all orders to an Excel-compatible file. */
  const exportExcel = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ['Order ID', 'Tracking Code', 'Date', 'Customer', 'Phone', 'Email', 'Location', 'Notes', 'Items', 'Total', 'Status'],
      ...db.orders.map((o) => [
        o.id,
        o.tracking_code || '',
        new Date(o.created_at).toLocaleString(),
        o.customer_name,
        o.phone,
        o.email || '',
        o.location,
        o.notes,
        getOrderItems(o.id).map((i) => `${i.product_name} x${i.quantity}`).join('; '),
        o.total.toFixed(2),
        o.status,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `avyukta-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Orders exported — opens in Excel ✓');
  };

  return (
    <div className="page-enter">
      <div className="anim-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Orders</h1>
          <p className="mt-1 text-sm text-[#a98993]">{db.orders.length} total · {db.orders.filter((o) => o.status === 'Pending').length} pending</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, tracking…" className="input-soft w-64!" />
          <button onClick={exportExcel} className="btn-grad rounded-full px-5 py-2.5 text-sm font-semibold">⬇ Export to Excel</button>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon="📦" title={q ? 'No matching orders' : 'No orders yet'} sub={q ? 'Try a different name or phone number.' : 'New orders from your store will appear here.'} />
      ) : (
        <div className="anim-up mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.1s' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
                <tr>
                  <th className="px-5 py-3">ID</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const items = getOrderItems(o.id);
                  return (
                    <tr key={o.id} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                      <td className="px-5 py-3.5 font-bold text-[#7f4c5a]">#{o.id}</td>
                      <td className="px-5 py-3.5 text-[#a98993]">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5 font-medium">{o.customer_name}</td>
                      <td className="px-5 py-3.5 text-[#a98993]">{o.phone}</td>
                      <td className="px-5 py-3.5 text-[#a98993]">{items.reduce((s, i) => s + i.quantity, 0)} item(s)</td>
                      <td className="px-5 py-3.5 font-semibold">{money(o.total)}</td>
                      <td className="px-5 py-3.5">
                        <select
                          value={o.status}
                          onChange={(e) => setStatus(o, e.target.value as OrderStatus)}
                          className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-xs font-bold outline-none ring-1 ${
                            { Pending: 'bg-amber-100 text-amber-700 ring-amber-300', Confirmed: 'bg-blue-100 text-blue-700 ring-blue-300', Shipped: 'bg-purple-100 text-purple-700 ring-purple-300', Delivered: 'bg-emerald-100 text-emerald-700 ring-emerald-300', Cancelled: 'bg-red-100 text-red-700 ring-red-300' }[o.status]
                          }`}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setView(o)} className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-semibold text-[#7f4c5a] transition hover:bg-rose-100">View</button>
                        <button onClick={() => setConfirmDel(o)} className="ml-2 rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-100">Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* order details modal */}
      {view && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setView(null)}>
          <div className="anim-pop w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-[#41323a]">Order #{view.id}</h2>
                <p className="text-xs text-[#a98993]">{new Date(view.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge status={view.status} />
            </div>
            <div className="mt-5 grid gap-3 rounded-2xl bg-rose-50/50 p-4 text-sm">
              <p><span className="font-semibold text-[#7f4c5a]">Customer:</span> {view.customer_name}</p>
              <p><span className="font-semibold text-[#7f4c5a]">Phone:</span> {view.phone}</p>
              {view.email && <p><span className="font-semibold text-[#7f4c5a]">Email:</span> {view.email}</p>}
              <p><span className="font-semibold text-[#7f4c5a]">Address:</span> {view.location}</p>
              {view.notes && <p><span className="font-semibold text-[#7f4c5a]">Notes:</span> {view.notes}</p>}
              {view.tracking_code && (
                <p className="break-all"><span className="font-semibold text-[#7f4c5a]">Tracking:</span> <code className="font-mono text-xs">{view.tracking_code}</code></p>
              )}
            </div>
            <ul className="mt-4 divide-y divide-rose-50">
              {getOrderItems(view.id).map((i) => (
                <li key={i.id} className="flex justify-between py-2.5 text-sm">
                  <span className="text-[#5d4954]">{i.product_name} <span className="text-[#a98993]">× {i.quantity}</span></span>
                  <span className="font-semibold">{money(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-rose-100 pt-3">
              <span className="font-semibold text-[#7f4c5a]">Total</span>
              <span className="font-display text-lg font-bold text-[#b56576]">{money(view.total)}</span>
            </div>
            <button onClick={() => setView(null)} className="btn-grad mt-5 w-full rounded-full py-2.5 text-sm font-semibold">Close</button>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="anim-pop w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-2xl">🗑️</span>
            <h3 className="mt-4 font-display text-lg font-bold text-[#41323a]">Delete order #{confirmDel.id}?</h3>
            <p className="mt-2 text-sm text-[#a98993]">This permanently removes the order and its items.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setConfirmDel(null)} className="rounded-full bg-rose-50 px-6 py-2.5 text-sm font-semibold text-[#7f4c5a]">Cancel</button>
              <button onClick={doDelete} className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-600 active:scale-95">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
