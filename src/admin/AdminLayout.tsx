/** Protected admin shell with sidebar navigation. Redirects to /admin/login when unauthenticated. */
import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getDB } from '../lib/db';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/products', label: 'Products', icon: '🎁' },
  { to: '/admin/categories', label: 'Categories', icon: '🗂️' },
  { to: '/admin/orders', label: 'Orders', icon: '📦' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout() {
  const { session, logout } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // route protection — equivalent of @admin_required
  if (!session || session.role !== 'admin') return <Navigate to="/admin/login" replace />;

  const pending = getDB().orders.filter((o) => o.status === 'Pending').length;

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/admin" className="flex items-center gap-3 px-6 py-6">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#b56576] to-[#d291bc] text-xl text-white shadow-lg">✿</span>
        <div>
          <p className="font-display text-base font-bold tracking-[0.15em] text-white">AVYUKTA</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-rose-200/50">Admin Panel</p>
        </div>
      </Link>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                isActive ? 'bg-gradient-to-r from-[#b56576] to-[#d291bc] text-white shadow-lg shadow-rose-900/30' : 'text-rose-100/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <span>{n.icon}</span> {n.label}
            {n.label === 'Orders' && pending > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-900">{pending}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 p-4">
        <Link to="/" className="block rounded-xl bg-white/5 px-4 py-2.5 text-center text-xs font-medium text-rose-100/70 transition hover:bg-white/10">🛍️ View Store</Link>
        <button
          onClick={() => { logout(); nav('/admin/login'); }}
          className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-xs font-medium text-rose-100/70 transition hover:bg-red-500/20 hover:text-red-300"
        >
          ⏻ Logout ({session.username})
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-dark flex min-h-screen bg-[#f7eee8]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-gradient-to-b from-[#2c2127] to-[#241b20] lg:block">{sidebar}</aside>

      {/* mobile sidebar */}
      <div className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setOpen(false)} />
      <aside className={`fixed z-50 h-full w-64 bg-gradient-to-b from-[#2c2127] to-[#241b20] transition-transform duration-300 lg:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>{sidebar}</aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-rose-100 bg-white/80 px-6 py-3.5 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-[#7f4c5a]">☰</button>
          <span className="font-display font-bold tracking-widest text-[#7f4c5a]">AVYUKTA Admin</span>
        </header>
        <main className="p-5 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
