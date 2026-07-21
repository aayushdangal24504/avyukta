/** Admin settings: password, store info, and FULL homepage content editing.
 *  PRODUCTION-CLEAN: empty inputs by default, no demo defaults, no demo reset. */
import { useRef, useState } from 'react';
import { getDB, saveDB, getSetting, hashPassword, checkPassword, sanitize, type Product } from '../lib/db';
import { useStore } from '../lib/store';
import { Spinner, SafeImage } from '../components/ui';
import CloudSync from './CloudSync';
import { fileToCompressedDataURL, uploadProductImage } from '../lib/storage';

/** All editable TEXT keys, grouped for the form. */
const CONTENT_KEYS = [
  'store_name', 'tagline',
  'phone', 'email', 'address', 'website', 'business_hours',
  'instagram', 'tiktok', 'whatsapp',
  'hero_title', 'hero_subtitle', 'hero_cta', 'hero_cta2', 'hero_stats',
  'categories_kicker', 'categories_title',
  'featured_kicker', 'featured_title', 'new_title', 'best_title',
  'about_kicker', 'about_title', 'about_text', 'about_points',
  'testimonials_kicker', 'testimonials_title', 'testimonials',
  'payment_text',
  // Checkout & order messaging
  'admin_email',
  'checkout_payment_message',
  'checkout_email_helper',
  'checkout_footer_note',
  'success_title',
  'success_message',
  'tracking_note',
  'customer_email_template',
  'admin_email_template',
  // Featured 3D-style scroll showcase on the homepage
  'showcase_product_id',
  'showcase_variant_id',
  'showcase_subtitle',
  'showcase_cta_label',
] as const;
type Key = (typeof CONTENT_KEYS)[number];

/** Image keys — uploaded to Supabase Storage, only the URL stored in settings. */
type ImageKey = 'logo' | 'hero_image' | 'about_image';

export default function AdminSettings() {
  const { toast, session } = useStore();
  const db = getDB();
  const [info, setInfo] = useState<Record<Key, string>>(
    () => Object.fromEntries(CONTENT_KEYS.map((k) => [k, getSetting(k)])) as Record<Key, string>
  );
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busyInfo, setBusyInfo] = useState(false);
  const [busyPw, setBusyPw] = useState(false);
  const [uploading, setUploading] = useState<ImageKey | ''>('');

  /* ---- 3D ring photo picker (top-of-homepage rotating ring) ---- */
  const [ringIds, setRingIds] = useState<number[]>(() =>
    getSetting('ring_product_ids').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0)
  );
  const [ringBusy, setRingBusy] = useState(false);

  // separate refs per image input
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLInputElement>(null);

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyInfo(true);
    await new Promise((r) => setTimeout(r, 300));
    CONTENT_KEYS.forEach((k) => { db.settings[k] = sanitize(info[k]); });
    saveDB();
    setBusyInfo(false);
    toast('Saved ✓');
  };

  /* ---- ring picker helpers ---- */
  const ringProducts = ringIds
    .map((id) => db.products.find((p) => p.id === id))
    .filter(Boolean) as Product[];
  const available = [...db.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((p) => !ringIds.includes(p.id));
  const moveRing = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= ringIds.length) return;
    const a = [...ringIds];
    [a[i], a[j]] = [a[j], a[i]];
    setRingIds(a);
  };
  const saveRing = async () => {
    setRingBusy(true);
    await new Promise((r) => setTimeout(r, 200));
    db.settings.ring_product_ids = ringIds.join(',');
    saveDB();
    setRingBusy(false);
    toast('3D ring saved ✓');
  };
  const clearRing = () => {
    setRingIds([]);
    db.settings.ring_product_ids = '';
    saveDB();
    toast('Ring set to automatic.');
  };

  /** Clear ALL text content fields (does NOT touch images, products, orders, etc). */
  const clearAll = () => {
    if (!confirm('Clear all storefront TEXT fields? Products, categories, orders and images are NOT affected.')) return;
    const next = Object.fromEntries(CONTENT_KEYS.map((k) => [k, ''])) as Record<Key, string>;
    setInfo(next);
    CONTENT_KEYS.forEach((k) => { db.settings[k] = ''; });
    saveDB();
    toast('Text fields cleared.');
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    const admin = db.users.find((u) => u.id === session?.user_id);
    if (!admin) return;
    if (!checkPassword(pw.current, admin.password_hash)) return toast('Current password is incorrect.', 'error');
    if (pw.next.length < 6) return toast('New password must be at least 6 characters.', 'error');
    if (pw.next !== pw.confirm) return toast('Passwords do not match.', 'error');
    setBusyPw(true);
    await new Promise((r) => setTimeout(r, 400));
    admin.password_hash = hashPassword(pw.next);
    saveDB();
    setBusyPw(false);
    setPw({ current: '', next: '', confirm: '' });
    toast('Password updated 🔒');
  };

  /* ------------------------- LOGO (small — inline) ------------------------- */
  const onLogo = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Only image files are allowed.', 'error');
    setUploading('logo');
    fileToCompressedDataURL(f, 512)
      .then((url) => {
        db.settings.logo = url;
        saveDB();
        toast('Logo updated ✓');
      })
      .catch(() => toast('Could not read this image file.', 'error'))
      .finally(() => setUploading(''));
  };

  /* ----- HERO / ABOUT (large — uploaded to Supabase Storage as URL) -------- */
  const uploadStorageImage = async (key: 'hero_image' | 'about_image', file: File) => {
    if (!file.type.startsWith('image/')) return toast('Only image files are allowed.', 'error');
    setUploading(key);
    try {
      // 1) Compress to a reasonable max dimension
      const dataUrl = await fileToCompressedDataURL(file, 1600, 0.85);
      // 2) Turn data-URL back into a Blob to upload
      const blob = await (await fetch(dataUrl)).blob();
      // 3) Upload to Supabase Storage (or fall back to inline data-URL if cloud is off)
      const res = await uploadProductImage(blob);
      db.settings[key] = res.url;
      saveDB();
      if (res.cloud) toast('Image uploaded ☁️✓');
      else toast('Image saved locally (cloud not connected).');
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`, 'error');
    }
    setUploading('');
  };

  const removeImage = (key: ImageKey, label: string) => {
    if (!db.settings[key]) return;
    if (!confirm(`Remove the ${label}?`)) return;
    db.settings[key] = '';
    saveDB();
    toast(`${label} removed.`);
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

  /** Reusable image picker (with preview + remove). */
  const ImagePicker = ({
    label,
    storageKey,
    inputRef,
    onPick,
    preview,
    hint,
    aspect = 'aspect-video',
  }: {
    label: string;
    storageKey: ImageKey;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onPick: (f: FileList | null) => void;
    preview: string;
    hint?: string;
    aspect?: string;
  }) => {
    const busy = uploading === storageKey;
    return (
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">{label}</label>
        <div className={`${aspect} relative w-full overflow-hidden rounded-2xl bg-rose-50/40 ring-1 ring-rose-100`}>
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-cover" />
          ) : (
            <SafeImage src={null} className="h-full w-full" label="No image" />
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm">
              <Spinner />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-ghost rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-50">
            {preview ? 'Replace image' : 'Upload image'}
          </button>
          {preview && (
            <button type="button" onClick={() => removeImage(storageKey, label.toLowerCase())} disabled={busy} className="rounded-full bg-red-50 px-5 py-2 text-xs font-semibold text-red-500 hover:bg-red-100 disabled:opacity-50">
              Remove
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files)} />
        </div>
        {hint && <p className="mt-2 text-[11px] text-[#bba3ab]">{hint}</p>}
      </div>
    );
  };

  return (
    <div className="page-enter max-w-5xl">
      <div className="anim-up flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Settings</h1>
          <p className="mt-1 text-sm text-[#a98993]">All content fields below are stored in Supabase. Empty fields are hidden on the storefront.</p>
        </div>
        <button onClick={clearAll} className="btn-ghost rounded-full px-5 py-2 text-xs font-semibold">Clear all text fields</button>
      </div>

      {/* formatting hint — applies to all text fields below */}
      <div className="anim-up mt-5 rounded-2xl bg-gradient-to-r from-[#fcd5ce]/60 to-[#fde2d4]/60 p-4 text-xs leading-relaxed text-[#7f4c5a] ring-1 ring-rose-200" style={{ animationDelay: '.04s' }}>
        <p className="font-semibold">✨ Text formatting</p>
        <p className="mt-1 text-[#8c737e]">
          You can highlight or style any part of your text using these markers:
        </p>
        <ul className="mt-2 space-y-1 text-[#6b5560]">
          <li>
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono">==text==</code>
            <span className="ml-2">→ </span>
            <mark className="rounded-md bg-gradient-to-r from-[#fcd5ce] to-[#f8b4c0] px-1.5 py-0.5 font-semibold text-[#7f4c5a] shadow-sm">text</mark>
            <span className="ml-1 text-[#a98993]">(soft highlight)</span>
          </li>
          <li>
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono">**text**</code>
            <span className="ml-2">→ </span>
            <strong className="font-semibold text-[#5d4954]">text</strong>
            <span className="ml-1 text-[#a98993]">(bold)</span>
          </li>
          <li>
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono">*text*</code>
            <span className="ml-2">→ </span>
            <em>text</em>
            <span className="ml-1 text-[#a98993]">(italic)</span>
          </li>
        </ul>
        <p className="mt-2 text-[#a98993]">Works in hero subtitle, about text, checkout messages, footer payment box, tracking note, and similar copy. Line breaks are always kept.</p>
      </div>

      <form onSubmit={saveInfo} className="mt-6 space-y-6">
        {/* store info */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.05s' }}>
          {sectionTitle('🏪', 'Store Information', 'Brand name and contact details — shown in header and footer')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('store_name', 'Store name')}
            {field('tagline', 'Tagline')}
            {field('phone', 'Phone')}
            {field('email', 'Email')}
            {field('website', 'Website URL')}
            {field('address', 'Address')}
          </div>
          {area('business_hours', 'Business hours', 3, 'One line per day, e.g. "Mon–Fri: 9am–6pm"')}
          <div className="grid gap-4 sm:grid-cols-3">
            {field('instagram', 'Instagram URL')}
            {field('tiktok', 'Tiktok URL')}
            {field('whatsapp', 'WhatsApp URL')}
          </div>
        </div>

        {/* hero (text + image) */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.1s' }}>
          {sectionTitle('🌸', 'Homepage Hero', 'Opening section of the home page. Hidden when all fields are empty.')}
          <div className="grid gap-4">
            {area('hero_title', 'Hero title', 2, 'Two lines — the second line gets the rose gradient.')}
            {area('hero_subtitle', 'Hero subtitle', 2)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('hero_cta', 'Main button text', 'Goes to the Shop page.')}
              {field('hero_cta2', 'Second button text', 'Scrolls to the categories section.')}
            </div>
            {area('hero_stats', 'Hero stats', 3, 'One per line, format: value | label  (e.g. "100% | Handmade")')}
          </div>

          <ImagePicker
            label="Hero image"
            storageKey="hero_image"
            inputRef={heroRef}
            preview={db.settings.hero_image || ''}
            onPick={(files) => files?.[0] && uploadStorageImage('hero_image', files[0])}
            hint="Big featured image on the right side of the hero. If empty, falls back to your top product image."
            aspect="aspect-square sm:aspect-[4/3]"
          />
        </div>

        {/* section titles */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.15s' }}>
          {sectionTitle('🗂️', 'Homepage Sections', 'Section titles — leave blank to hide a label')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('categories_kicker', 'Categories — small label')}
            {field('categories_title', 'Categories — title')}
            {field('featured_kicker', 'Featured — small label')}
            {field('featured_title', 'Featured — title')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('new_title', 'New arrivals — title')}
            {field('best_title', 'Best sellers — title')}
          </div>
        </div>

        {/* featured 3D-style scroll showcase */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.18s' }}>
          {sectionTitle('🌀', 'Featured Product Showcase', 'Apple-style scroll-locked product rotation, shown right below Categories on the homepage. Leave Product ID blank to hide the section entirely.')}

          <div className="grid gap-4 sm:grid-cols-2">
            {field('showcase_product_id', 'Featured product ID', 'Numeric ID of the product to feature. Open Admin → Products and look at the rows. Multi-frame rotation looks best when this product has 8–24 detail images uploaded.')}
            {field('showcase_variant_id', 'Variant product ID (optional)', 'Numeric ID of a second product to cross-fade to at the end of the animation (e.g. same item in a different colour).')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('showcase_subtitle', 'Kicker text', 'Small label above the product name. e.g. "Best Seller" or "Limited Edition"')}
            {field('showcase_cta_label', 'Button label', 'Defaults to "Shop now" if empty.')}
          </div>

          <div className="rounded-2xl bg-rose-50/60 p-4 text-xs text-[#7f4c5a]">
            <p className="font-semibold">💡 How to make this look amazing</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#6b5560]">
              <li>Open <b>Admin → Products</b> → edit your featured product.</li>
              <li>Upload <b>8–24 photos of it from different angles</b> (rotating around it like a turntable). These go in the <b>image gallery</b> (they're stored as <code>images_detail</code>).</li>
              <li>The more frames, the smoother the rotation. 16 frames = silky.</li>
              <li>Copy the product's <b>ID</b> (visible in the products list) and paste it above.</li>
              <li>Save. The showcase appears instantly on the homepage.</li>
            </ol>
          </div>
        </div>

        {/* 3D ring photo picker (top of homepage) */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.19s' }}>
          {sectionTitle('🎡', '3D Ring Photos (top of homepage)', 'Pick exactly which product photos spin on the 3D ring at the very top of your homepage, and in what order. Choose from your product list. Save is independent of the big “Save content” button below.')}

          {/* currently on the ring, in order */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#a98993]">On the ring (in order)</p>
            {ringProducts.length === 0 ? (
              <p className="rounded-2xl bg-rose-50/60 p-4 text-xs leading-relaxed text-[#8c737e]">
                No products selected. When this is empty the ring runs <b>automatically</b>: it uses your visible product covers, or the built‑in brand photos if you have fewer than 3 products.
              </p>
            ) : (
              <ul className="space-y-2">
                {ringProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-rose-50/50 p-2 ring-1 ring-rose-100">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-[#b56576] ring-1 ring-rose-100">{i + 1}</span>
                    <SafeImage src={p.images?.[0]} alt={p.name} className="h-12 w-12 shrink-0 rounded-xl" imgClassName="object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#5d4954]">{p.name}</span>
                    {!p.is_visible && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">hidden</span>}
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => moveRing(i, -1)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm text-[#7f4c5a] ring-1 ring-rose-100 transition hover:bg-rose-50 disabled:opacity-30" aria-label="Move up">↑</button>
                      <button type="button" disabled={i === ringProducts.length - 1} onClick={() => moveRing(i, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm text-[#7f4c5a] ring-1 ring-rose-100 transition hover:bg-rose-50 disabled:opacity-30" aria-label="Move down">↓</button>
                      <button type="button" onClick={() => setRingIds(ringIds.filter((x) => x !== p.id))} className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-sm text-red-500 ring-1 ring-red-100 transition hover:bg-red-100" aria-label="Remove">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* available products to add */}
          {available.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#a98993]">Add a product</p>
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {available.map((p) => (
                  <button type="button" key={p.id} onClick={() => setRingIds([...ringIds, p.id])} className="flex items-center gap-3 rounded-2xl bg-white p-2 text-left ring-1 ring-rose-100 transition hover:bg-rose-50 hover:ring-rose-200">
                    <SafeImage src={p.images?.[0]} alt={p.name} className="h-11 w-11 shrink-0 rounded-xl" imgClassName="object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#5d4954]">{p.name}</span>
                    {!p.is_visible && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">hidden</span>}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#b56576] to-[#d291bc] text-sm text-white">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <button type="button" onClick={clearRing} className="rounded-full bg-rose-50 px-5 py-2 text-xs font-semibold text-[#7f4c5a] transition hover:bg-rose-100">Use automatic</button>
            <button type="button" onClick={saveRing} disabled={ringBusy} className="btn-grad rounded-full px-8 py-2.5 text-xs font-semibold disabled:opacity-70">
              {ringBusy ? <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span> : '💾 Save ring'}
            </button>
          </div>
        </div>

        {/* our story (text + image) */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.2s' }}>
          {sectionTitle('🤍', 'Our Story (About section)', 'The about block on the home page')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('about_kicker', 'Small label')}
            <div className="sm:col-span-1">{area('about_title', 'Title', 2, 'Line breaks are kept.')}</div>
          </div>
          {area('about_text', 'Story text', 4)}
          {area('about_points', 'Checklist points', 4, 'One point per line — each gets a ✓ bullet.')}

          <ImagePicker
            label="About image"
            storageKey="about_image"
            inputRef={aboutRef}
            preview={db.settings.about_image || ''}
            onPick={(files) => files?.[0] && uploadStorageImage('about_image', files[0])}
            hint="Image shown next to the Our Story text. Square crop looks best."
            aspect="aspect-square sm:aspect-[4/3]"
          />
        </div>

        {/* checkout & order messaging */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.22s' }}>
          {sectionTitle('🧾', 'Checkout & Order Messaging', 'All copy shown on the checkout page, confirmation page, and in emails. Empty = use built-in default.')}

          <div className="grid gap-4 sm:grid-cols-2">
            {field('admin_email', 'Admin notification email *', 'Order alerts are sent here. Required for admin emails to work.')}
          </div>

          <h3 className="pt-2 text-xs font-bold uppercase tracking-wider text-[#a98993]">Checkout page</h3>
          {area('checkout_payment_message', 'Payment / confirmation message', 6, 'Shown in the "Order Confirmation & Payment" box above the checkout form.')}
          {area('checkout_email_helper', 'Email field helper text', 3, 'Placeholder + hint shown under the Email Address field.')}
          {area('checkout_footer_note', 'Order summary footer note', 4, 'Shown at the bottom of the order summary sidebar.')}

          <h3 className="pt-4 text-xs font-bold uppercase tracking-wider text-[#a98993]">Success page</h3>
          {field('success_title', 'Success page title', 'e.g. 🎉 Order Received Successfully!')}
          {area('success_message', 'Success page message', 6, 'Shown after the order is placed. Line breaks are kept.')}
          {area('tracking_note', 'Highlighted tracking note', 3, 'Shown directly below the tracking number, in a highlighted box. Leave blank to use the default reminder.')}

          <h3 className="pt-4 text-xs font-bold uppercase tracking-wider text-[#a98993]">Email templates</h3>
          <p className="text-[11px] text-[#bba3ab]">
            Use placeholders like <code>{'{{customer_name}}'}</code>, <code>{'{{order_id}}'}</code>, <code>{'{{tracking_code}}'}</code>, <code>{'{{tracking_url}}'}</code>, <code>{'{{items_text}}'}</code>, <code>{'{{total}}'}</code>, <code>{'{{store_name}}'}</code>, <code>{'{{store_phone}}'}</code>. Leave blank to use the built-in default.
          </p>
          {area('customer_email_template', 'Customer email body', 12, 'Plain text. Wrapped in a styled template automatically.')}
          {area('admin_email_template', 'Admin notification email body', 12, 'Plain text. Sent to the admin email above.')}
        </div>

        {/* testimonials */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.25s' }}>
          {sectionTitle('💬', 'Testimonials', 'Customer reviews carousel — leave empty to hide the whole section')}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('testimonials_kicker', 'Small label')}
            {field('testimonials_title', 'Title')}
          </div>
          {area('testimonials', 'Reviews', 5, 'One per line, format: Name | review text.')}
        </div>

        {/* footer */}
        <div className="anim-up space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.3s' }}>
          {sectionTitle('💝', 'Footer — Payment box', 'Optional payment info text shown in the footer')}
          {area('payment_text', 'Payment text', 2)}
        </div>

        {/* sticky save bar */}
        <div className="anim-up sticky bottom-4 z-20 flex items-center justify-end gap-3 rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-rose-100 backdrop-blur" style={{ animationDelay: '.32s' }}>
          <p className="mr-auto hidden text-xs text-[#a98993] sm:block">Changes are saved to Supabase the moment you click save.</p>
          <button type="submit" disabled={busyInfo} className="btn-grad rounded-full px-10 py-3 text-sm font-semibold disabled:opacity-70">
            {busyInfo ? <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span> : '💾 Save content'}
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
            {busyPw ? <Spinner /> : 'Update password'}
          </button>
        </form>

        {/* logo */}
        <div className="anim-up" style={{ animationDelay: '.4s' }}>
          <div className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-rose-50">
            <h2 className="font-display text-lg font-bold text-[#7f4c5a]">🖼️ Store Logo</h2>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {db.settings.logo ? (
                <img src={db.settings.logo} alt="logo" className="h-16 w-16 rounded-full object-cover ring-2 ring-rose-200" />
              ) : (
                <SafeImage src={null} className="h-16 w-16 rounded-full" label="No logo" />
              )}
              <button type="button" onClick={() => logoRef.current?.click()} disabled={uploading === 'logo'} className="btn-ghost rounded-full px-6 py-2.5 text-xs font-semibold disabled:opacity-50">
                {uploading === 'logo' ? <Spinner /> : db.settings.logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {db.settings.logo && (
                <button type="button" onClick={() => removeImage('logo', 'logo')} className="rounded-full bg-red-50 px-5 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-100">
                  Remove
                </button>
              )}
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files)} />
            </div>
            <p className="mt-3 text-[11px] text-[#bba3ab]">No logo is shown if you don't upload one — empty placeholder, never a demo image.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
