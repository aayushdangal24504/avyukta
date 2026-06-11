/** ☁️ Cloud Sync card (Admin → Settings): connect AVYUKTA to Supabase.
 *  Paste the anon public key → test → all data syncs automatically. */
import { useState } from 'react';
import { getDB, replaceCache } from '../lib/db';
import { SUPABASE_URL, getAnonKey, setAnonKey, isCloudConfigured, testConnection, pullFromCloud, pushToCloud, setSnapshot, getLastPushError } from '../lib/supabase';
import { useStore } from '../lib/store';
import { Spinner } from '../components/ui';

export default function CloudSync() {
  const { toast } = useStore();
  const [key, setKey] = useState(getAnonKey());
  const [busy, setBusy] = useState<'' | 'connect' | 'push' | 'pull'>('');
  const [connected, setConnected] = useState(isCloudConfigured());
  const [error, setError] = useState('');

  const connect = async () => {
    if (!key.trim()) return toast('Paste your Supabase anon public key first.', 'error');
    const prevKey = getAnonKey(); // restore on failure instead of disconnecting
    setBusy('connect');
    setError('');
    try {
      setAnonKey(key);
      await testConnection();
      // initial sync: pull if cloud has data, otherwise seed it with local data
      const cloud = await pullFromCloud();
      if (cloud) {
        replaceCache(cloud);
        setSnapshot(cloud);
        toast('Connected — loaded data from Supabase ☁️');
      } else {
        await pushToCloud(getDB()); // sets the sync snapshot itself
        toast('Connected — your local data was uploaded to Supabase ☁️');
      }
      setConnected(true);
    } catch (e) {
      setAnonKey(prevKey); // don't keep a broken key — revert to the previous one
      setConnected(isCloudConfigured());
      setError((e as Error).message);
    }
    setBusy('');
  };

  const syncNow = async (direction: 'push' | 'pull') => {
    setBusy(direction);
    setError('');
    try {
      if (direction === 'push') {
        await pushToCloud(getDB()); // upsert-only: never deletes cloud rows
        toast('Local data pushed to Supabase ✓');
      } else {
        const cloud = await pullFromCloud();
        if (cloud) { replaceCache(cloud); setSnapshot(cloud); toast('Latest cloud data loaded ✓'); }
        else toast('Cloud database is empty — push your local data first.', 'error');
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };

  const disconnect = () => {
    setAnonKey('');
    setKey('');
    setConnected(false);
    toast('Disconnected from Supabase — the app keeps working locally.');
  };

  const pushErr = getLastPushError();

  return (
    <div className="anim-up rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.45s' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-50 pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#7f4c5a]">☁️ Cloud Sync (Supabase)</h2>
          <p className="mt-0.5 text-xs text-[#a98993]">Project: <code className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px]">{SUPABASE_URL}</code></p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${connected ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-[#a98993] ring-rose-200'}`}>
          {connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>

      {!connected ? (
        <div className="mt-4 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[#8c737e]">
            <li>In your Supabase dashboard, open <b>SQL Editor</b> and run the included <code className="rounded bg-rose-50 px-1 py-0.5">supabase/schema.sql</code> once (creates the tables).</li>
            <li>Your publishable key ships pre-configured — just press <b>Connect & Sync</b> (or paste a different key to override).</li>
          </ol>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…  (anon public key)"
              className="input-soft flex-1 font-mono text-xs"
            />
            <button onClick={connect} disabled={busy !== ''} className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold disabled:opacity-70">
              {busy === 'connect' ? <span className="inline-flex items-center gap-2"><Spinner /> Connecting…</span> : 'Connect & Sync'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-[#8c737e]">
            All changes (products, orders, settings…) are mirrored to Supabase automatically a moment after you save.
            Data is also pulled from the cloud every time the app loads — so it stays in sync across devices.
          </p>
          {pushErr && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">Last auto-sync issue: {pushErr}</p>}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => syncNow('push')} disabled={busy !== ''} className="btn-grad rounded-full px-6 py-2.5 text-xs font-semibold disabled:opacity-70">
              {busy === 'push' ? <Spinner /> : '⬆ Push local → cloud'}
            </button>
            <button onClick={() => syncNow('pull')} disabled={busy !== ''} className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold disabled:opacity-70">
              {busy === 'pull' ? '…' : '⬇ Pull cloud → local'}
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
