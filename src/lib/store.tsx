/**
 * Global app state: session auth, cart, toast notifications.
 *
 * PRODUCTION-CLEAN: never auto-seeds Supabase, never falls back to demo data.
 * If the cloud is empty, the local cache simply stays empty and the UI shows
 * empty states.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  getDB,
  saveDB,
  replaceCache,
  reloadFromStorage,
  nextId,
  hashPassword,
  checkPassword,
  sanitize,
  sellableStock,
  User,
  Product,
  DB_KEY
} from './db';

import {
  CartLine,
  addToLines,
  countUnits,
  normalizeCart,
  removeLine,
  resolveCart,
  resolvedTotal,
  setLineQty,
} from './cart';

import {
  isCloudConfigured,
  pullFromCloud,
  setSnapshot,
} from './supabase';

export interface CartEntry {
  product: Product;
  quantity: number;
  /** Units still available for this product (0 once stock runs out). */
  remaining: number;
  /** Rounded price × quantity — the figure shown on the drawer/checkout line. */
  lineTotal: number;
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
  createInitialAdmin: (u: string, p: string) => { ok: boolean; error?: string };
  logout: () => void;

  cart: CartLine[];
  /** Adds to the cart. Returns how many units were actually added (0 = refused). */
  addToCart: (id: number, qty?: number) => number;
  setQty: (id: number, qty: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;

  /** Total units in the cart — the number on the navbar badge. */
  cartCount: number;
  /** Rounded subtotal. Always equals the sum of the per-line totals. */
  cartTotal: number;
  cartProducts: CartEntry[];

  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;

  toasts: Toast[];
  toast: (msg: string, type?: 'success' | 'error') => void;

  dbVersion: number;
}

const Ctx = createContext<StoreCtx>(null as never);
export const useStore = () => useContext(Ctx);

const SESSION_KEY = 'avyukta_session';
const CART_KEY = 'avyukta_cart';

/* --------------- fly-to-cart helper (used by product cards) --------------- */
export function flyToCart(srcEl: HTMLElement | null) {
  if (!srcEl) return;
  const target = document.getElementById('cart-btn');
  if (!target) return;
  const a = srcEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = srcEl.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.left = a.left + 'px';
  ghost.style.top = a.top + 'px';
  ghost.style.width = a.width + 'px';
  ghost.style.height = a.height + 'px';
  ghost.style.transition = 'all .8s cubic-bezier(.22,1,.36,1)';
  ghost.style.zIndex = '300';
  ghost.style.borderRadius = '50%';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    ghost.style.left = b.left + b.width / 2 - 12 + 'px';
    ghost.style.top = b.top + b.height / 2 - 12 + 'px';
    ghost.style.width = '24px';
    ghost.style.height = '24px';
    ghost.style.opacity = '0.2';
    ghost.style.transform = 'scale(.2) rotate(180deg)';
  });
  setTimeout(() => ghost.remove(), 850);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  });

  const [cart, setCart] = useState<CartLine[]>(() => {
    // The blob in localStorage is NOT trusted: it can be hand-edited, written by
    // an older build, or left over from another device. normalizeCart repairs
    // ids, merges duplicate lines and drops anything unusable, so we never start
    // a session in a state where the badge and the drawer disagree.
    try {
      return normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'));
    } catch {
      return [];
    }
  });

  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbVersion, setDbVersion] = useState(0);
  const [ready, setReady] = useState(false);

  /* ---------------- CART ---------------- */
  /**
   * The cart is mirrored in a ref and every write goes through `commitCart`.
   *
   * Why not `setCart(updater)`? Because two adds in the same tick both read the
   * same "previous" value, and because a value computed *inside* an updater is
   * not available until React runs it — which meant `addToCart` could not tell
   * the caller how many units it really added. Writing the ref synchronously
   * makes the cart a read-then-write that is always consistent, however many
   * times it is hit before React re-renders.
   */
  const cartRef = useRef<CartLine[]>(cart);
  cartRef.current = cart;

  const commitCart = useCallback((next: CartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  /** Reconcile the stored cart against the live catalog. */
  const reconcileCart = useCallback((lines: CartLine[]): CartLine[] => {
    const db = getDB();
    const next = normalizeCart(lines, (id) => {
      const p = db.products.find((x) => x.id === id);
      return p ? { stock: sellableStock(p) } : null;
    });
    const unchanged =
      next.length === lines.length &&
      next.every((l, i) => l.product_id === lines[i].product_id && l.quantity === lines[i].quantity);
    return unchanged ? lines : next;
  }, []);

  /**
   * Look up the product a cart action refers to, with the stock limit that
   * action is allowed to work within. Returns null when the product is gone or
   * not sellable, which is how phantom cart lines get stopped.
   */
  const limitsFor = useCallback(
    (id: number) => {
      const p = getDB().products.find((x) => x.id === id);
      return p ? { stock: sellableStock(p) } : null;
    },
    []
  );

  const addToCart = useCallback(
    (id: number, qty = 1) => {
      const limit = limitsFor(id);
      if (!limit || limit.stock <= 0) return 0;
      const before = cartRef.current.find((l) => l.product_id === id)?.quantity ?? 0;
      const next = addToLines(cartRef.current, id, qty, limit);
      const after = next.find((l) => l.product_id === id)?.quantity ?? 0;
      if (next === cartRef.current) return 0;
      commitCart(next);
      return Math.max(0, after - before);
    },
    [limitsFor, commitCart]
  );

  const setQty = useCallback(
    (id: number, qty: number) => {
      commitCart(setLineQty(cartRef.current, id, qty, limitsFor(id) || {}));
    },
    [limitsFor, commitCart]
  );

  const removeFromCart = useCallback(
    (id: number) => commitCart(removeLine(cartRef.current, id)),
    [commitCart]
  );

  const clearCart = useCallback(() => commitCart([]), [commitCart]);

  /* ---------------- DB change listener ---------------- */
  useEffect(() => {
    const fn = () => {
      setDbVersion((v) => v + 1);
      // A product can be deleted, hidden, or have its stock reduced at any time
      // (admin edit, cloud sync from another device). Re-reconcile the cart so
      // the badge, the drawer and the total never reference a product that is
      // no longer purchasable.
      if (cartRef.current.length > 0) commitCart(reconcileCart(cartRef.current));
    };
    window.addEventListener('avyukta-db-change', fn);
    return () => window.removeEventListener('avyukta-db-change', fn);
  }, [commitCart, reconcileCart]);

  /* ---------------- CLOUD INIT (pull-only, never auto-seed) ---------------- */
  useEffect(() => {
    if (!isCloudConfigured()) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const cloud = await pullFromCloud();
        if (cloud) {
          // Whatever Supabase returns IS the truth — even if every table is empty.
          replaceCache(cloud);
          setSnapshot(cloud);
        }
        // If pullFromCloud() returned null, the client isn't configured;
        // we DO NOT push anything up. The local empty cache stays empty.
      } catch (e) {
        console.warn('Cloud sync failed:', (e as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  /* ---------------- first reconciliation against the real catalog ----------
   * The cart is read from localStorage before the catalog is known, so lines
   * for products that no longer exist (or are no longer sellable) are still in
   * state at this point. Purge them once we have the catalog so storage stays
   * clean and a later price/stock change can never resurrect them. */
  useEffect(() => {
    if (!ready) return;
    if (cartRef.current.length > 0) commitCart(reconcileCart(cartRef.current));
  }, [ready, commitCart, reconcileCart]);

  /* ---------------- multi-tab sync ---------------- */
  useEffect(() => {
    const fn = (e: StorageEvent) => {
      if (e.key === DB_KEY) reloadFromStorage();
    };
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  }, []);

  /* ---------------- cart persistence ---------------- */
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  /* ---------------- session persistence ---------------- */
  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [session]);

  /* ---------------- toast ---------------- */
  const toast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---------------- AUTH ---------------- */
  const login = useCallback((username: string, password: string) => {
    const db = getDB();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
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
    const user: User = {
      id: nextId('users'),
      username: u,
      password_hash: hashPassword(password),
      role: 'customer',
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    saveDB();
    setSession({ user_id: user.id, username: user.username, role: 'customer' });
    return { ok: true };
  }, []);

  /**
   * First-run admin bootstrap. Only succeeds if the users table has NO admin
   * yet. Used by the Admin Login screen to set credentials on first launch.
   */
  const createInitialAdmin = useCallback((username: string, password: string) => {
    const db = getDB();
    if (db.users.some((u) => u.role === 'admin')) {
      return { ok: false, error: 'An admin user already exists.' };
    }
    const u = sanitize(username);
    if (u.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    const user: User = {
      id: nextId('users'),
      username: u,
      password_hash: hashPassword(password),
      role: 'admin',
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    saveDB();
    setSession({ user_id: user.id, username: user.username, role: 'admin' });
    return { ok: true };
  }, []);

  const logout = useCallback(() => setSession(null), []);



  /* ---------------- derived ---------------- */
  const db = ready ? getDB() : null;

  // Resolve the cart against the live catalog ONCE, then derive the badge count,
  // the drawer rows and the total from that same list. This is the fix for "the
  // badge says 2 but the drawer only has 1 / the total is for 1": previously the
  // badge summed the raw cart while the drawer and the total silently dropped
  // lines whose product could not be resolved.
  const cartProducts = useMemo<CartEntry[]>(() => {
    if (!db) return [];
    return resolveCart(
      cart,
      db.products.map((p) => ({ ref: p, id: p.id, price: p.price, available: sellableStock(p) }))
    ).map((line) => ({
      product: line.product.ref,
      quantity: line.quantity,
      remaining: line.remaining,
      lineTotal: line.lineTotal,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, db, dbVersion]);

  const cartCount = countUnits(cartProducts);
  const cartTotal = resolvedTotal(cartProducts);

  if (!ready) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#7f4c5a' }}>
        Loading…
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{
        session,
        login,
        register,
        createInitialAdmin,
        logout,
        cart,
        addToCart,
        setQty,
        removeFromCart,
        clearCart,
        cartCount,
        cartTotal,
        cartProducts,
        cartOpen,
        setCartOpen,
        toasts,
        toast,
        dbVersion,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
