/**
 * Email-sending bridge.
 *
 * The browser MUST NOT send emails directly (would require leaking an email
 * provider API key in source code). Instead we POST the order details to a
 * Supabase Edge Function called "send-order-emails" which holds the Resend
 * API key in a server-side secret and dispatches both:
 *
 *   - admin notification email
 *   - customer confirmation email
 *
 * The function reads the admin email + email templates straight from the
 * `settings` table at send time, so the admin can edit templates from the UI.
 *
 * NOTE: If the Edge Function isn't deployed yet, sendOrderEmails() resolves
 * silently with { ok: false, error } so the checkout flow never breaks.
 */

import { getSupabaseUrl, getAnonKey, isCloudConfigured } from './supabase';
import type { Order, OrderItem } from './db';

export interface SendOrderEmailsArgs {
  order: Order;
  items: OrderItem[];
  trackingUrl: string;
}

export interface SendOrderEmailsResult {
  ok: boolean;
  warning?: string;
}

export async function sendOrderEmails(args: SendOrderEmailsArgs): Promise<SendOrderEmailsResult> {
  if (!isCloudConfigured()) {
    return { ok: false, warning: 'Cloud not configured — emails not sent.' };
  }
  const url = getSupabaseUrl();
  const key = getAnonKey();
  const fnUrl = `${url}/functions/v1/send-order-emails`;

  try {
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(args),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, warning: `email function HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, warning: (e as Error).message };
  }
}
