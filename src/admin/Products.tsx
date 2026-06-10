/** Admin products: list, add/edit with multi-image upload + preview, delete confirm, toggles. */
import { useRef, useState } from 'react';
import { getDB, saveDB, nextId, money, sanitize, Product } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Spinner } from '../components/ui';

const emptyForm = { name: '', description: '', price: '', stock: '', category_id: 0, images: [] as string[], is_featured: false, is_new: false, is_best: false, is_visible: true };

export default function AdminProducts() {
  const { toast } = useStore();
  const db = getDB();
  const [editing, setEditing] = useState<Product | null | 'new'>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const products = [...db.products].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const catName = (id: number) => db.categories.find((c) => c.id === id)?.name || '—';

  const openNew = () => { setForm({ ...emptyForm, category_id: db.categories[0]?.id || 0 }); setEditing('new'); };
  const openEdit = (p: Product) => {
    setForm({ name: p.name, description: p.description, price: String(p.price), stock: String(p.stock), category_id: p.category_id, images: [...p.images], is_featured: p.is_featured, is_new: p.is_new, is_best: p.is_best, is_visible: p.is_visible });
    setEditing(p);
  };

  /* image upload → base64 previews (the "static/uploads" equivalent) */
  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 5).forEach((f) => {
      if (!f.type.startsWith('image/')) return toast('Only image files are allowed.', 'error');
      if (f.size > 1.5 * 1024 * 1024) return toast(`${f.name} is too large (max 1.5 MB).`, 'error');
      const reader = new FileReader();
      reader.onload = () => setForm((fm) => ({ ...fm, images: [...fm.images, reader.result as string] }));
      reader.readAsDataURL(f);
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);
    if (form.name.trim().length < 2) return toast('Product name is required.', 'error');
    if (isNaN(price) || price <= 0) return toast('Enter a valid price.', 'error');
    if (isNaN(stock) || stock < 0) return toast('Enter a valid stock quantity.', 'error');
    if (!form.category_id) return toast('Choose a category.', 'error');
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));

    if (editing === 'new') {
      db.products.push({
        id: nextId('products'), name: sanitize(form.name), description: sanitize(form.description),
        price, stock, category_id: form.category_id,
        images: form.images.length ? form.images : ['images/p1.jpg'],
        is_featured: form.is_featured, is_new: form.is_new, is_best: form.is_best, is_visible: form.is_visible, created_at: new Date().toISOString(),
      });
      toast('Product added 🎉');
    } else if (editing) {
      Object.assign(editing, { name: sanitize(form.name), description: sanitize(form.description), price, stock, category_id: form.category_id, images: form.images.length ? form.images : editing.images, is_featured: form.is_featured, is_new: form.is_new, is_best: form.is_best, is_visible: form.is_visible });
      toast('Product updated ✓');
    }
    saveDB();
    setBusy(false);
    setEditing(null);
  };

  const toggle = (p: Product, key: 'is_visible' | 'is_featured' | 'is_new' | 'is_best') => {
    p[key] = !p[key];
    saveDB();
    const msgs: Record<typeof key, string> = {
      is_visible: p.is_visible ? 'Product is now visible in store' : 'Product hidden from store',
      is_featured: p.is_featured ? 'Marked as featured ★' : 'Removed from featured',
      is_new: p.is_new ? 'Marked as New Arrival 🌷' : 'Removed from New Arrivals',
      is_best: p.is_best ? 'Marked as Best Seller 💖' : 'Removed from Best Sellers',
    };
    toast(msgs[key]);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    db.products = db.products.filter((p) => p.id !== confirmDel.id);
    saveDB();
    toast('Product deleted.');
    setConfirmDel(null);
  };

  return (
    <div className="page-enter">
      <div className="anim-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Products</h1>
          <p className="mt-1 text-sm text-[#a98993]">{products.length} products in your catalog</p>
        </div>
        <button onClick={openNew} className="btn-grad rounded-full px-6 py-2.5 text-sm font-semibold">+ Add Product</button>
      </div>

      {products.length === 0 ? (
        <EmptyState icon="🎁" title="No products yet" sub="Add your first handmade creation to start selling." action={<button onClick={openNew} className="btn-grad rounded-full px-6 py-2.5 text-sm font-semibold">Add product</button>} />
      ) : (
        <div className="anim-up mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50" style={{ animationDelay: '.1s' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rose-50/60 text-xs uppercase tracking-wider text-[#a98993]">
                <tr>
                  <th className="px-5 py-3">Product</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Visible</th><th className="px-5 py-3">Featured</th><th className="px-5 py-3">New</th><th className="px-5 py-3">Best</th><th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-rose-50 transition hover:bg-rose-50/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.images[0]} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-rose-100" />
                        <span className="max-w-[200px] truncate font-medium text-[#5d4954]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#a98993]">{catName(p.category_id)}</td>
                    <td className="px-5 py-3 font-semibold">{money(p.price)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.stock === 0 ? 'bg-red-100 text-red-600' : p.stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.stock}</span>
                    </td>
                    <td className="px-5 py-3"><Toggle on={p.is_visible} onClick={() => toggle(p, 'is_visible')} /></td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggle(p, 'is_featured')} className={`text-xl transition active:scale-75 ${p.is_featured ? 'text-amber-400' : 'text-rose-200 hover:text-amber-300'}`} title="Toggle featured">★</button>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggle(p, 'is_new')} className={`text-xl transition active:scale-75 ${p.is_new ? '' : 'opacity-25 grayscale hover:opacity-60'}`} title="Toggle new arrival">🌷</button>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggle(p, 'is_best')} className={`text-xl transition active:scale-75 ${p.is_best ? '' : 'opacity-25 grayscale hover:opacity-60'}`} title="Toggle best seller">💖</button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-semibold text-[#7f4c5a] transition hover:bg-rose-100">Edit</button>
                      <button onClick={() => setConfirmDel(p)} className="ml-2 rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-100">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* add/edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="anim-pop my-8 w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-[#41323a]">{editing === 'new' ? 'Add Product' : 'Edit Product'}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-soft" required />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input-soft resize-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Price ($) *</label>
                <input type="number" step="0.01" min="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input-soft" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Stock *</label>
                <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="input-soft" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Category *</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })} className="input-soft">
                  {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#5d4954]">
                  <input type="checkbox" checked={form.is_visible} onChange={(e) => setForm({ ...form, is_visible: e.target.checked })} className="h-4 w-4 accent-[#b56576]" /> Visible
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#5d4954]">
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="h-4 w-4 accent-[#b56576]" /> Featured ★
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#5d4954]">
                  <input type="checkbox" checked={form.is_new} onChange={(e) => setForm({ ...form, is_new: e.target.checked })} className="h-4 w-4 accent-[#b56576]" /> New Arrival 🌷
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#5d4954]">
                  <input type="checkbox" checked={form.is_best} onChange={(e) => setForm({ ...form, is_best: e.target.checked })} className="h-4 w-4 accent-[#b56576]" /> Best Seller 💖
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Images (up to 5, max 1.5 MB each)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
                  className="cursor-pointer rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-5 text-center text-sm text-[#a98993] transition hover:border-[#b56576] hover:bg-rose-50"
                >
                  📷 Click or drag & drop images here
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
                {form.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {form.images.map((src, i) => (
                      <div key={i} className="anim-pop relative">
                        <img src={src} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-rose-100" />
                        <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs text-white shadow transition hover:scale-110">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full px-6 py-2.5 text-sm font-semibold text-[#a98993] transition hover:bg-rose-50">Cancel</button>
              <button type="submit" disabled={busy} className="btn-grad rounded-full px-8 py-2.5 text-sm font-semibold disabled:opacity-70">
                {busy ? <Spinner /> : editing === 'new' ? 'Add Product' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* delete confirmation */}
      {confirmDel && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="anim-pop w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-2xl">🗑️</span>
            <h3 className="mt-4 font-display text-lg font-bold text-[#41323a]">Delete “{confirmDel.name}”?</h3>
            <p className="mt-2 text-sm text-[#a98993]">This cannot be undone. The product will be removed from your store.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setConfirmDel(null)} className="rounded-full bg-rose-50 px-6 py-2.5 text-sm font-semibold text-[#7f4c5a]">Cancel</button>
              <button onClick={doDelete} className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-600 active:scale-95">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${on ? 'bg-gradient-to-r from-[#b56576] to-[#d291bc]' : 'bg-rose-100'}`} aria-pressed={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
