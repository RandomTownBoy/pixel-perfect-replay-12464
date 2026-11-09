import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Sparkles, Gamepad2, Library, MonitorPlay, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUser, useCloudSync, useLive } from "@/lib/cloud";
import { LiveConsole } from "@/components/LiveConsole";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/gimmicks", label: "Gimmicks", icon: Gamepad2 },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/bank", label: "Question Bank", icon: Library },
  { to: "/studio", label: "Overlay Studio", icon: MonitorPlay },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function useOverlayConnected() {
  return useLive((l) => l.overlayConnected);
}
export function overlayUrl(token: string | null) {
  return typeof window !== "undefined" && token ? `${window.location.origin}/overlay/${token}` : "";
}

export function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
      {connected ? "Overlay terhubung" : "Overlay belum dibuka"}
    </span>
  );
}

export function AppShell() {
  const connected = useOverlayConnected();
  const { user } = useAuthUser();
  const ready = useCloudSync(user?.id);
  const nav = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); };
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} 
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "!bg-sidebar-accent !text-sidebar-accent-foreground shadow-glow" }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <StatusPill connected={connected} />
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          <button onClick={signOut} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" /> Keluar</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <Brand />
          <button onClick={signOut} aria-label="Keluar"><LogOut className="h-4 w-4 text-muted-foreground" /></button>
        </header>
        <main className="flex-1 p-4 pb-36 md:p-8 md:pb-24">{ready ? <Outlet /> : <p className="text-sm text-muted-foreground">Menyambungkan studio…</p>}</main>
        {ready && <LiveConsole />}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-sidebar/95 backdrop-blur md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} 
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground" activeProps={{ className: "!text-primary" }}>
              <n.icon className="h-5 w-5" /> {n.label.split(" ")[0]}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-party font-display text-lg font-black shadow-pop">K</span>
      <span className="font-display text-sm font-bold leading-none">KYOKA<br /><span className="text-[10px] tracking-[0.25em] text-muted-foreground">LIVE STUDIO</span></span>
    </Link>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
