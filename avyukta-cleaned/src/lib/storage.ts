/**
 * AVYUKTA — Supabase Storage uploads (bucket: "products").
 *
 * Flow: admin crops image → we upload the FINAL processed JPEG to the bucket
 * with a unique filename → store the returned public URL in products.images.
 * If Supabase is unreachable we fall back to an inline data-URL (so the admin
 * is never blocked) — but we NEVER substitute a demo/placeholder image.
 */
import { getClient, isCloudConfigured } from './supabase';

const BUCKET = 'products';

export interface UploadResult {
  url: string;
  cloud: boolean;
  warning?: string;
}

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

export async function uploadProductImage(blob: Blob): Promise<UploadResult> {
  const sb = getClient();

  if (!sb || !isCloudConfigured()) {
    return { url: await blobToDataURL(blob), cloud: false, warning: 'Cloud not connected — image stored locally.' };
  }

  const name = uniqueName();
  const { error } = await sb.storage.from(BUCKET).upload(name, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    let hint = error.message;
    if (/bucket.*not.*found/i.test(error.message)) hint = 'bucket "products" missing — run supabase/fix-storage.sql';
    else if (/row-level security|violates/i.test(error.message)) hint = 'storage permissions missing — run supabase/fix-storage.sql once';
    return { url: await blobToDataURL(blob), cloud: false, warning: hint };
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(name);
  return { url: data.publicUrl, cloud: true };
}

export function fileToCompressedDataURL(file: File, maxDim = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
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
