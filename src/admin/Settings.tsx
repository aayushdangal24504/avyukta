/** Admin settings: password, store info, and FULL homepage content editing —
 *  hero, stats, section titles (Featured Treasures / New Arrivals / Categories),
 *  Our Story, testimonials, footer payment box, logo, demo reset. */
import { useRef, useState } from 'react';
import { getDB, saveDB, getSetting, hashPassword, checkPassword, sanitize, resetDB, SETTING_DEFAULTS } from '../lib/db';
import { useStore } from '../lib/store';
import { Spinner } from '../components/ui';
import CloudSync from './CloudSync';
import { fileToCompressedDataURL } from '../lib/storage';

/** All editable text keys, grouped for the form. */
const CONTENT_KEYS = [
  'store_name', 'tagline', 'phone', 'address', 'instagram', 'facebook', 'whatsapp',
  'hero_title', 'hero_subtitle', 'hero_cta', 'hero_cta2', 'hero_stats',
  'categories_kicker', 'categories_title',
  'featured_kicker', 'featured_title', 'new_title', 'best_title',
  'about_kicker', 'about_title', 'about_text', 'about_points',
  'testimonials_kicker', 'testimonials_title', 'testimonials',
  'payment_text',
] as const;
type Key = (typeof CONTENT_KEYS)[number];

export default function AdminSettings() {
  const { toast, session } = useStore();
  const db = getDB();
  const [info, setInfo] = useState<Record<Key, string>>(
    () => Object.fromEntries(CONTENT_KEYS.map((k) => [k, getSetting(k)])) as Record<Key, string>
  );
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busyInfo, setBusyInfo] = useState(false);
  const [busyPw, setBusyPw] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyInfo(true);
    await new Promise((r) => setTimeout(r, 400));
    CONTENT_KEYS.forEach((k) => { db.settings[k] = sanitize(info[k]); });
    saveDB();
    setBusyInfo(false);
    toast('All content saved — the storefront is updated ✓');
  };

  const restoreDefaults = () => {
    if (!confirm('Restore ALL storefront texts to the original defaults?')) return;
    const next = Object.fromEntries(CONTENT_KEYS.map((k) => [k, SETTING_DEFAULTS[k] ?? ''])) as Record<Key, string>;
    setInfo(next);
    CONTENT_KEYS.forEach((k) => { db.settings[k] = SETTING_DEFAULTS[k] ?? ''; });
    saveDB();
    toast('Storefront texts restored to defaults.');
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    const admin = db.users.find((u) => u.id === session?.user_id);
    if (!admin) return;
    if (!checkPassword(pw.current, admin.password_hash)) return toast('Current password is incorrect.', 'error');
    if (pw.next.length < 6) return toast('New password must be at least 6 characters.', 'error');
    if (pw.next !== pw.confirm) return toast('Passwords do not match.', 'error');
    setBusyPw(true);
    await new Promise((r) => setTimeout(r, 500));
    admin.password_hash = hashPassword(pw.next);
    saveDB();
    setBusyPw(false);
    setPw({ current: '', next: '', confirm: '' });
    toast('Admin password updated 🔒');
  };

  const onLogo = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Only image files are allowed.', 'error');
    // any size accepted — automatically downscaled to logo dimensions
    fileToCompressedDataURL(f, 512)
      .then((url) => {
        db.settings.logo = url;
        saveDB();
        toast('Logo updated ✓');
      })
      .catch(() => toast('Could not read this image file.', 'error'));
  };

  /* ------------------------------ form helpers ------------------------------ */
  const field = (k: Key, label: string, hint?: string) => (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">{label}</label>
      <input value={info[k]} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} className="input-soft" />
      {hint && <p className="mt-1 text-[11px] text-[#bba3ab]">{hint}</p>}
    </div>
  );
  const area = (k: Key, label: string, rows = 2, hint?: string) => (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">{label}</label>
      <textarea value={info[k]} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} rows={rows} className="input-soft resize-y" />
      {hint && <p className="mt-1 text-[11px] text-[#bba3ab]">{hint}</p>}
    </div>
  );
  const sectionTitle = (emoji: string, title: string, sub?: string) => (
    <div className="border-b border-rose-50 pb-3">
      <h2 className="font-display text-lg font-bold text-[#7f4c5a]">{emoji} {title}</h2>
      {sub && <p className="mt-0.5 text-xs text-[#a98993]">{sub}</p>}
    </div>
  );

  return (
    <div className="page-enter max-w-5xl">
      <div className="anim-up flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Settings</h1>
          <p className="mt-1 text-sm text-[#a98993]">Edit everything your customers see — saved instantly to the storefront.</p>
        </div>
        <button onClick={restoreDefaults} className="btn-ghost rounded-full px-5 py-2 text-xs font-semibold">↺ Restore default texts</button>
      </div>

      <form onSubmit={saveInfo} className="mt-6 space-y-6">
        {/* ----------------------------- store info ----------------------------- */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.05s' }}>
          {sectionTitle('🏪', 'Store Information', 'Brand name, contact details and social links (used in header & footer)')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('store_name', 'Store name')}
            {field('tagline', 'Tagline')}
            {field('phone', 'Phone')}
            {field('address', 'Address')}
            {field('instagram', 'Instagram URL')}
            {field('facebook', 'Facebook URL')}
            {field('whatsapp', 'WhatsApp URL')}
          </div>
        </div>

        {/* ------------------------------- hero -------------------------------- */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.1s' }}>
          {sectionTitle('🌸', 'Homepage Hero', 'The big opening section of the home page')}
          <div className="grid gap-4">
            {area('hero_title', 'Hero title', 2, 'Two lines — the second line gets the rose gradient.')}
            {area('hero_subtitle', 'Hero subtitle', 2)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('hero_cta', 'Main button text', 'Goes to the Shop page.')}
              {field('hero_cta2', 'Second button text', 'Scrolls smoothly to the categories section.')}
            </div>
            {area('hero_stats', 'Hero stats', 3, 'One per line, format: value | label  (e.g. "100% | Handmade")')}
          </div>
        </div>

        {/* --------------------------- section titles --------------------------- */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.15s' }}>
          {sectionTitle('🗂️', 'Homepage Sections', 'Titles for the Categories, Featured Treasures and New Arrivals sections')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('categories_kicker', 'Categories — small label')}
            {field('categories_title', 'Categories — title')}
            {field('featured_kicker', 'Featured — small label')}
            {field('featured_title', 'Featured — title')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('new_title', 'New arrivals — title')}
            {field('best_title', 'Best sellers — title', 'Section appears only when products are flagged 💖')}
          </div>
        </div>

        {/* ------------------------------ our story ------------------------------ */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.2s' }}>
          {sectionTitle('🤍', 'Our Story (About section)', 'The story block with the checklist on the home page')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('about_kicker', 'Small label')}
            <div className="sm:col-span-1">{area('about_title', 'Title', 2, 'Line breaks are kept.')}</div>
          </div>
          {area('about_text', 'Story text', 4)}
          {area('about_points', 'Checklist points', 4, 'One point per line — each gets a ✓ bullet.')}
        </div>

        {/* ----------------------------- testimonials ---------------------------- */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.25s' }}>
          {sectionTitle('💬', 'Testimonials', 'The auto-sliding customer reviews carousel')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('testimonials_kicker', 'Small label')}
            {field('testimonials_title', 'Title')}
          </div>
          {area('testimonials', 'Reviews', 5, 'One per line, format: Name | review text. Delete all lines to hide the section.')}
        </div>

        {/* ------------------------------- footer -------------------------------- */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.3s' }}>
          {sectionTitle('💝', 'Footer — Payment box', 'The payment info text shown in the footer')}
          {area('payment_text', 'Payment text', 2)}
        </div>

        {/* sticky save bar */}
        <div className="anim-up sticky bottom-4 z-20 flex items-center justify-end gap-3 rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-rose-100 backdrop-blur" style={{ animationDelay: '.32s' }}>
          <p className="mr-auto hidden text-xs text-[#a98993] sm:block">Changes apply to the storefront the moment you save.</p>
          <button type="submit" disabled={busyInfo} className="btn-grad rounded-full px-10 py-3 text-sm font-semibold disabled:opacity-70">
            {busyInfo ? <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span> : '💾 Save All Content'}
          </button>
        </div>
      </form>

      {/* cloud sync */}
      <div className="mt-8">
        <CloudSync />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* password */}
        <form onSubmit={savePw} className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.35s' }}>
          <h2 className="font-display text-lg font-bold text-[#7f4c5a]">🔒 Change Password</h2>
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" className="input-soft" required />
          <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (min 6 chars)" className="input-soft" required />
          <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Confirm new password" className="input-soft" required />
          <button type="submit" disabled={busyPw} className="btn-grad w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-70">
            {busyPw ? <Spinner /> : 'Update Password'}
          </button>
        </form>

        {/* logo + danger zone */}
        <div className="anim-up space-y-6" style={{ animationDelay: '.4s' }}>
          <div className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50">
            <h2 className="font-display text-lg font-bold text-[#7f4c5a]">🖼️ Store Logo</h2>
            <div className="mt-4 flex items-center gap-4">
              {db.settings.logo ? (
                <img src={db.settings.logo} alt="logo" className="h-16 w-16 rounded-full object-cover ring-2 ring-rose-200" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-2xl text-white">✿</span>
              )}
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold">Upload new logo</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files)} />
            </div>
          </div>
          <div className="rounded-3xl bg-red-50/60 p-7 ring-1 ring-red-100">
            <h2 className="font-display text-lg font-bold text-red-600">⚠️ Danger Zone</h2>
            <p className="mt-1 text-xs text-red-400">Reset the entire database (products, orders, settings) back to the original demo data.</p>
            <button
              type="button"
              onClick={() => { if (confirm('Reset ALL data to demo defaults? This cannot be undone.')) { resetDB(); toast('Database reset to demo data.'); } }}
              className="mt-4 rounded-full bg-red-500 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-600 active:scale-95"
            >
              Reset demo data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
