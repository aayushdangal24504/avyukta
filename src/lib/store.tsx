/**
 * Global app state: session auth, cart, toast notifications.
 * FIXED: waits for cloud DB before allowing UI to use data
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  User,
  Product,
  DB_KEY
} from './db';

import {
  isCloudConfigured,
  pullFromCloud,
  pushToCloud,
  setSnapshot,
  isPushPending
} from './supabase';

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

  dbVersion: number;
}

const Ctx = createContext<StoreCtx>(null as never);
export const useStore = () => useContext(Ctx);

const SESSION_KEY = 'avyukta_session';
const CART_KEY = 'avyukta_cart';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbVersion, setDbVersion] = useState(0);

  // 🔥 NEW: prevents UI from rendering before DB is ready
  const [ready, setReady] = useState(false);

  /* ---------------- DB change listener ---------------- */
  useEffect(() => {
    const fn = () => setDbVersion(v => v + 1);
    window.addEventListener('avyukta-db-change', fn);
    return () => window.removeEventListener('avyukta-db-change', fn);
  }, []);

  /* ---------------- CLOUD INIT (FIXED CORE BUG) ---------------- */
  useEffect(() => {
    if (!isCloudConfigured()) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const cloud = await pullFromCloud();

        if (cloud) {
          replaceCache(cloud);
          setSnapshot(cloud);
        } else {
          await pushToCloud(getDB());
        }
      } catch (e) {
        console.warn('Cloud sync failed:', (e as Error).message);
      } finally {
        setReady(true); // 🔥 CRITICAL FIX
      }
    })();
  }, []);

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
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  /* ---------------- AUTH ---------------- */
  const login = useCallback((username: string, password: string) => {
    const db = getDB();

    const user = db.users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!user || !checkPassword(password, user.password_hash)) {
      return { ok: false, error: 'Invalid username or password.' };
    }

    setSession({
      user_id: user.id,
      username: user.username,
      role: user.role
    });

    return { ok: true, role: user.role };
  }, []);

  const register = useCallback((username: string, password: string) => {
    const u = sanitize(username);

    if (u.length < 3)
      return { ok: false, error: 'Username must be at least 3 characters.' };

    if (password.length < 6)
      return { ok: false, error: 'Password must be at least 6 characters.' };

    const db = getDB();

    if (db.users.some(x => x.username.toLowerCase() === u.toLowerCase()))
      return { ok: false, error: 'Username is already taken.' };

    const user: User = {
      id: nextId('users'),
      username: u,
      password_hash: hashPassword(password),
      role: 'customer',
      created_at: new Date().toISOString()
    };

    db.users.push(user);
    saveDB(db);

    setSession({
      user_id: user.id,
      username: user.username,
      role: 'customer'
    });

    return { ok: true };
  }, []);

  const logout = useCallback(() => setSession(null), []);

  /* ---------------- CART ---------------- */
  const addToCart = useCallback((id: number, qty = 1) => {
    setCart(c => {
      const ex = c.find(i => i.product_id === id);
      if (ex)
        return c.map(i =>
          i.product_id === id
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      return [...c, { product_id: id, quantity: qty }];
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setCart(c =>
      qty <= 0
        ? c.filter(i => i.product_id !== id)
        : c.map(i =>
            i.product_id === id ? { ...i, quantity: qty } : i
          )
    );
  }, []);

  const removeFromCart = useCallback(
    (id: number) => setCart(c => c.filter(i => i.product_id !== id)),
    []
  );

  const clearCart = useCallback(() => setCart([]), []);

  /* ---------------- DB derived (SAFE AFTER READY) ---------------- */
  const db = ready ? getDB() : null;

  const cartProducts =
    db
      ? cart
          .map(i => ({
            product: db.products.find(p => p.id === i.product_id)!,
            quantity: i.quantity
          }))
          .filter(x => x.product)
      : [];

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const cartTotal = cartProducts.reduce(
    (s, i) => s + i.product.price * i.quantity,
    0
  );

  /* ---------------- BLOCK UNTIL READY (🔥 KEY FIX) ---------------- */
  if (!ready) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        Loading store...
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{
        session,
        login,
        register,
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
        dbVersion
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
