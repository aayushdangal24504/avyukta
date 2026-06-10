/** Customer account: register / login + "My Orders" history with statuses. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDB, getOrderItems, money } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';

export default function Account() {
  const { session, login, register, logout, toast } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  /* ------------------------------ logged in ------------------------------ */
  if (session && session.role === 'customer') {
    const orders = getDB().orders.filter((o) => o.user_id === session.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return (
      <div className="page-enter mx-auto max-w-4xl px-6 py-10">
        <div className="anim-up flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d291bc]">Welcome back</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-[#41323a]">Hi, {session.username} 🌸</h1>
          </div>
          <button onClick={() => { logout(); toast('Logged out. See you soon!'); }} className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold">Logout</button>
        </div>

        <h2 className="anim-up mt-10 font-display text-xl font-bold text-[#7f4c5a]" style={{ animationDelay: '.1s' }}>My Orders</h2>
        {orders.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No orders yet"
            sub="Your handmade treasures will appear here once you place an order."
            action={<Link to="/shop" className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Start shopping</Link>}
          />
        ) : (
          <ul className="mt-5 space-y-4">
            {orders.map((o, i) => (
              <li key={o.id} className="anim-up overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50" style={{ animationDelay: `${0.1 + i * 0.07}s` }}>
                <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="flex w-full flex-wrap items-center gap-4 px-6 py-4 text-left">
                  <span className="font-display font-bold text-[#7f4c5a]">#{o.id}</span>
                  <span className="text-xs text-[#a98993]">{new Date(o.created_at).toLocaleDateString()}</span>
                  <StatusBadge status={o.status} />
                  <span className="ml-auto font-semibold text-[#b56576]">{money(o.total)}</span>
                  <span className={`text-xs transition-transform ${expanded === o.id ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {expanded === o.id && (
                  <div className="anim-fade border-t border-rose-50 bg-[#fffaf5] px-6 py-4">
                    {getOrderItems(o.id).map((it) => (
                      <div key={it.id} className="flex justify-between py-1 text-sm text-[#6b5560]">
                        <span>{it.product_name} × {it.quantity}</span>
                        <span>{money(it.price * it.quantity)}</span>
                      </div>
                    ))}
                    <p className="mt-2 text-xs text-[#a98993]">📍 {o.location}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ---------------------------- login/register ---------------------------- */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    const res = mode === 'login' ? login(username, password) : register(username, password);
    setBusy(false);
    if (!res.ok) return toast(res.error || 'Something went wrong', 'error');
    toast(mode === 'login' ? 'Welcome back! 🌸' : 'Account created — welcome to AVYUKTA! 🌸');
  };

  return (
    <div className="page-enter mx-auto max-w-md px-6 py-14">
      <div className="anim-pop rounded-[2rem] bg-white p-8 shadow-xl shadow-rose-100/70 ring-1 ring-rose-50">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-2xl text-white shadow-lg">✿</span>
          <h1 className="mt-4 font-display text-2xl font-bold text-[#41323a]">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-[#a98993]">{mode === 'login' ? 'Log in to track your orders' : 'Join us to save your order history'}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-full bg-rose-50 p-1 text-sm font-semibold">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full py-2 capitalize transition-all ${mode === m ? 'btn-grad' : 'text-[#a98993]'}`}>
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="input-soft" required minLength={3} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" className="input-soft" required minLength={mode === 'register' ? 6 : 1} />
          <button type="submit" disabled={busy} className="btn-grad w-full rounded-full py-3 text-sm font-semibold disabled:opacity-70">
            {busy ? <Spinner /> : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-[#a98993]">
          Store owner? <Link to="/admin/login" className="font-semibold text-[#b56576] underline-offset-2 hover:underline">Admin login →</Link>
        </p>
      </div>
    </div>
  );
}
