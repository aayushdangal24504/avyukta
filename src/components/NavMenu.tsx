/** Responsive navigation menu.
 *
 *  - Single hamburger trigger (☰) shown on the LEFT of the header at all sizes.
 *  - Desktop: clicking ☰ opens a side-flyout panel (slide + fade) anchored to the
 *    left edge. The existing top-nav links remain visible to the right of the logo.
 *    "Explore Categories" expands inside the panel.
 *  - Mobile: clicking ☰ slides in a full-height drawer from the left. The top-nav
 *    links are hidden via CSS; the drawer is the only nav. Body scroll is locked.
 *  - Esc closes any open variant. Click-outside closes the desktop flyout.
 *  - Active route is highlighted. Focus is managed (focus moves into the menu on
 *    open, returns to the trigger on close, focus trap inside drawer).
 *  - Categories are read from getCategoriesSorted() so the menu auto-syncs with
 *    whatever categories exist in the DB / Supabase.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getCategoriesSorted, getSetting } from '../lib/db';
import { useStore } from '../lib/store';
import { SafeImage } from './ui';

/* ----------------------------- nav definition ----------------------------- */
/** One single source of truth for the menu. Add/remove items here and both the
 *  desktop flyout and the mobile drawer will pick them up automatically. */
interface NavItem {
  to: string;
  label: string;
  end?: boolean; // for NavLink: exact match
  /** When set, the link adapts to the current session (e.g. My Orders vs Account). */
  dynamic?: 'account';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/shop?cat=all', label: 'Shop All' },
  { to: '/track', label: 'Track Order' },
  { to: '/account', label: 'Account', dynamic: 'account' },
];

/* ----------------------------- hamburger button --------------------------- */
function HamburgerButton({
  open,
  onClick,
  label,
  buttonRef,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      aria-controls="avyukta-nav-menu"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-md ring-1 ring-rose-100 transition active:scale-95 hover:shadow-lg"
    >
      <div className="relative h-4 w-5">
        <span
          className={`absolute left-0 top-0 block h-0.5 w-5 rounded-full bg-[#7f4c5a] transition-all duration-300 ${
            open ? 'translate-y-[7px] rotate-45' : ''
          }`}
        />
        <span
          className={`absolute left-0 top-1.5 block h-0.5 w-5 rounded-full bg-[#7f4c5a] transition-all duration-300 ${
            open ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <span
          className={`absolute left-0 top-3 block h-0.5 w-5 rounded-full bg-[#7f4c5a] transition-all duration-300 ${
            open ? '-translate-y-[7px] -rotate-45' : ''
          }`}
        />
      </div>
    </button>
  );
}

/* -------------------------------- nav menu -------------------------------- */
export function NavMenu() {
  const { session, logout, dbVersion } = useStore();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [catOpen, setCatOpen] = useState(true);
  const [contactOpen, setContactOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const nav = useNavigate();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  /* ---- detect viewport ---- */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const fn = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    fn(mq);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  /* ---- close on route change ---- */
  useEffect(() => {
    if (open) closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* ---- esc to close ---- */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---- body scroll lock (mobile drawer) ---- */
  useEffect(() => {
    if (open && isMobile) {
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
    }
    return () => document.body.classList.remove('menu-open');
  }, [open, isMobile]);

  /* ---- focus management ---- */
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => {
        const first = panelRef.current?.querySelector<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      }, 80);
      return () => window.clearTimeout(t);
    } else {
      const t = window.setTimeout(() => {
        triggerRef.current?.focus();
      }, 320);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  /* ---- focus trap inside mobile drawer ---- */
  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isMobile]);

  /* ---- cleanup pending close timer on unmount ---- */
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      document.body.classList.remove('menu-open');
    };
  }, []);

  /* ---- handlers ---- */
  const openMenu = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setOpen(true);
  };

  const closeMenu = () => {
    if (!open) return;
    setClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, isMobile ? 240 : 220);
  };

  const handleCategoryClick = (id: number) => {
    if (id === 0) {
      nav('/shop');
    } else {
      nav(`/shop?cat=${id}`);
    }
    closeMenu();
  };

  const handleNavClick = () => closeMenu();

  /* ---- categories: re-reads on db changes ---- */
  void dbVersion;
  const categories = getCategoriesSorted();

  /* ---- the active link detection ---- */
  const isLinkActive = (to: string, end?: boolean) => {
    const [path] = to.split('?');
    if (end) return location.pathname === path;
    return location.pathname === path;
  };

  /* ---- resolved items ---- */
  const accountLabel =
    session && session.role === 'customer' ? 'My Orders' : 'Account';
  const items: NavItem[] = NAV_ITEMS.map((i) =>
    i.dynamic === 'account' ? { ...i, label: accountLabel } : i
  );

  /* ---- contact us (same socials as top-bar Contact Us button) ---- */
  const contactItems = (
    [
      { label: 'Instagram', icon: '📷', url: getSetting('instagram') },
      { label: 'TikTok', icon: '♪', url: getSetting('tiktok') },
      { label: 'WhatsApp', icon: '💬', url: getSetting('whatsapp') },
    ] as { label: string; icon: string; url: string }[]
  ).filter((i) => !!i.url);

  /* ---- panel content (shared between mobile drawer and desktop flyout) ---- */
  const PanelContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* panel header */}
      <div className="flex items-center justify-between border-b border-rose-100 px-5 py-4">
        <span className="font-display text-base font-bold tracking-[0.18em] text-[#7f4c5a]">
          ✿ Menu
        </span>
        <button
          type="button"
          onClick={closeMenu}
          aria-label="Close menu"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm shadow ring-1 ring-rose-100 transition hover:rotate-90"
        >
          ✕
        </button>
      </div>

      {/* scrollable nav area */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        aria-label="Primary"
      >
        <ul className="space-y-1">
          {items.map((it, i) => {
            return (
              <li
                key={it.to}
                className="menu-stagger"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <NavLink
                  to={it.to}
                  end={it.end}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      isActive || isLinkActive(it.to, it.end)
                        ? 'bg-gradient-to-r from-[#b56576]/10 to-[#d291bc]/10 text-[#b56576] ring-1 ring-rose-200'
                        : 'text-[#5d4954] hover:bg-rose-50/70 hover:text-[#b56576]'
                    }`
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {it.label}
                </NavLink>
              </li>
            );
          })}

          {/* ---- Explore Categories (accordion) ---- */}
          <li
            className="menu-stagger pt-2"
            style={{ animationDelay: `${items.length * 35}ms` }}
          >
            <button
              type="button"
              onClick={() => setCatOpen((v) => !v)}
              aria-expanded={catOpen}
              aria-controls="nav-categories"
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                location.pathname === '/shop' && location.search.includes('cat=')
                  ? 'bg-gradient-to-r from-[#b56576]/10 to-[#d291bc]/10 text-[#b56576] ring-1 ring-rose-200'
                  : 'text-[#5d4954] hover:bg-rose-50/70 hover:text-[#b56576]'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                Explore Categories
              </span>
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 transition-transform duration-300 ${
                  catOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 7.5l5 5 5-5" />
              </svg>
            </button>

            <div
              id="nav-categories"
              className={catOpen ? 'menu-accordion-down' : 'menu-accordion-up'}
              aria-hidden={!catOpen}
            >
              <ul className="mt-1 space-y-0.5 pl-4">
                <li>
                  <button
                    type="button"
                    onClick={() => handleCategoryClick(0)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      location.pathname === '/shop' && !location.search.includes('cat=')
                        ? 'bg-rose-50 text-[#b56576] font-semibold'
                        : 'text-[#6b5560] hover:bg-rose-50/60 hover:text-[#b56576]'
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[#b56576]/20 to-[#d291bc]/20 text-[10px] font-bold text-[#b56576]">
                      ✿
                    </span>
                    <span>All Categories</span>
                  </button>
                </li>
                {categories.map((c) => {
                  const active =
                    location.pathname === '/shop' &&
                    location.search.includes(`cat=${c.id}`);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleCategoryClick(c.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? 'bg-rose-50 text-[#b56576] font-semibold'
                            : 'text-[#6b5560] hover:bg-rose-50/60 hover:text-[#b56576]'
                        }`}
                      >
                        <SafeImage
                          src={c.image}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-md ring-1 ring-rose-100"
                          imgClassName="object-cover"
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
                {categories.length === 0 && (
                  <li className="px-3 py-2 text-xs italic text-rose-300">
                    No categories yet
                  </li>
                )}
              </ul>
            </div>
          </li>

          {/* ---- Contact Us (accordion) — same links as the top-bar Contact Us button ---- */}
          {contactItems.length > 0 && (
            <li
              className="menu-stagger pt-2"
              style={{ animationDelay: `${(items.length + 1) * 35}ms` }}
            >
              <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                aria-expanded={contactOpen}
                aria-controls="nav-contact"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-[#5d4954] transition-all hover:bg-rose-50/70 hover:text-[#b56576]"
              >
                <span className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  Contact Us
                </span>
                <svg
                  viewBox="0 0 20 20"
                  className={`h-4 w-4 transition-transform duration-300 ${
                    contactOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 7.5l5 5 5-5" />
                </svg>
              </button>

              <div
                id="nav-contact"
                className={contactOpen ? 'menu-accordion-down' : 'menu-accordion-up'}
                aria-hidden={!contactOpen}
              >
                <ul className="mt-1 space-y-0.5 pl-4">
                  {contactItems.map((it) => (
                    <li key={it.label}>
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={handleNavClick}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#6b5560] transition hover:bg-rose-50/60 hover:text-[#b56576]"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#fcd5ce] to-[#f8b4c0] text-xs">
                          {it.icon}
                        </span>
                        <span>{it.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          )}
        </ul>

        {/* ---- account / auth footer ---- */}
        <div className="mt-6 border-t border-rose-100 pt-4">
          {session && session.role === 'customer' ? (
            <button
              type="button"
              onClick={() => {
                logout();
                closeMenu();
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-[#b56576] transition hover:bg-rose-100"
            >
              <span>🚪</span>
              <span>
                Logout{' '}
                <span className="font-normal text-rose-400">({session.username})</span>
              </span>
            </button>
          ) : (
            <Link
              to="/account"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-[#b56576] to-[#d291bc] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <span>🌷</span>
              <span>Sign in / Create account</span>
            </Link>
          )}
        </div>
      </nav>

      {/* ---- desktop-only admin shortcut ---- */}
      {!isMobile && (
        <div className="border-t border-rose-100 px-3 py-3">
          <NavLink
            to="/admin"
            onClick={handleNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-[#7f4c5a] text-white'
                  : 'text-[#7f4c5a] hover:bg-[#7f4c5a]/10'
              }`
            }
          >
            <span>⚙️</span>
            <span>Admin Panel</span>
          </NavLink>
        </div>
      )}

      {/* ---- footer note ---- */}
      <div className="border-t border-rose-100 px-5 py-3 text-center text-[10px] uppercase tracking-[0.25em] text-rose-300">
        ✿ Crafted with love
      </div>
    </div>
  );

  return (
    <>
      {/* the always-visible hamburger trigger (stays inside the header) */}
      <HamburgerButton
        open={open}
        onClick={open ? closeMenu : openMenu}
        label={open ? 'Close menu' : 'Open menu'}
        buttonRef={triggerRef}
      />

      {/* panel + scrim rendered via a portal into document.body
          so they escape any header stacking context (backdrop-filter, transform, etc.)
          that would otherwise clip a position:fixed child. */}
      {open &&
        createPortal(
          isMobile ? (
            <>
              {/* mobile scrim */}
              <div
                className={`fixed inset-0 z-[90] bg-[#41323a]/55 backdrop-blur-sm ${
                  closing ? 'menu-overlay-out' : 'menu-overlay-in'
                }`}
                onClick={closeMenu}
                aria-hidden
              />
              <aside
                id="avyukta-nav-menu"
                ref={panelRef as React.Ref<HTMLElement>}
                role="dialog"
                aria-modal="true"
                aria-label="Main menu"
                className={`fixed left-0 top-0 z-[95] flex h-full w-[88%] max-w-sm flex-col bg-[#fffaf0] shadow-2xl ring-1 ring-rose-100 ${
                  closing ? 'menu-drawer-out' : 'menu-drawer-in'
                }`}
              >
                {PanelContent}
              </aside>
            </>
          ) : (
            <>
              {/* desktop click-outside catcher (rendered below the panel in z-order) */}
              {!closing && (
                <div
                  className="fixed inset-0 z-[85]"
                  onClick={closeMenu}
                  aria-hidden
                />
              )}
              <aside
                id="avyukta-nav-menu"
                ref={panelRef as React.Ref<HTMLElement>}
                role="dialog"
                aria-modal="false"
                aria-label="Main menu"
                style={{ top: '72px' }}
                className={`fixed left-3 z-[88] flex max-h-[calc(100vh-90px)] w-[320px] origin-top-left flex-col overflow-hidden rounded-2xl bg-[#fffaf0] shadow-2xl ring-1 ring-rose-100 ${
                  closing ? 'menu-flyout-out' : 'menu-flyout-in'
                }`}
              >
                {PanelContent}
              </aside>
            </>
          ),
          document.body
        )}
    </>
  );
}
