# 🌸 AVYUKTA — Handmade Gifts E-Commerce

A complete, premium e-commerce experience with **two systems**:

1. **Customer Storefront** — animated home, shop with filters/sort/quick-view, product
   pages, slide-in cart drawer, cash-on-delivery checkout, customer accounts with
   order history.
2. **Admin Panel** (`#/admin`) — protected dashboard with animated counters & sales
   chart, full product CRUD with a crop-and-position image editor + Supabase Storage
   uploads, category management with drag-and-drop reorder, order management with
   status workflow + Excel export, and a full content editor for every storefront text.

All prices are shown in **Rs.**

---

## 🚀 Run locally

```bash
npm install
npm run dev        # development server
npm run build      # production build → dist/
npm run preview    # preview the production build
```

The app works fully offline/local out of the box (data in localStorage).
Connecting Supabase (below) makes data and images sync to the cloud across devices.

---

## ☁️ Supabase setup (one-time, ~3 minutes)

The app is pre-configured for the Supabase project:

- **URL:** `https://qmiqwihgremdfehaiccu.supabase.co`
- **Key:** the publishable (anon) key is baked into `src/lib/supabase.ts`

### Step 1 — Create the database tables
Supabase Dashboard → **SQL Editor** → New query → paste the contents of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

Creates all 6 tables (`users`, `categories`, `products`, `orders`, `order_items`,
`settings`) with open RLS policies, plus the public `products` storage bucket.
Safe to re-run any time (it upgrades older tables, e.g. adds missing columns).

### Step 2 — Fix/verify storage permissions
If image uploads ever say *"row-level security policy"*, run
[`supabase/fix-storage.sql`](supabase/fix-storage.sql) the same way.
If SQL fails with *"must be owner of table objects"*, follow the dashboard
instructions inside that file instead (create public bucket `products` + allow-all
policy — takes 1 minute).

### Step 3 — Verify
1. Open the app → **Admin → Settings → ☁️ Cloud Sync** → should say **● Connected**
2. Add a product with an image → check Supabase **Storage → products** (file exists)
   and **Table Editor → products** (row contains the public image URL)

After that, everything is automatic:
- **On load:** the app pulls the latest cloud data (multi-device sync)
- **On change:** every edit/order auto-pushes to Supabase ~1 second later
- **Images:** cropped in the editor → uploaded to the bucket with unique names →
  public URL stored in the products table (never local/blob paths)

---

## 🔑 Logins

| Role     | URL              | Credentials          |
|----------|------------------|----------------------|
| Admin    | `#/admin/login`  | `admin` / `admin123` |
| Customer | `#/account`      | register any account |

Change the admin password in **Admin → Settings**.

---

## 🖼️ Product image workflow

1. Admin selects an image (any size — large files are auto-compressed, never rejected)
2. The crop editor opens: a **real shop-card mock-up at the exact size used in the
   shop** (290:224 frame). Drag to position, zoom via slider / wheel / pinch
3. At zoom 1× the **full photo is visible** (nothing cropped); empty space is filled
   with an elegant blurred copy of the same photo (no bars)
4. **Save & Upload** → one final image is exported (1160px, blur baked in) and used
   **everywhere**: shop card, quick view and inside the product page — one version,
   always identical

---

## 🗃️ Database schema

- `users (id, username, password_hash, role, created_at)`
- `categories (id, name, image, sort_order)`
- `products (id, name, description, price, stock, category_id, images, images_detail, is_featured, is_new, is_best, is_visible, created_at)`
- `orders (id, customer_name, phone, location, notes, total, status, created_at, user_id)`
- `order_items (id, order_id, product_id, product_name, price, quantity)`
- `settings (key, value)`
- Storage bucket: `products` (public)

Seeded with 3 categories, 6 products and 3 sample orders.
Reset anytime: **Admin → Settings → Danger Zone**.

---

## ✨ Feature highlights

- Brand palette: cream `#fffaf0`, rose `#b56576`, gradient `#b56576 → #d291bc`,
  Poppins + Playfair Display
- Falling petals, parallax hero with 3D rotating product ring, 3D tilt cards,
  fly-to-cart animation, scroll reveals, skeleton shimmer loaders
- Product flags: **Featured ★ · New Arrival 🌷 · Best Seller 💖** (quick-toggles in
  the admin table; each drives its own homepage section + card badge)
- Admin can edit **every storefront text** (hero, section titles, Our Story,
  testimonials, footer payment box…) in Settings
- Orders: status workflow with color badges, search, **Excel export**
- Validation everywhere (phone 7–15 digits), XSS-sanitized inputs, protected admin
  routes, friendly empty states, branded 404

---

## ⚠️ Production security notes

Fine for a small shop launch, but be aware:

1. **Open RLS policies** — the anon key can read/write all tables. To harden:
   restrict writes (e.g. anon may only INSERT into `orders`/`order_items`) and manage
   admin operations through Supabase Auth or a service role. Notes are in
   `supabase/schema.sql`.
2. **Demo-grade auth** — passwords are hashed client-side with a lightweight hash.
   Don't reuse a sensitive password for the admin account.
3. The publishable anon key being in the client is **normal** for Supabase apps —
   security must come from RLS policies (see point 1).

---

## 📦 Deploying (Netlify or similar)

`npm run build` produces a single self-contained `dist/index.html`.
Point Netlify's publish directory to `dist` (build command `npm run build`) — no
environment variables or server needed. The deployed site talks directly to Supabase,
so new products and images appear on refresh with zero manual steps.
