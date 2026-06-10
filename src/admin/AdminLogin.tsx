/** Admin login — dark elegant design. Default: admin / admin123 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Spinner } from '../components/ui';

export default function AdminLogin() {
  const { login, toast } = useStore();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    await new Promise((r) => setTimeout(r, 700));
    const res = login(username, password);
    setBusy(false);
    if (!res.ok || res.role !== 'admin') {
      setError('Invalid admin credentials.');
      return;
    }
    toast('Welcome back, admin ✨');
    nav('/admin');
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#241b20] px-4">
      {/* ambient glow */}
      <div className="blob absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#b56576]/25" />
      <div className="blob absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[#d291bc]/15" style={{ animationDelay: '-5s' }} />

      <div className="anim-pop relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-3xl text-white shadow-xl shadow-rose-900/40">✿</span>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-[0.2em] text-white">AVYUKTA</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-rose-200/60">Admin Panel</p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-rose-200/70">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-[#d291bc] focus:shadow-[0_0_0_4px_rgba(210,145,188,.18)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-rose-200/70">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-[#d291bc] focus:shadow-[0_0_0_4px_rgba(210,145,188,.18)]"
            />
          </div>
          {error && <p className="anim-fade rounded-xl bg-red-500/15 px-4 py-2.5 text-xs font-medium text-red-300 ring-1 ring-red-400/30">{error}</p>}
          <button type="submit" disabled={busy} className="btn-grad w-full rounded-xl py-3.5 text-sm font-semibold tracking-wide disabled:opacity-70">
            {busy ? <span className="inline-flex items-center gap-2"><Spinner /> Signing in…</span> : 'Sign in to Dashboard'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/30">Default: admin / admin123</p>
        <p className="mt-2 text-center text-xs">
          <Link to="/" className="text-rose-200/60 underline-offset-2 transition hover:text-rose-200 hover:underline">← Back to store</Link>
        </p>
      </div>
    </div>
  );
}
