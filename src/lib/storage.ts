/**
 * AVYUKTA — Supabase Storage uploads (bucket: "products").
 *
 * Flow: admin crops image → we upload the FINAL processed JPEG to the bucket
 * with a unique filename → store the returned public URL in products.images.
 * Never stores blob:/local paths. Falls back to an inline data-URL only if
 * the cloud is unreachable, so the admin is never blocked.
 */
import { getClient, isCloudConfigured } from './supabase';

const BUCKET = 'products';

export interface UploadResult {
  url: string;       // public URL (or data-URL fallback)
  cloud: boolean;    // true = stored in Supabase Storage
  warning?: string;  // present when we had to fall back
}

/** Unique, collision-proof filename: product-<timestamp>-<random>.jpg */
function uniqueName(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `product-${Date.now()}-${rand}.jpg`;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read image.'));
    r.readAsDataURL(blob);
  });
}

/** Upload a processed image blob to the `products` bucket; returns its public URL. */
export async function uploadProductImage(blob: Blob): Promise<UploadResult> {
  const sb = getClient();

  // no cloud configured → inline storage so the admin can keep working
  if (!sb || !isCloudConfigured()) {
    return { url: await blobToDataURL(blob), cloud: false, warning: 'Cloud not connected — image stored locally.' };
  }

  const name = uniqueName();
  const { error } = await sb.storage.from(BUCKET).upload(name, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false, // unique names make collisions impossible anyway
  });

  if (error) {
    // graceful fallback + a clear, actionable message for the admin
    let hint = error.message;
    if (/bucket.*not.*found/i.test(error.message)) hint = 'bucket "products" missing — run supabase/fix-storage.sql';
    else if (/row-level security|violates/i.test(error.message)) hint = 'storage permissions missing — run supabase/fix-storage.sql once';
    return { url: await blobToDataURL(blob), cloud: false, warning: hint };
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(name);
  return { url: data.publicUrl, cloud: true };
}

/**
 * Read any image file into a data URL, auto-downscaling/compressing large
 * files so uploads NEVER fail because of size. Keeps PNG transparency.
 */
export function fileToCompressedDataURL(file: File, maxDim = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      // small files at small dimensions: keep as-is via canvas re-encode anyway
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const isPng = file.type === 'image/png';
      resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image file.')); };
    img.src = url;
  });
}
