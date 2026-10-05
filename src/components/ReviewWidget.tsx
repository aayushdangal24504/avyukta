import { useEffect, useState } from 'react';

type Review = { id: string; name: string; rating: number; text: string; createdAt: string };
const KEY = 'avyukta_customer_reviews_v1';

function readReviews(): Review[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveReview(review: Review) {
  const reviews = [review, ...readReviews()];
  localStorage.setItem(KEY, JSON.stringify(reviews.slice(0, 100)));
}

export function ReviewWidget({ productId, productName }: { productId?: number; productName?: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);
  useEffect(() => setReviews(readReviews().filter((r) => productId ? r.id.startsWith(`${productId}:`) : r.id.startsWith('site:'))), [productId, sent]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim() || !rating) return;
    saveReview({ id: `${productId ?? 'site'}:${Date.now()}`, name: name.trim(), rating, text: text.trim(), createdAt: new Date().toISOString() });
    setName(''); setText(''); setRating(0); setSent(true);
  };
  return <section className="mt-12 rounded-[2rem] bg-white p-6 shadow-lg shadow-rose-100/50 ring-1 ring-rose-100 sm:p-8">
    <div className="text-center"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#d291bc]">{productName ? 'Love this arrangement?' : 'Your voice matters'}</p><h2 className="mt-2 font-display text-2xl font-bold text-[#41323a]">{productName ? 'Review this product' : 'Tell us about Avyukta'}</h2><p className="mt-2 text-sm text-[#8c737e]">{productName ? 'Please rate this product and share your experience.' : 'Leave an honest review of your experience with our website and service.'}</p></div>
    {reviews.length > 0 && <div className="mt-6 space-y-3">{reviews.slice(0, 3).map((r) => <article key={r.id} className="rounded-2xl bg-rose-50/60 p-4"><div className="flex justify-between gap-3"><strong className="text-sm text-[#41323a]">{r.name}</strong><span className="text-[#c46c91]" aria-label={`${r.rating} out of 5 stars`}>{'★'.repeat(r.rating)}<span className="text-rose-200">{'★'.repeat(5-r.rating)}</span></span></div><p className="mt-2 text-sm leading-relaxed text-[#6f5964]">{r.text}</p></article>)}</div>}
    <form onSubmit={submit} className="mt-6 space-y-3"><div className="flex justify-center gap-1" role="radiogroup" aria-label="Choose a rating">{[1,2,3,4,5].map((n) => <button type="button" key={n} onClick={() => setRating(n)} className={`text-3xl transition hover:scale-110 ${n <= rating ? 'text-[#c46c91]' : 'text-rose-100'}`} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-checked={rating === n} role="radio">★</button>)}</div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required className="w-full rounded-xl border border-rose-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200" /><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={productName ? 'How was this product?' : 'How was your experience?'} required rows={3} className="w-full resize-none rounded-xl border border-rose-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200" /><button disabled={!rating} className="btn-grad w-full rounded-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{sent ? 'Review submitted ✓' : 'Submit review'}</button><p className="text-center text-[11px] text-[#a98993]">Reviews are shown on this device until connected to your store review inbox.</p></form>
  </section>;
}
