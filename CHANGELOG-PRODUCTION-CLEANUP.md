# Production Cleanup — Changelog

This is a complete audit of every change made to make the codebase
**Supabase-only, demo-free, and safe**.

## Hard guarantees added

| Rule | How it's enforced |
|---|---|
| Supabase is the only source of truth | `pullFromCloud()` runs on every app load; whatever it returns *is* the cache. We never push back unless YOU change something. |
| No automatic seeding / initialization | `seed()` function deleted; `emptyDB()` returns a 100% empty shell that is **never pushed** to the cloud. |
| No demo data anywhere | `SETTING_DEFAULTS`, `'images/p1.jpg'`/`'images/cat1.jpg'` fallbacks, the seeded `admin/admin123` user, hardcoded "AVYUKTA" strings in Home / Footer — **all deleted**. |
| Existing data never reset / replaced / wiped | Old "Reset demo data" button and `resetDB()` function deleted. CloudSync no longer has a `pushToCloud` button that could clobber the cloud. Diff-sync still only deletes rows YOU deleted from this tab. |
| Missing images show "No image" | New `<NoImage/>` + `<SafeImage/>` components. Every demo image fallback was replaced. |
| Empty admin inputs | `Settings.tsx` now reads `getSetting(k)` which returns `''` when missing. Inputs render empty. |
| Empty storefront | `Home.tsx` hides every section whose underlying data is empty. If everything is empty, you get a single "Welcome / open admin" empty state. |
| Cache invalidation for upgraders | `CACHE_VERSION = 'v2-production-clean'` — old browsers running the new build wipe their localStorage once. |
| First-run admin setup | When Supabase `users` table has no admin yet, `AdminLogin` switches to "Create admin" mode (asks for username + password + confirm). |

---

## File-by-file changes

### `src/lib/db.ts`
- **Removed** `SETTING_DEFAULTS` object (had hardcoded store name, tagline, hero, about, testimonials, phone `+1 (555) 010-2030`, address, instagram/facebook/whatsapp URLs, etc.).
- **Removed** `seed()` function (created the `admin/admin123` user).
- **Removed** `resetDB()` function.
- **Added** `emptyDB()` — returns a completely empty shape; **never pushed to cloud**.
- **Added** `clearLegacyCacheOnce()` — one-time `localStorage` wipe on first load of the new build.
- **Added** `hasAnyAdmin()` helper for the first-run setup flow.
- `getSetting(key)` now returns `''` if the key is missing (no fallback to defaults).
- `createOrder` and helpers unchanged.

### `src/lib/supabase.ts`
- **Removed** hardcoded `SUPABASE_URL = 'https://qmiqwihgremdfehaiccu.supabase.co'`.
- **Removed** hardcoded `DEFAULT_ANON_KEY = 'sb_publishable_…'`.
- Both URL and anon key now come from:
  1. localStorage (configured via Admin → Cloud Sync), or
  2. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars.
- `pullFromCloud()` no longer returns `null` when tables are empty — it returns the empty state. **No more "seed cloud with my local data" fallback.**

### `src/lib/store.tsx`
- **Removed** the `if (cloud) { ... } else { await pushToCloud(getDB()); }` branch that auto-seeded an empty Supabase project.
- **Added** `createInitialAdmin()` for first-run setup.
- **Added** `flyToCart()` helper (was previously a missing import).
- Cleanly blocks UI render until first cloud pull completes.

### `src/lib/storage.ts`
- Comments cleaned. No demo image fallbacks (already absent).

### `src/components/ui.tsx`
- **Added** `<NoImage>` — neutral "No image" placeholder area.
- **Added** `<SafeImage>` — `<img>` if `src` is truthy, otherwise `<NoImage>`. Drop-in replacement used everywhere.

### `src/components/layout.tsx`
- `<Logo>` shows a neutral dot when no logo uploaded — no `✿` demo emoji as a fallback.
- `<Footer>` only renders sections (Contact, Socials, Payment) when their data exists. No more hardcoded "Handmade with love" tagline or "© AVYUKTA · Handmade with 🤍".
- Added support for new admin-editable settings: `email`, `website`, `business_hours`.
- Cart drawer cleaned — removed "Lovely handmade things are waiting" copy.

### `src/components/ProductCard.tsx`
- Uses `<SafeImage>` everywhere. Missing `product.images[0]` no longer renders a broken `<img>` — shows "No image".

### `src/pages/Home.tsx`
- Every section (`Hero`, `Categories`, `Featured`, `New`, `Best`, `About`, `Testimonials`) renders **only when its own settings/data exist**.
- New "Welcome — open admin" empty state shown when nothing has been configured.
- Removed hardcoded fallback `'images/p1.jpg'` hero image.
- Removed hardcoded "✿ Featured" / "BEST SELLER" badge ribbons that ignored admin flags.

### `src/pages/ProductDetail.tsx`
- Removed `images.length ? product.images : ['images/p1.jpg']` fallback.
- Uses `<SafeImage>` for missing images.
- Removed hardcoded "🎀 Gift wrapped / 🚚 Cash on delivery / 🤍 Handmade to order" promo box (was demo copy).

### `src/pages/Shop.tsx`
- No changes needed (rendered only DB data).

### `src/pages/Checkout.tsx`
- Removed example placeholder names like `"e.g. Sara Malek"`.
- Generic, no demo references.

### `src/pages/Account.tsx`
- No changes (no demo data).

### `src/admin/AdminLogin.tsx`
- **Removed** `Default: admin / admin123` hint text.
- **Removed** `placeholder="admin"`.
- **Added** first-run setup mode: when `hasAnyAdmin() === false`, the form becomes "Create admin user" with username + password + confirm password.

### `src/admin/Settings.tsx`
- **Removed** `Restore default texts` button (was loading demo strings).
- **Removed** `Reset demo data` "Danger Zone" (was destructively reseeding).
- Replaced with `Clear all fields` which only blanks the editable settings — never touches products, categories, orders, or users.
- Inputs are populated from Supabase — empty by default.
- Added editable fields: **email, website, business_hours**.
- Logo section now shows "No logo" placeholder + a "Remove" button.

### `src/admin/CloudSync.tsx`
- **Removed** hardcoded project URL display.
- **Removed** pre-populated anon key.
- User must paste BOTH the project URL and the anon key.
- **Removed** the `Push local → cloud` button (could destructively seed cloud).
- Kept only `Pull latest from cloud`, `Connect`, and `Disconnect`.

### `src/admin/Categories.tsx`
- **Removed** `image: form.image || 'images/cat1.jpg'` fallback. New categories may have no image — shows "No image".
- Edit form now allows explicitly removing a category's image.

### `src/admin/Products.tsx`
- **Removed** `images: form.images.length ? form.images : ['images/p1.jpg']` fallback on add.
- **Removed** the matching fallback on edit. Empty arrays are now respected.
- Table thumbnails use `<SafeImage>`.

### `src/admin/Dashboard.tsx`
- Low-stock thumbnails use `<SafeImage>`. Otherwise unchanged.

### `src/admin/AdminLayout.tsx` / `src/admin/Orders.tsx`
- No changes (no demo data).

### `supabase/schema.sql`
- Renamed policies to drop the `"avyukta "` prefix (cosmetic).
- Added explicit footer comment confirming the app NEVER auto-seeds.
- No INSERTs anywhere in the file.

### `index.html`
- Removed hardcoded `<title>AVYUKTA — Handmade Gifts...</title>` and meta description. Now generic `<title>Store</title>` so you can override per-deployment or via the admin store name later.

### `public/images/`
- Kept as-is (per your instruction). All 9 files (`p1-p6.jpg`, `cat1-cat3.jpg`) remain, but **no code anywhere references them**.

---

## What still works exactly as before

- Cart, checkout flow, order placement, order export to CSV
- Admin product CRUD (with the image cropper)
- Admin category CRUD with drag-and-drop reordering
- Order status pipeline (Pending → Confirmed → Shipped → Delivered)
- Customer accounts & "My Orders" history
- Multi-tab sync, debounced diff push to Supabase
- Per-tab snapshot guard (stale tabs can't wipe newer cloud data)

---

## First-time setup (the new clean flow)

1. Run `supabase/schema.sql` in your Supabase SQL Editor.
2. `npm install && npm run dev`.
3. Open the app → you'll see the "Welcome / open admin" empty state.
4. Go to `/#/admin/login`.
5. The form is in **"First-time setup"** mode — type the username and password you want for the admin. They're saved to Supabase.
6. Inside the admin, open **Settings → Cloud Sync** → paste your Supabase project URL and anon public key. Click **Connect**.
7. (Optional) Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars before building if you want to skip step 6.
8. Add your real products, categories, and settings. They're saved to Supabase and never reset.

---

## TypeScript / build

- ✅ `npx tsc --noEmit` — passes cleanly
- ✅ `npm run build` — passes cleanly (vite singlefile output ~628 KB)
