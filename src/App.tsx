/** AVYUKTA — routing root. Storefront + protected admin panel. */
import { HashRouter, Routes, Route, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { StoreProvider } from './lib/store';
import { Navbar, Footer, CartDrawer } from './components/layout';
import { Petals, ToastStack, EmptyState } from './components/ui';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import Account from './pages/Account';
import AdminLogin from './admin/AdminLogin';
import AdminLayout from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import AdminProducts from './admin/Products';
import AdminCategories from './admin/Categories';
import AdminOrders from './admin/Orders';
import AdminSettings from './admin/Settings';

/** Storefront shell: navbar, petals, cart drawer, footer. Scrolls to top on route change. */
function StoreShell() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Petals count={12} />
      <Navbar />
      <main className="relative z-10 flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <EmptyState
        icon="🥀"
        title="404 — Page not found"
        sub="This petal seems to have drifted away. Let's get you back to the garden."
        action={<Link to="/" className="btn-grad rounded-full px-7 py-2.5 text-sm font-semibold">Back home</Link>}
      />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <ToastStack />
        <Routes>
          {/* customer storefront */}
          <Route element={<StoreShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* admin panel */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
