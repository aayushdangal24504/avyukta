/** Admin categories: list with product counts, add/edit, delete w/ warning, drag-drop reorder. */
import { useRef, useState } from 'react';
import { getDB, saveDB, nextId, sanitize, getCategoriesSorted, Category } from '../lib/db';
import { useStore } from '../lib/store';
import { EmptyState, Spinner } from '../components/ui';

export default function AdminCategories() {
  const { toast } = useStore();
  const db = getDB();
  const [editing, setEditing] = useState<Category | null | 'new'>(null);
  const [form, setForm] = useState({ name: '', image: '' });
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cats = getCategoriesSorted();
  const countFor = (id: number) => db.products.filter((p) => p.category_id === id).length;

  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Only image files are allowed.', 'error');
    if (f.size > 1.5 * 1024 * 1024) return toast('Image too large (max 1.5 MB).', 'error');
    const reader = new FileReader();
    reader.onload = () => setForm((fm) => ({ ...fm, image: reader.result as string }));
    reader.readAsDataURL(f);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast('Category name is required.', 'error');
    setBusy(true);
    await new Promise((r) => setTimeout(r, 400));
    if (editing === 'new') {
      db.categories.push({ id: nextId('categories'), name: sanitize(form.name), image: form.image || 'images/cat1.jpg', sort_order: db.categories.length });
      toast('Category added 🎉');
    } else if (editing) {
      editing.name = sanitize(form.name);
      if (form.image) editing.image = form.image;
      toast('Category updated ✓');
    }
    saveDB();
    setBusy(false);
    setEditing(null);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    db.categories = db.categories.filter((c) => c.id !== confirmDel.id);
    saveDB();
    toast('Category deleted.');
    setConfirmDel(null);
  };

  /* drag & drop reorder */
  const onDrop = (targetId: number) => {
    if (dragId === null || dragId === targetId) return setOverId(null);
    const order = cats.map((c) => c.id).filter((id) => id !== dragId);
    order.splice(order.indexOf(targetId) + (cats.findIndex((c) => c.id === dragId) < cats.findIndex((c) => c.id === targetId) ? 1 : 0), 0, dragId);
    order.forEach((id, i) => {
      const c = db.categories.find((x) => x.id === id);
      if (c) c.sort_order = i;
    });
    saveDB();
    toast('Order updated ✓');
    setOverId(null);
    setDragId(null);
  };

  return (
    <div className="page-enter">
      <div className="anim-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#41323a]">Categories</h1>
          <p className="mt-1 text-sm text-[#a98993]">Drag cards to reorder how they appear in the store</p>
        </div>
        <button onClick={() => { setForm({ name: '', image: '' }); setEditing('new'); }} className="btn-grad rounded-full px-6 py-2.5 text-sm font-semibold">+ Add Category</button>
      </div>

      {cats.length === 0 ? (
        <EmptyState icon="🗂️" title="No categories yet" sub="Create your first category to organize products." />
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c, i) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
              onDragLeave={() => setOverId(null)}
              onDrop={() => onDrop(c.id)}
              className={`anim-up cursor-grab overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-rose-50 transition-all hover:-translate-y-1 hover:shadow-xl active:cursor-grabbing ${overId === c.id ? 'drag-over' : ''}`}
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <div className="relative h-36">
                <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#7f4c5a] shadow">#{i + 1}</span>
              </div>
              <div className="p-5">
                <h3 className="font-display text-lg font-bold text-[#41323a]">{c.name}</h3>
                <p className="text-xs text-[#a98993]">{countFor(c.id)} product{countFor(c.id) !== 1 && 's'}</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => { setForm({ name: c.name, image: '' }); setEditing(c); }} className="flex-1 rounded-full bg-rose-50 py-2 text-xs font-semibold text-[#7f4c5a] transition hover:bg-rose-100">Edit</button>
                  <button onClick={() => setConfirmDel(c)} className="flex-1 rounded-full bg-red-50 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-100">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* add/edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="anim-pop w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-[#41323a]">{editing === 'new' ? 'Add Category' : 'Edit Category'}</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-soft" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7f4c5a]">Image {editing !== 'new' && '(leave empty to keep current)'}</label>
                <div onClick={() => fileRef.current?.click()} className="cursor-pointer rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-5 text-center text-sm text-[#a98993] transition hover:border-[#b56576]">
                  {form.image ? <img src={form.image} alt="" className="mx-auto h-24 rounded-xl object-cover" /> : '📷 Click to upload image'}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full px-6 py-2.5 text-sm font-semibold text-[#a98993] hover:bg-rose-50">Cancel</button>
              <button type="submit" disabled={busy} className="btn-grad rounded-full px-8 py-2.5 text-sm font-semibold disabled:opacity-70">{busy ? <Spinner /> : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {/* delete confirm with product warning */}
      {confirmDel && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-[#241b20]/60 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="anim-pop w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-2xl">⚠️</span>
            <h3 className="mt-4 font-display text-lg font-bold text-[#41323a]">Delete “{confirmDel.name}”?</h3>
            {countFor(confirmDel.id) > 0 ? (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
                This category contains {countFor(confirmDel.id)} product{countFor(confirmDel.id) !== 1 && 's'}! They will become uncategorized.
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#a98993]">This category is empty — safe to delete.</p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setConfirmDel(null)} className="rounded-full bg-rose-50 px-6 py-2.5 text-sm font-semibold text-[#7f4c5a]">Cancel</button>
              <button onClick={doDelete} className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-600 active:scale-95">Delete anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
