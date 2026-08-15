"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Activity,
  Bot,
  BookOpen,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  PlugZap,
  Settings,
  Sparkles,
  Webhook,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";

type NavigationIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const navigationItems: Array<{ href: string; label: string; icon: NavigationIcon }> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/brands", label: "Brands", icon: Palette },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/dashboard/ai", label: "AI", icon: Sparkles },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/workflows", label: "Workflows", icon: Workflow },
  { href: "/dashboard/schedules", label: "Schedules", icon: Clock3 },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/dashboard/integrations", label: "Integrations", icon: PlugZap },
  { href: "/dashboard/operations", label: "Usage / Operations", icon: Activity },
  { href: "/dashboard/settings", label: "Workspace / Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {navigationItems.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              active
                ? "bg-violet-50 font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white",
            )}
            href={href as Route}
            key={href}
            onClick={onNavigate}
          >
            <Icon aria-hidden className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <Link aria-label="Flowyn overview" className="flex items-center gap-3" href="/dashboard">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        <Sparkles aria-hidden className="h-4 w-4" />
      </span>
      <span className="font-semibold tracking-tight">Flowyn</span>
    </Link>
  );
}

export function FlowynShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !accountOpen) return;
    function closeMenus(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      setAccountOpen(false);
    }
    document.addEventListener("keydown", closeMenus);
    return () => document.removeEventListener("keydown", closeMenus);
  }, [accountOpen, mobileOpen]);

  async function handleSignOut() {
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/sign-out", {
        body: JSON.stringify({}),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Sign out failed");
      router.push("/sign-in");
      router.refresh();
    } catch {
      setSignOutError("We could not sign you out. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-950 dark:bg-[#0b1020] dark:text-white">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-slate-950 focus:shadow-lg" href="#main-content">
        Skip to main content
      </a>

      <aside aria-label="Flowyn sidebar" className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block dark:border-slate-800 dark:bg-slate-950">
        <BrandMark />
        <div className="mt-8">
          <WorkspaceSwitcher />
        </div>
        <div className="mt-8">
          <NavigationLinks />
        </div>
        <div className="absolute bottom-6 left-5 right-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Signed in</p>
          <p className="mt-2 truncate text-sm font-medium">{userEmail ?? "Local user"}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <BrandMark />
        <Button aria-controls="mobile-navigation" aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileOpen((open) => !open)} size="icon" variant="ghost">
          {mobileOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        </Button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" id="mobile-navigation">
          <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} type="button" />
          <aside aria-label="Mobile Flowyn navigation" className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <BrandMark />
              <Button aria-label="Close navigation" onClick={() => setMobileOpen(false)} size="icon" variant="ghost">
                <X aria-hidden className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-8">
              <WorkspaceSwitcher />
            </div>
            <div className="mt-8">
              <NavigationLinks onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <main className="lg:pl-64" id="main-content" tabIndex={-1}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
      </main>

      <div className="fixed bottom-4 right-4 z-30">
        <Button aria-expanded={accountOpen} aria-haspopup="menu" aria-label="Open account menu" onClick={() => setAccountOpen((open) => !open)} size="sm" variant="outline">
          <span className="max-w-36 truncate">{userEmail ?? "Account"}</span>
        </Button>
        {accountOpen ? (
          <div aria-label="Account menu" className="absolute bottom-12 right-0 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950" role="menu">
            <p className="truncate px-3 py-2 text-xs text-slate-500">{userEmail ?? "Local user"}</p>
            <Button className="w-full justify-start" onClick={handleSignOut} role="menuitem" variant="ghost">
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </Button>
            {signOutError ? <p aria-live="polite" className="px-3 pt-2 text-xs text-red-600">{signOutError}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
