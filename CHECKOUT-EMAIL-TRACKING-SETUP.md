# Checkout, Email & Tracking — Setup Guide

This update adds:

- ✅ Required Email field on checkout
- ✅ Secure 24-char hex tracking codes on every order
- ✅ Public `/#/track/:code` tracking page
- ✅ Server-side admin + customer email notifications (Supabase Edge Function + Resend)
- ✅ Admin-editable copy for: checkout messages, success page, customer email template, admin email template
- ✅ TikTok added as a social link option
- ✅ All existing data, products, orders, settings — untouched

---

## Step 1 — Run the DB migration

Supabase Dashboard → SQL Editor → New query → paste the contents of
`supabase/migration-tracking-and-email.sql` → **Run**.

This adds two columns to `orders`:
- `email`         (text, default '')
- `tracking_code` (text, default '')

…and backfills tracking codes for any existing orders. Safe to run multiple times.

---

## Step 2 — Sign up for Resend (free)

1. Go to https://resend.com → sign up
2. **API Keys** → **Create API Key** → name it `avyukta-orders` → copy it (starts with `re_…`)
3. **Domains** → either:
   - **Quick test:** use the `onboarding@resend.dev` sender (works immediately, only for testing)
   - **Production:** add and verify your own domain so the from address looks legit

Free tier: 100 emails/day, 3,000/month. Plenty for a small shop.

---

## Step 3 — Deploy the Edge Function

You need the Supabase CLI: https://supabase.com/docs/guides/cli

```bash
# one-time
supabase login
supabase link --project-ref YOUR_PROJECT_REF   # find it in your Supabase URL

# set the secrets the function needs
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Your Store <orders@yourdomain.com>"
# (or for testing): supabase secrets set EMAIL_FROM="Your Store <onboarding@resend.dev>"

# deploy
supabase functions deploy send-order-emails --no-verify-jwt
```

> `--no-verify-jwt` is required because the function is called from the public
> storefront (anonymous customers, not signed-in users).

**Without the CLI?** Supabase dashboard → Edge Functions → "Deploy a function"
→ paste the contents of `supabase/functions/send-order-emails/index.ts`.

---

## Step 4 — Set the admin email in the app

1. Open Admin → Settings → scroll to **🧾 Checkout & Order Messaging**
2. Fill in **Admin notification email** (e.g. `you@yourshop.com`)
3. Click **Save content**

That email now receives a notification every time a customer checks out.

You can also customise:
- Checkout payment / confirmation message
- Email field helper text
- Order summary footer note
- Success page title + message
- Customer email template (placeholders supported)
- Admin email template (placeholders supported)

Leave any field blank to fall back to the built-in default copy.

### Template placeholders

| Token | Example value |
|---|---|
| `{{customer_name}}` | Aayush Dangal |
| `{{customer_phone}}` | 9812345678 |
| `{{customer_email}}` | aayush@example.com |
| `{{address}}` | Bouddha, Kathmandu |
| `{{notes}}` | Please call before delivery |
| `{{order_id}}` | 42 |
| `{{tracking_code}}` | 4a8f23c0e91b... |
| `{{tracking_url}}` | https://yoursite.com/#/track/4a8f23... |
| `{{order_time}}` | 12/4/2024, 6:32 PM |
| `{{total}}` | Rs. 1,250.00 |
| `{{items_text}}` | - Rose bouquet × 2 ... |
| `{{store_name}}` | Avyukta |
| `{{store_phone}}` | +977... |
| `{{store_email}}` | hello@avyukta.com |
| `{{store_whatsapp}}` | https://wa.me/977... |
| `{{store_instagram}}` | https://instagram.com/... |
| `{{store_tiktok}}` | https://tiktok.com/@... |

---

## Step 5 — Test the flow

1. Open your storefront → add a product → checkout
2. Fill in name, phone, **a real email**, address → place order
3. You should see:
   - 🎉 success page with order number + tracking number
   - **Continue shopping** and **Track order** buttons
4. Check your inbox — both you (admin) and the customer email should arrive
5. Visit `/#/track/<the tracking code>` directly → tracking page loads

---

## What's where

| Concern | File |
|---|---|
| Tracking code generator | `src/lib/db.ts` → `generateTrackingCode()` |
| Order shape (now has `email`, `tracking_code`) | `src/lib/db.ts` → `Order` interface |
| Email dispatch (client → Edge Function) | `src/lib/email.ts` |
| Edge Function (server-side, Resend) | `supabase/functions/send-order-emails/index.ts` |
| Checkout page | `src/pages/Checkout.tsx` |
| Track Order page | `src/pages/TrackOrder.tsx` |
| Admin order management (now shows tracking + email) | `src/admin/Orders.tsx` |
| Admin settings — new section | `src/admin/Settings.tsx` |
| Footer (TikTok + clickable contact + Track link) | `src/components/layout.tsx` |
| Router (added `/track` + `/track/:code`) | `src/App.tsx` |

---

## Security notes

- ✅ Tracking codes use `crypto.getRandomValues` — 96 bits of entropy, infeasible to guess.
- ✅ The Resend API key is stored as a Supabase **secret**, never shipped to the browser.
- ✅ The Edge Function uses the Supabase **service-role** key (also a secret) to read settings — never exposed to the client.
- ✅ Customer + admin emails are dispatched only from the Edge Function — the browser never has the Resend key.
- ⚠️ The tracking page is intentionally public: anyone with a tracking code can see that order's details. The code is unguessable, so this is fine.

---

## Backward compatibility

- Existing orders without an `email` or `tracking_code` keep working (the migration backfills tracking codes).
- Existing settings are untouched — only NEW keys (`admin_email`, `checkout_payment_message`, etc.) are added when you fill them in.
- No products, categories, orders, or images are modified.
- If you haven't deployed the Edge Function yet, checkout still works — emails just get skipped with a console warning.
