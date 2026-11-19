import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  PlusCircle,
  Bot,
  Clapperboard,
  Youtube,
  History,
  Disc3,
  BarChart3,
  CalendarClock,
  Plug,
  Settings,
  LogOut,
  Radio,
  MonitorPlay,
  Menu,
  Newspaper,
  Flame,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { isOptionalNavVisible, NAV_PREFS_EVENT, readNavPrefs, type OptionalNavId } from "@/lib/nav-prefs";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  optionalId?: OptionalNavId;
};

const NAV: NavItem[] = [
  { to: "/job-alerts", label: "Job Alerts", icon: Newspaper },
  { to: "/viral-topics", label: "Viral Topics", icon: Flame },
  { to: "/youtube", label: "YouTube", icon: Youtube },
  { to: "/agents", label: "AI Agents", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/integrations", label: "Integrations", icon: Plug, optionalId: "integrations" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, optionalId: "dashboard" },
  { to: "/interviews/new", label: "Create Show", icon: PlusCircle, optionalId: "interviews-new" },
  { to: "/studio", label: "Live Interview Studio", icon: Clapperboard, optionalId: "studio" },
  { to: "/live-broadcast", label: "Live Broadcast", icon: Radio, optionalId: "live-broadcast" },
  { to: "/obs", label: "OBS Output", icon: MonitorPlay, optionalId: "obs" },
  { to: "/history", label: "Interview History", icon: History, optionalId: "history" },
  { to: "/recordings", label: "Recordings", icon: Disc3, optionalId: "recordings" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, optionalId: "analytics" },
  { to: "/schedule", label: "Schedule", icon: CalendarClock, optionalId: "schedule" },
];

function useVisibleNav() {
  const [prefs, setPrefs] = useState(readNavPrefs);
  useEffect(() => {
    const sync = () => setPrefs(readNavPrefs());
    window.addEventListener(NAV_PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(NAV_PREFS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return NAV.filter((item) => !item.optionalId || isOptionalNavVisible(item.optionalId, prefs));
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = useVisibleNav();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {items.map((item) => {
        const active = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {item.label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/job-alerts" className="flex items-center gap-2.5 px-6 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
        <Radio className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-sm font-bold">Job Alert Studio</div>
        <div className="text-[11px] text-muted-foreground">YouTube Shorts</div>
      </div>
    </Link>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const footer = (
    <div className="border-t border-sidebar-border p-3">
      <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-background">
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="shrink-0">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <NavList />
        </div>
        <div className="shrink-0">{footer}</div>
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex h-full w-[min(100%,18rem)] flex-col overflow-hidden bg-sidebar p-0 sm:max-w-xs">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="shrink-0">
            <Brand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <div className="shrink-0">{footer}</div>
        </SheetContent>
      </Sheet>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex shrink-0 items-center gap-3 border-b bg-card/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <span className="truncate font-display font-bold">Job Alert Studio</span>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="z-20 flex shrink-0 flex-col gap-3 border-b border-border/80 bg-card px-4 py-5 sm:gap-4 sm:px-6 sm:py-6 md:flex-row md:items-end md:justify-between lg:px-10">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-10", className)}>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-surface/50 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-primary/10 text-primary border-primary/30",
    live: "bg-primary/10 text-primary border-primary/30",
    connected: "bg-primary/10 text-primary border-primary/30",
    completed: "bg-primary/10 text-primary border-primary/30",
    complete: "bg-primary/10 text-primary border-primary/30",
    stopped: "bg-warning/15 text-warning border-warning/30",
    failed: "bg-destructive/10 text-destructive border-destructive/30",
    draft: "bg-muted text-muted-foreground border-border",
    scheduled: "bg-secondary/10 text-secondary border-secondary/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {(status === "running" || status === "live" || status === "connected") && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-live-pulse" />
      )}
      {status}
    </span>
  );
}
