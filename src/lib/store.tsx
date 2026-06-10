/**
 * Global app state: session auth, cart, toast notifications.
 * Session is persisted (sessionStorage) so admin/customer stay logged in per tab.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getDB, saveDB, replaceCache, nextId, hashPassword, checkPassword, sanitize, User, Product } from './db';
import { isCloudConfigured, pullFromCloud, pushToCloud } from './supabase';

export interface CartItem {
  product_id: number;
  quantity: number;
}
interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error';
}
interface Session {
  user_id: number;
  username: string;
  role: 'admin' | 'customer';
}

interface StoreCtx {
  session: Session | null;
  login: (u: string, p: string) => { ok: boolean; error?: string; role?: string };
  register: (u: string, p: string) => { ok: boolean; error?: string };
  logout: () => void;
  cart: CartItem[];
  addToCart: (id: number, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  cartProducts: { product: Product; quantity: number }[];
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  toasts: Toast[];
  toast: (msg: string, type?: 'success' | 'error') => void;
  dbVersion: number; // bump to re-render on db change
}

const Ctx = createContext<StoreCtx>(null as never);
export const useStore = () => useContext(Ctx);

const SESSION_KEY = 'avyukta_session';
const CART_KEY = 'avyukta_cart';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbVersion, setDbVersion] = useState(0);

  // re-render whenever any module mutates the db
  useEffect(() => {
    const fn = () => setDbVersion((v) => v + 1);
    window.addEventListener('avyukta-db-change', fn);
    return () => window.removeEventListener('avyukta-db-change', fn);
  }, []);

  // cloud sync on boot: pull Supabase data if configured (seed the cloud if it's empty)
  useEffect(() => {
    if (!isCloudConfigured()) return;
    (async () => {
      try {
        const cloud = await pullFromCloud();
        if (cloud) replaceCache(cloud);
        else await pushToCloud(getDB()); // fresh cloud project → seed it with local data
      } catch (e) {
        console.warn('AVYUKTA cloud sync failed:', (e as Error).message);
      }
    })();
  }, []);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [session]);

  const toast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ------------------------------- auth ------------------------------- */
  const login = useCallback((username: string, password: string) => {
    const db = getDB();
    const user = db.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user || !checkPassword(password, user.password_hash)) {
      return { ok: false, error: 'Invalid username or password.' };
    }
    setSession({ user_id: user.id, username: user.username, role: user.role });
    return { ok: true, role: user.role };
  }, []);

  const register = useCallback((username: string, password: string) => {
    const u = sanitize(username);
    if (u.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    const db = getDB();
    if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase()))
      return { ok: false, error: 'Username is already taken.' };
    const user: User = { id: nextId('users'), username: u, password_hash: hashPassword(password), role: 'customer', created_at: new Date().toISOString() };
    db.users.push(user);
    saveDB();
    setSession({ user_id: user.id, username: user.username, role: 'customer' });
    return { ok: true };
  }, []);

  const logout = useCallback(() => setSession(null), []);

  /* ------------------------------- cart ------------------------------- */
  const addToCart = useCallback((id: number, qty = 1) => {
    setCart((c) => {
      const ex = c.find((i) => i.product_id === id);
      if (ex) return c.map((i) => (i.product_id === id ? { ...i, quantity: i.quantity + qty } : i));
      return [...c, { product_id: id, quantity: qty }];
    });
    // bounce the cart badge
    document.getElementById('cart-btn')?.classList.remove('cart-bounce');
    requestAnimationFrame(() => document.getElementById('cart-btn')?.classList.add('cart-bounce'));
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((i) => i.product_id !== id) : c.map((i) => (i.product_id === id ? { ...i, quantity: qty } : i))));
  }, []);
  const removeFromCart = useCallback((id: number) => setCart((c) => c.filter((i) => i.product_id !== id)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const db = getDB();
  const cartProducts = cart
    .map((i) => ({ product: db.products.find((p) => p.id === i.product_id)!, quantity: i.quantity }))
    .filter((x) => x.product);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cartProducts.reduce((s, i) => s + i.product.price * i.quantity, 0);

  return (
    <Ctx.Provider
      value={{ session, login, register, logout, cart, addToCart, setQty, removeFromCart, clearCart, cartCount, cartTotal, cartProducts, cartOpen, setCartOpen, toasts, toast, dbVersion }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** "Fly to cart" animation: clones an image element and animates it to the cart icon. */
export function flyToCart(imgEl: HTMLElement | null) {
  const cartBtn = document.getElementById('cart-btn');
  if (!imgEl || !cartBtn) return;
  const from = imgEl.getBoundingClientRect();
  const to = cartBtn.getBoundingClientRect();
  const clone = imgEl.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'fixed', left: from.left + 'px', top: from.top + 'px',
    width: from.width + 'px', height: from.height + 'px',
    borderRadius: '16px', zIndex: '9999', pointerEvents: 'none',
    transition: 'all .8s cubic-bezier(.5,-0.2,.3,1.1)', objectFit: 'cover',
  });
  document.body.appendChild(clone);
  requestAnimationFrame(() => {
    Object.assign(clone.style, {
      left: to.left + to.width / 2 - 14 + 'px', top: to.top + to.height / 2 - 14 + 'px',
      width: '28px', height: '28px', opacity: '0.3', borderRadius: '50%',
    });
  });
  setTimeout(() => clone.remove(), 850);
}
