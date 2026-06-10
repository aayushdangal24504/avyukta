# 🌸 AVYUKTA — Handmade Gifts E-Commerce

A complete, premium e-commerce experience with **two systems**:

1. **Customer Storefront** — animated home, shop with filters/sort/quick-view, product detail
   with gallery + zoom, slide-in cart drawer, cash-on-delivery checkout, customer accounts
   with order history.
2. **Admin Panel** (`/admin`) — protected dashboard with animated counters & sales chart,
   full product CRUD with image uploads, category management with drag-and-drop reorder,
   order management with status workflow + Excel export, and store settings.

> **Note on architecture:** the original brief asked for Flask + SQLite. This environment
> ships static sites only (no Python runtime), so the backend is faithfully emulated by a
> client-side database layer (`src/lib/db.ts`) that mirrors the exact SQL schema —
> `users`, `categories`, `products`, `orders`, `order_items`, `settings` — persisted in
> `localStorage` with hashed passwords and seeded demo data. All UI, validation, auth flows
> and admin features behave exactly as a server-backed version would.

## 🚀 Run it

```bash
npm install
npm run dev        # development server
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## 🔑 Logins

| Role     | URL              | Credentials          |
|----------|------------------|----------------------|
| Admin    | `#/admin/login`  | `admin` / `admin123` |
| Customer | `#/account`      | register any account |

The admin password can be changed in **Admin → Settings**.

## 🗃️ Database schema (mirrored in `src/lib/db.ts`)

- `users (id, username, password_hash, role, created_at)`
- `categories (id, name, image, sort_order)`
- `products (id, name, description, price, stock, category_id, images, is_featured, is_visible, created_at)`
- `orders (id, customer_name, phone, location, notes, total, status, created_at, user_id)`
- `order_items (id, order_id, product_id, product_name, price, quantity)`
- `settings (key, value)`

Seeded with **3 categories**, **6 products** and **3 sample orders**.
Reset anytime from **Admin → Settings → Danger Zone**.

## ✨ Highlights

- Brand palette: cream `#fffaf0`, rose `#b56576`, gradient `#b56576 → #d291bc`, Poppins + Playfair Display
- Falling flower petals, parallax hero with a 3D rotating product ring, 3D tilt cards
- Fly-to-cart animation, cart badge bounce, shine-sweep gradient buttons
- Scroll-triggered reveals (IntersectionObserver), skeleton shimmer loaders, page transitions
- Animated dashboard counters, 7-day order chart, low-stock alerts
- Validation on every form (phone must be 7–15 digits), XSS-sanitized stored strings,
  protected admin routes, loading states, friendly empty states, branded 404
