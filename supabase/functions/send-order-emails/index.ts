// Supabase Edge Function: send-order-emails
//
// Deploy with:
//   supabase functions deploy send-order-emails --no-verify-jwt
//
// Required secrets (set via Supabase Dashboard → Edge Functions → Secrets,
// OR via CLI:  supabase secrets set RESEND_API_KEY=...  EMAIL_FROM=...):
//
//   RESEND_API_KEY   - your Resend API key (from https://resend.com/api-keys)
//   EMAIL_FROM       - e.g.  "Your Store <orders@yourdomain.com>"
//                      (must be a verified Resend sender / domain)
//
// Inputs (JSON body):
//   {
//     order: { id, customer_name, phone, email, location, notes, total,
//              status, created_at, tracking_code },
//     items: [{ product_name, price, quantity }, ...],
//     trackingUrl: "https://yoursite.com/#/track/<code>"
//   }
//
// Behaviour:
//   1) Reads the project's `settings` table for: admin_email,
//      customer_email_template, admin_email_template, store_name.
//   2) Renders the templates (simple {{placeholder}} substitution).
//   3) Sends:
//       - admin email (only if admin_email is set in settings)
//       - customer email (only if order.email is non-empty)
//
//   The function NEVER touches existing rows. Pure read + send.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function money(n: number): string {
  return 'Rs. ' + Number(n || 0).toFixed(2);
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}

function itemsAsText(items: any[]): string {
  return items.map((i) => `- ${i.product_name} × ${i.quantity}  (${money(i.price * i.quantity)})`).join('\n');
}

function itemsAsHtml(items: any[]): string {
  return (
    '<table style="width:100%;border-collapse:collapse;font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial">' +
    '<thead><tr>' +
    '<th align="left" style="padding:8px;border-bottom:1px solid #eee">Item</th>' +
    '<th align="center" style="padding:8px;border-bottom:1px solid #eee">Qty</th>' +
    '<th align="right" style="padding:8px;border-bottom:1px solid #eee">Total</th>' +
    '</tr></thead><tbody>' +
    items
      .map(
        (i) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #f3f3f3">${esc(i.product_name)}</td>` +
          `<td align="center" style="padding:8px;border-bottom:1px solid #f3f3f3">${i.quantity}</td>` +
          `<td align="right" style="padding:8px;border-bottom:1px solid #f3f3f3">${esc(money(i.price * i.quantity))}</td></tr>`,
      )
      .join('') +
    '</tbody></table>'
  );
}

/* ----------------------------- default templates ----------------------------- */

const DEFAULT_CUSTOMER_TEMPLATE = `Hi {{customer_name}},

Thank you for your order with {{store_name}}!

🎉 Order Received Successfully

Your order number: #{{order_id}}
Tracking code: {{tracking_code}}
Track your order: {{tracking_url}}

Order Summary:
{{items_text}}

Total: {{total}}

What happens next:
Our team will review your order and contact you shortly to confirm the details,
discuss delivery arrangements, and finalize payment options.

If you have any questions, just reply to this email.

— {{store_name}}
{{store_phone}}
`;

const DEFAULT_ADMIN_TEMPLATE = `New order received

Order #{{order_id}}
Tracking: {{tracking_code}}
Time: {{order_time}}

Customer:
  Name:  {{customer_name}}
  Phone: {{customer_phone}}
  Email: {{customer_email}}

Delivery address:
  {{address}}

Notes:
  {{notes}}

Items:
{{items_text}}

Total: {{total}}

Open the admin panel to manage this order.
`;

/* --------------------------------- handler --------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'orders@example.com';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: corsHeaders });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase env not set' }), { status: 500, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const order = body?.order || {};
  const items = Array.isArray(body?.items) ? body.items : [];
  const trackingUrl = String(body?.trackingUrl || '');

  // Read settings server-side (so admin can edit templates from the UI).
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: settingRows } = await sb.from('settings').select('key,value');
  const settings: Record<string, string> = {};
  (settingRows || []).forEach((r: any) => { settings[r.key] = r.value ?? ''; });

  const customerTpl = settings.customer_email_template?.trim() || DEFAULT_CUSTOMER_TEMPLATE;
  const adminTpl = settings.admin_email_template?.trim() || DEFAULT_ADMIN_TEMPLATE;
  const adminEmail = (settings.admin_email || '').trim();
  const storeName = settings.store_name || 'Our store';

  const vars: Record<string, string> = {
    customer_name: order.customer_name || '',
    customer_phone: order.phone || '',
    customer_email: order.email || '',
    address: order.location || '',
    notes: order.notes || '(none)',
    order_id: String(order.id ?? ''),
    tracking_code: order.tracking_code || '',
    tracking_url: trackingUrl,
    order_time: new Date(order.created_at || Date.now()).toLocaleString(),
    total: money(order.total),
    items_text: itemsAsText(items),
    store_name: storeName,
    store_phone: settings.phone || '',
    store_email: settings.email || '',
    store_address: settings.address || '',
    store_whatsapp: settings.whatsapp || '',
    store_instagram: settings.instagram || '',
    store_tiktok: settings.tiktok || '',
  };

  const itemsHtml = itemsAsHtml(items);

  const customerText = render(customerTpl, vars);
  const adminText = render(adminTpl, vars);

  const wrapHtml = (textBody: string, headline: string) => `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#fbf6f2;font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.05)">
    <div style="padding:24px 28px;background:linear-gradient(135deg,#b56576,#d291bc);color:#fff">
      <h1 style="margin:0;font-size:20px;font-weight:600">${esc(headline)}</h1>
    </div>
    <div style="padding:24px 28px;color:#3a2b32">
      <pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(textBody)}</pre>
      <div style="margin-top:24px">${itemsHtml}</div>
    </div>
  </div>
</body></html>`;

  /* ------------------------------- send emails ------------------------------ */
  const results: Record<string, unknown> = {};

  const sendOne = async (to: string, subject: string, text: string, html: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text, html }),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  };

  // 1) customer
  if (order.email) {
    try {
      results.customer = await sendOne(
        order.email,
        `Order Confirmation - #${order.id}`,
        customerText,
        wrapHtml(customerText, `🎉 Order Received — #${order.id}`),
      );
    } catch (e) {
      results.customer = { error: (e as Error).message };
    }
  } else {
    results.customer = { skipped: 'no customer email' };
  }

  // 2) admin
  if (adminEmail) {
    try {
      results.admin = await sendOne(
        adminEmail,
        `New order #${order.id} — ${order.customer_name || 'customer'}`,
        adminText,
        wrapHtml(adminText, `New order #${order.id}`),
      );
    } catch (e) {
      results.admin = { error: (e as Error).message };
    }
  } else {
    results.admin = { skipped: 'no admin_email in settings' };
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
