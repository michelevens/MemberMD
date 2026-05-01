// ===== PortalShell =====
// Shared layout for every portal in MemberMD — admin, provider, patient,
// operator, superadmin all wrap their content in this component. Adapted
// from the EnnHealth PortalShellV3 pattern so the EnnHealth product
// family (EnnHealth psychiatry + MemberMD DPC) feels visually consistent.
//
// Mobile-native by design: vertical sidebar on desktop (≥lg), slide-out
// drawer below lg with a hamburger trigger and a translucent backdrop.
// Animations use motion/react (Framer Motion).
//
// Theming via the portalColor prop — pick teal / navy / sage / gold to
// tint the active nav row, avatar gradient, and accent glow. Defaults to
// MemberMD's existing teal/navy palette so an unthemed call still
// matches the current brand.

import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LogOut,
  ChevronDown,
  UserCircle,
  HelpCircle,
  Settings,
  Menu,
  X,
  Search,
} from "lucide-react";
import { NotificationBell } from "./NotificationBell";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
}

/**
 * Optional grouping for nav items. EnnHealth V3 uses a flat list (~10
 * items); MemberMD's PracticePortal has 30 items so it benefits from
 * V1-style uppercase section labels.
 */
export interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}

export type PortalColor = "teal" | "navy" | "sage" | "gold" | "stripe";

interface PortalShellProps {
  /** Brand label shown above the user profile (e.g. "Patient Portal"). */
  portalTitle: string;
  /** Optional brand icon shown next to the title. */
  portalIcon?: React.ComponentType<{ className?: string }>;
  /** Color theme — drives active nav, avatar, glow. Default: teal. */
  portalColor?: PortalColor;
  userName: string;
  userSubtitle?: string;
  userAvatar?: string;
  /** Either a flat list or grouped sections. */
  nav: NavItem[] | NavSection[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  notificationCount?: number;
  children: ReactNode;
  /** Page title shown in the top header. */
  headerTitle?: string;
  /** Custom React content placed in the header right slot before the bell. */
  headerActions?: ReactNode;
}

// ─── Color palette ──────────────────────────────────────────────────────────

const colorMap: Record<
  PortalColor,
  {
    gradient: string;
    active: string;
    activeText: string;
    hover: string;
    accent: string;
    glow: string;
    badge: string;
  }
> = {
  // MemberMD's existing brand — teal #27ab83 + navy #102a43.
  teal: {
    gradient: "from-[#27ab83] to-[#147d64]",
    active: "bg-gradient-to-r from-[#27ab83] to-[#147d64]",
    activeText: "text-white",
    hover: "hover:bg-[#27ab83]/[0.06]",
    accent: "#27ab83",
    glow: "shadow-[#27ab83]/20",
    badge: "bg-[#27ab83]",
  },
  // Deep navy — used for operator / superadmin scope.
  navy: {
    gradient: "from-[#102a43] to-[#243b53]",
    active: "bg-gradient-to-r from-[#102a43] to-[#243b53]",
    activeText: "text-white",
    hover: "hover:bg-[#102a43]/[0.06]",
    accent: "#102a43",
    glow: "shadow-[#102a43]/20",
    badge: "bg-[#102a43]",
  },
  // EnnHealth admin sage — preserved so MemberMD can match the
  // EnnHealth-family look when an admin moves between products.
  sage: {
    gradient: "from-[#4a7c6f] to-[#3d6a5e]",
    active: "bg-gradient-to-r from-[#4a7c6f] to-[#3d6a5e]",
    activeText: "text-white",
    hover: "hover:bg-[#4a7c6f]/[0.06]",
    accent: "#4a7c6f",
    glow: "shadow-[#4a7c6f]/20",
    badge: "bg-[#4a7c6f]",
  },
  // EnnHealth premium gold — for top-tier members or featured surfaces.
  gold: {
    gradient: "from-[#D4A855] to-[#C49745]",
    active: "bg-gradient-to-r from-[#D4A855] to-[#C49745]",
    activeText: "text-white",
    hover: "hover:bg-[#D4A855]/[0.06]",
    accent: "#D4A855",
    glow: "shadow-[#D4A855]/20",
    badge: "bg-[#D4A855]",
  },
  // Stripe-grade flat theme — used by portals adopting the new
  // information-density chrome. No gradients, no glows: a flat slate
  // active state with the Stripe-purple accent for badges + brand.
  // Visually disciplined like dashboard.stripe.com.
  stripe: {
    gradient: "from-[#635bff] to-[#544ee0]",
    active: "bg-slate-100 text-slate-900",
    activeText: "text-slate-900",
    hover: "hover:bg-slate-50",
    accent: "#635bff",
    glow: "",
    badge: "bg-[#635bff]",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

function isSectioned(nav: NavItem[] | NavSection[]): nav is NavSection[] {
  return nav.length > 0 && (nav[0] as NavSection).items !== undefined;
}

export function PortalShell({
  portalTitle,
  portalIcon: PortalIcon,
  portalColor = "teal",
  userName,
  userSubtitle,
  userAvatar,
  nav,
  activeTab,
  onTabChange,
  onLogout,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  notificationCount: _unused = 0,
  children,
  headerTitle,
  headerActions,
}: PortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const colors = colorMap[portalColor];

  const initials =
    userName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??";

  // Close the user menu when clicking outside.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const sections: NavSection[] = isSectioned(nav)
    ? nav
    : [{ id: "main", items: nav }];

  const isStripe = portalColor === "stripe";

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    if (isStripe) {
      // Stripe pattern: tighter rows, flat active background, no shadow,
      // active row gets a subtle left border accent in brand color and
      // mildly bolder text. Inactive rows are slate-600.
      return (
        <button
          key={item.id}
          onClick={() => {
            onTabChange(item.id);
            setSidebarOpen(false);
          }}
          className={`group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 rounded-md transition-colors text-[13px] ${
            isActive
              ? "bg-slate-100 text-slate-900 font-medium"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-slate-700" : "text-slate-400 group-hover:text-slate-600"}`} />
          <span className="truncate">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span
              className={`ml-auto text-[10px] h-4 min-w-4 px-1 rounded flex items-center justify-center font-semibold ${
                isActive ? "bg-white text-slate-700 border border-slate-200" : `${item.badgeColor || colors.badge} text-white`
              }`}
            >
              {item.badge}
            </span>
          )}
        </button>
      );
    }
    return (
      <button
        key={item.id}
        onClick={() => {
          onTabChange(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${
          isActive
            ? `${colors.active} ${colors.activeText} shadow-md ${colors.glow}`
            : `text-gray-600 ${colors.hover} hover:text-gray-900`
        }`}
      >
        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
        <span className="font-medium truncate">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={`ml-auto text-xs h-5 min-w-5 px-1.5 rounded-md flex items-center justify-center font-semibold ${
              isActive
                ? "bg-white/20 text-white"
                : `${item.badgeColor || colors.badge} text-white`
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className={`flex h-screen overflow-hidden ${
        isStripe
          ? "bg-slate-50"
          : "bg-gradient-to-br from-gray-50/80 via-white to-gray-50/50"
      }`}
    >
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
        h-full flex flex-col flex-shrink-0
        ${isStripe ? "bg-white border-r border-slate-200" : "bg-white border-r border-gray-200/60"}
        ${isStripe ? "w-[240px] min-w-[240px]" : "w-[260px] min-w-[260px]"}
        fixed inset-y-0 left-0 z-50
        transition-transform duration-300 ease-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:z-auto lg:translate-x-0
      `}
      >
        {/* Brand Section */}
        <div className={`${isStripe ? "px-4 py-3.5 border-b border-slate-200" : "p-4 border-b border-gray-200/40"}`}>
          <div className="flex items-center gap-2.5">
            <div
              className={
                isStripe
                  ? `w-7 h-7 rounded-md bg-[#635bff] flex items-center justify-center text-white font-semibold text-[13px]`
                  : `w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white font-bold text-lg shadow-md ${colors.glow}`
              }
            >
              {PortalIcon ? <PortalIcon className={isStripe ? "w-3.5 h-3.5" : "w-5 h-5"} /> : "M"}
            </div>
            <div className="flex-1 min-w-0">
              <p className={isStripe ? "text-[13px] text-slate-900 font-semibold tracking-tight truncate" : "text-sm text-gray-900 font-bold truncate"}>
                {portalTitle}
              </p>
              {!isStripe && (
                <p className="text-xs text-gray-500">MemberMD</p>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* User Profile */}
        <div className={`${isStripe ? "px-4 py-3 border-b border-slate-100" : "p-4 border-b border-gray-200/40"}`}>
          <div className="flex items-center gap-2.5">
            <div
              className={
                isStripe
                  ? `w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-[11px] font-semibold overflow-hidden`
                  : `w-10 h-10 rounded-full ring-2 ring-white shadow-md ${colors.glow} bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white text-sm font-semibold overflow-hidden`
              }
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={isStripe ? "text-[12px] text-slate-700 truncate font-medium" : "text-sm text-gray-900 truncate font-semibold"}>
                {userName.split(" ")[0]}
              </p>
              {userSubtitle && (
                <p className={isStripe ? "text-[11px] text-slate-400 truncate" : "text-xs text-gray-500 truncate"}>{userSubtitle}</p>
              )}
            </div>
            {!isStripe && (
              <div
                className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                title="Online"
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={isStripe ? "flex-1 px-2 py-2 overflow-y-auto" : "flex-1 px-3 py-3 overflow-y-auto"}>
          {sections.map((section, i) => (
            <div key={section.id} className={i > 0 ? (isStripe ? "mt-3" : "mt-4") : ""}>
              {section.label && (
                <p className={
                  isStripe
                    ? "px-2.5 mt-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                    : "px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                }>
                  {section.label}
                </p>
              )}
              <div className={isStripe ? "space-y-0.5" : "space-y-1"}>
                {section.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer — sign out */}
        <div className={isStripe ? "p-2 border-t border-slate-100" : "p-3 border-t border-gray-200/40"}>
          <button
            onClick={onLogout}
            className={
              isStripe
                ? "w-full flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 rounded-md text-[13px] text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                : "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50/50 transition-all duration-200"
            }
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className={
          isStripe
            ? "h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0"
            : "h-16 bg-white border-b border-gray-200/60 flex items-center justify-between px-4 lg:px-6 flex-shrink-0"
        }>
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            {headerTitle && (
              <h1 className={
                isStripe
                  ? "text-[15px] text-slate-900 font-semibold tracking-tight truncate"
                  : "text-lg text-gray-900 font-bold truncate"
              }>
                {headerTitle}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search (placeholder — feature TBD) */}
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-100/60 rounded-xl text-sm text-gray-400 w-56 lg:w-64">
              <Search className="w-4 h-4" />
              <span>Search…</span>
            </div>

            {headerActions}

            {/* Notifications — self-contained: polls unread count and
                manages its own popover. The legacy notificationCount
                prop is ignored (kept on the interface for callers that
                still pass it; the bell now reads from the API). */}
            <NotificationBell />

            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white text-xs font-semibold overflow-hidden`}
                >
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <span className="hidden sm:block text-sm text-gray-700 font-medium max-w-[120px] truncate">
                  {userName.split(" ")[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-gray-200/60 rounded-xl shadow-lg overflow-hidden z-50"
                  >
                    <div className="px-3 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {userName}
                      </p>
                      {userSubtitle && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {userSubtitle}
                        </p>
                      )}
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          onTabChange("profile");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <UserCircle className="w-4 h-4" /> Profile
                      </button>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          onTabChange("settings");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Settings className="w-4 h-4" /> Settings
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <HelpCircle className="w-4 h-4" /> Help Center
                      </button>
                    </div>
                    <div className="border-t border-gray-100 py-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50/60"
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content — fades on tab change for a polished feel */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
