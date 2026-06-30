/** ☁️ Cloud Sync card (Admin → Settings): connect to YOUR Supabase project.
 *
 *  Production-clean: no hard-coded URL or anon key. You paste both, we test,
 *  then we pull data. We NEVER auto-seed an empty cloud project. */
import { useState } from 'react';
import { replaceCache } from '../lib/db';
import {
  getSupabaseUrl,
  setSupabaseUrl,
  getAnonKey,
  setAnonKey,
  isCloudConfigured,
  testConnection,
  pullFromCloud,
  setSnapshot,
  getLastPushError,
} from '../lib/supabase';
import { useStore } from '../lib/store';
import { Spinner } from '../components/ui';

export default function CloudSync() {
  const { toast } = useStore();
  const [url, setUrl] = useState(getSupabaseUrl());
  const [key, setKey] = useState(getAnonKey());
  const [busy, setBusy] = useState<'' | 'connect' | 'pull'>('');
  const [connected, setConnected] = useState(isCloudConfigured());
  const [error, setError] = useState('');

  const connect = async () => {
    if (!url.trim()) return toast('Paste your Supabase project URL first.', 'error');
    if (!key.trim()) return toast('Paste your Supabase anon public key first.', 'error');
    const prevUrl = getSupabaseUrl();
    const prevKey = getAnonKey();
    setBusy('connect');
    setError('');
    try {
      setSupabaseUrl(url);
      setAnonKey(key);
      await testConnection();
      const cloud = await pullFromCloud();
      if (cloud) {
        replaceCache(cloud);
        setSnapshot(cloud);
        toast('Connected to Supabase ☁️');
      } else {
        toast('Connected — cloud project is empty. Add content from the admin panel.', 'success');
      }
      setConnected(true);
    } catch (e) {
      setSupabaseUrl(prevUrl);
      setAnonKey(prevKey);
      setConnected(isCloudConfigured());
      setError((e as Error).message);
    }
    setBusy('');
  };

  const pullNow = async () => {
    setBusy('pull');
    setError('');
    try {
      const cloud = await pullFromCloud();
      if (cloud) {
        replaceCache(cloud);
        setSnapshot(cloud);
        toast('Pulled the latest data from Supabase ✓');
      } else {
        toast('Cloud project is empty.', 'error');
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };

  const disconnect = () => {
    if (!confirm('Disconnect from Supabase? Your local cache stays as-is until you reconnect.')) return;
    setSupabaseUrl('');
    setAnonKey('');
    setUrl('');
    setKey('');
    setConnected(false);
    toast('Disconnected.');
  };

  const pushErr = getLastPushError();

  return (
    <div className="anim-up rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.45s' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-50 pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#7f4c5a]">☁️ Cloud Sync (Supabase)</h2>
          <p className="mt-0.5 text-xs text-[#a98993]">
            {connected ? <>Project: <code className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px]">{getSupabaseUrl()}</code></> : 'Not configured'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${connected ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-[#a98993] ring-rose-200'}`}>
          {connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>

      {!connected ? (
        <div className="mt-4 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[#8c737e]">
            <li>In your Supabase dashboard, open <b>SQL Editor</b> and run <code className="rounded bg-rose-50 px-1 py-0.5">supabase/schema.sql</code> once to create the tables.</li>
            <li>Copy your project URL and the <b>anon public</b> key from <b>Settings → API</b>.</li>
            <li>Paste both below and press <b>Connect</b>.</li>
          </ol>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://YOUR-PROJECT.supabase.co"
            className="input-soft font-mono text-xs"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="anon public key"
              className="input-soft flex-1 font-mono text-xs"
            />
            <button onClick={connect} disabled={busy !== ''} className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold disabled:opacity-70">
              {busy === 'connect' ? <span className="inline-flex items-center gap-2"><Spinner /> Connecting…</span> : 'Connect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-[#8c737e]">
            All changes you make in the admin (products, categories, orders, settings) are auto-synced to Supabase
            as a row-level diff. Existing cloud data is never reset, replaced or overwritten by stale local state.
          </p>
          {pushErr && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">Last auto-sync issue: {pushErr}</p>}
          <div className="flex flex-wrap gap-3">
            <button onClick={pullNow} disabled={busy !== ''} className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold disabled:opacity-70">
              {busy === 'pull' ? '…' : '⬇ Pull latest from cloud'}
            </button>
            <button onClick={disconnect} className="ml-auto rounded-full bg-red-50 px-6 py-2.5 text-xs font-semibold text-red-500 transition hover:bg-red-100">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {error && <p className="anim-fade mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600 ring-1 ring-red-200">{error}</p>}
    </div>
  );
}
